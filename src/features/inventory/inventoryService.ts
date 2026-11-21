import * as Network from 'expo-network';
import type { LocationRow } from '@/lib/database.types';
import {
  type OfflineStorageDriver,
  getDefaultOfflineDriver,
} from '@/lib/offlineDb';
import {
  enqueueMovement,
  flushMovementQueue,
  generateMovementId,
  isLikelyNetworkError,
  type FlushQueueResult,
} from '@/lib/offlineQueue';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { daysUntilExpiry, isValidIsoDate } from './fefo';
import { buildSearchIndex } from './search';
import type {
  Batch,
  BatchStockEntry,
  Category,
  InventoryItemSummary,
  InventorySnapshot,
  ItemUnit,
  ManualMovementType,
  MovementPayload,
  ParLevel,
  ReasonCode,
  RecentMovementItem,
  StockBreakdown,
  StockCondition,
  StockHealthStatus,
  StockLevelRecord,
} from './types';

function snapshotCacheKey(hospitalId: string): string {
  return `inventory_snapshot_${hospitalId}`;
}

export async function checkIsOnline(): Promise<boolean> {
  if (!isSupabaseConfigured) {
    return false;
  }
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false || state.isInternetReachable === false) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export interface SnapshotBuilderInput {
  hospitalId: string;
  locations: LocationRow[];
  categories: Category[];
  suppliersById: Record<string, string>;
  items: {
    id: string;
    hospital_id: string;
    sku: string;
    name: string;
    category_id: string | null;
    base_unit: string;
    barcode: string | null;
    criticality: 'A' | 'B' | 'C';
    is_controlled: boolean;
    is_cold_chain: boolean;
    tracks_batch: boolean;
    tracks_expiry: boolean;
    unit_cost: number;
    supplier_id: string | null;
  }[];
  units: ItemUnit[];
  batches: Batch[];
  parLevels: ParLevel[];
  stockLevels: StockLevelRecord[];
  reasonCodes: ReasonCode[];
  syncedAt?: string;
}

export function buildInventorySnapshot(input: SnapshotBuilderInput): InventorySnapshot {
  const categoryNameById = new Map<string, string>();
  for (const cat of input.categories) {
    categoryNameById.set(cat.id, cat.name);
  }

  const locationNameById = new Map<string, string>();
  for (const loc of input.locations) {
    locationNameById.set(loc.id, loc.name);
  }

  const batchById = new Map<string, Batch>();
  for (const batch of input.batches) {
    batchById.set(batch.id, batch);
  }

  const unitsByItem = new Map<string, ItemUnit[]>();
  for (const unit of input.units) {
    const existing = unitsByItem.get(unit.itemId) ?? [];
    existing.push(unit);
    unitsByItem.set(unit.itemId, existing);
  }

  const parByItem = new Map<string, ParLevel[]>();
  for (const par of input.parLevels) {
    const existing = parByItem.get(par.itemId) ?? [];
    existing.push(par);
    parByItem.set(par.itemId, existing);
  }

  const stockByItem = new Map<string, StockLevelRecord[]>();
  for (const level of input.stockLevels) {
    const existing = stockByItem.get(level.itemId) ?? [];
    existing.push(level);
    stockByItem.set(level.itemId, existing);
  }

  const summaries: InventoryItemSummary[] = input.items.map((raw) => {
    const itemUnits = unitsByItem.get(raw.id) ?? [
      { itemId: raw.id, unit: raw.base_unit, factorToBase: 1, isOrderPack: true },
    ];
    itemUnits.sort((a, b) => a.factorToBase - b.factorToBase);

    const byLocation: Record<string, StockBreakdown> = {};
    const ensureLoc = (locId: string): StockBreakdown => {
      if (!byLocation[locId]) {
        byLocation[locId] = {
          usable: 0,
          available: 0,
          reserved: 0,
          damaged: 0,
          expired: 0,
          quarantined: 0,
          minQty: null,
          parQty: null,
          maxQty: null,
        };
      }
      return byLocation[locId];
    };

    let totalMin = 0;
    let totalPar = 0;
    let totalMax = 0;
    for (const par of parByItem.get(raw.id) ?? []) {
      const loc = ensureLoc(par.locationId);
      loc.minQty = par.minQty;
      loc.parQty = par.parQty;
      loc.maxQty = par.maxQty;
      totalMin += par.minQty;
      totalPar += par.parQty;
      totalMax += par.maxQty;
    }

    let totalUsable = 0;
    let totalAvailable = 0;
    let earliestExpiry: string | null = null;
    const batchStocks: BatchStockEntry[] = [];

    for (const level of stockByItem.get(raw.id) ?? []) {
      const loc = ensureLoc(level.locationId);
      const batch = level.batchId ? batchById.get(level.batchId) : undefined;
      const availableQty = Math.max(level.qty - level.reservedQty, 0);

      if (level.condition === 'usable') {
        loc.usable += level.qty;
        loc.reserved += level.reservedQty;
        loc.available += availableQty;
        totalUsable += level.qty;
        totalAvailable += availableQty;

        if (level.qty > 0 && batch?.expiryDate) {
          if (!earliestExpiry || batch.expiryDate < earliestExpiry) {
            earliestExpiry = batch.expiryDate;
          }
        }
      } else if (level.condition === 'damaged') {
        loc.damaged += level.qty;
      } else if (level.condition === 'expired') {
        loc.expired += level.qty;
      } else if (level.condition === 'quarantined') {
        loc.quarantined += level.qty;
      }

      if (level.qty > 0) {
        batchStocks.push({
          batchId: level.batchId,
          batchNo: batch?.batchNo ?? 'NO-BATCH',
          expiryDate: batch?.expiryDate ?? null,
          batchCreatedAt: batch?.createdAt ?? '',
          locationId: level.locationId,
          locationName: locationNameById.get(level.locationId) ?? 'Location',
          condition: level.condition,
          qty: level.qty,
          reservedQty: level.reservedQty,
          availableQty,
        });
      }
    }

    const daysLeft = daysUntilExpiry(earliestExpiry);
    let status: StockHealthStatus = 'healthy';
    if (totalUsable <= 0) {
      status = 'out';
    } else if ((totalMin > 0 && totalUsable <= totalMin) || (totalPar > 0 && totalUsable < totalPar)) {
      status = 'low';
    } else if (daysLeft !== null && daysLeft <= 90) {
      status = 'expiring';
    }

    const summary: InventoryItemSummary = {
      id: raw.id,
      hospitalId: raw.hospital_id,
      sku: raw.sku,
      name: raw.name,
      categoryId: raw.category_id,
      categoryName: raw.category_id ? (categoryNameById.get(raw.category_id) ?? '') : '',
      baseUnit: raw.base_unit,
      barcode: raw.barcode,
      criticality: raw.criticality,
      isControlled: raw.is_controlled,
      isColdChain: raw.is_cold_chain,
      tracksBatch: raw.tracks_batch,
      tracksExpiry: raw.tracks_expiry,
      unitCost: Number(raw.unit_cost),
      supplierName: raw.supplier_id ? (input.suppliersById[raw.supplier_id] ?? null) : null,
      units: itemUnits,
      totalUsable,
      totalAvailable,
      totalMin,
      totalPar,
      totalMax,
      earliestExpiry,
      daysToExpiry: daysLeft,
      status,
      byLocation,
      batchStocks,
    };

    summary._searchIndex = buildSearchIndex(summary);
    return summary;
  });

  return {
    hospitalId: input.hospitalId,
    items: summaries,
    categories: input.categories,
    reasonCodes: input.reasonCodes,
    locations: input.locations,
    lastSyncedAt: input.syncedAt ?? new Date().toISOString(),
  };
}

export async function loadCachedSnapshot(
  hospitalId: string,
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<InventorySnapshot | null> {
  return driver.getCache<InventorySnapshot>(snapshotCacheKey(hospitalId));
}

export async function fetchAndCacheInventory(
  hospitalId: string,
  locations: LocationRow[],
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<{ snapshot: InventorySnapshot; isOffline: boolean }> {
  const online = await checkIsOnline();
  const cached = await loadCachedSnapshot(hospitalId, driver);

  if (!online) {
    if (cached) {
      return { snapshot: cached, isOffline: true };
    }
    return {
      snapshot: {
        hospitalId,
        items: [],
        categories: [],
        reasonCodes: [],
        locations,
        lastSyncedAt: '',
      },
      isOffline: true,
    };
  }

  try {
    const [
      catRes,
      supRes,
      itemsRes,
      unitsRes,
      batchesRes,
      parRes,
      levelsRes,
      reasonsRes,
    ] = await Promise.all([
      supabase.from('categories').select('id, hospital_id, name, slug').eq('hospital_id', hospitalId).order('name'),
      supabase.from('suppliers').select('id, name').eq('hospital_id', hospitalId),
      supabase
        .from('items')
        .select(
          'id, hospital_id, sku, name, category_id, base_unit, barcode, criticality, is_controlled, is_cold_chain, tracks_batch, tracks_expiry, unit_cost, supplier_id',
        )
        .eq('hospital_id', hospitalId)
        .eq('is_active', true)
        .order('name'),
      supabase.from('item_units').select('item_id, unit, factor_to_base, is_order_pack').eq('hospital_id', hospitalId),
      supabase.from('batches').select('id, hospital_id, item_id, batch_no, expiry_date, created_at').eq('hospital_id', hospitalId),
      supabase.from('par_levels').select('item_id, location_id, min_qty, par_qty, max_qty').eq('hospital_id', hospitalId),
      supabase
        .from('stock_levels')
        .select('id, item_id, batch_id, location_id, condition, qty, reserved_qty, last_counted_at')
        .eq('hospital_id', hospitalId),
      supabase.from('count_reason_codes').select('code, label_en, label_hi, requires_note, is_active').eq('is_active', true),
    ]);

    const firstError =
      catRes.error ??
      supRes.error ??
      itemsRes.error ??
      unitsRes.error ??
      batchesRes.error ??
      parRes.error ??
      levelsRes.error ??
      reasonsRes.error;

    if (firstError) {
      throw firstError;
    }

    const suppliersById: Record<string, string> = {};
    for (const sup of supRes.data ?? []) {
      suppliersById[sup.id] = sup.name;
    }

    const snapshot = buildInventorySnapshot({
      hospitalId,
      locations,
      categories: (catRes.data ?? []).map((c) => ({
        id: c.id,
        hospitalId: c.hospital_id,
        name: c.name,
        slug: c.slug,
      })),
      suppliersById,
      items: itemsRes.data ?? [],
      units: (unitsRes.data ?? []).map((u) => ({
        itemId: u.item_id,
        unit: u.unit,
        factorToBase: u.factor_to_base,
        isOrderPack: u.is_order_pack,
      })),
      batches: (batchesRes.data ?? []).map((b) => ({
        id: b.id,
        hospitalId: b.hospital_id,
        itemId: b.item_id,
        batchNo: b.batch_no,
        expiryDate: b.expiry_date,
        createdAt: b.created_at,
      })),
      parLevels: (parRes.data ?? []).map((p) => ({
        itemId: p.item_id,
        locationId: p.location_id,
        minQty: p.min_qty,
        parQty: p.par_qty,
        maxQty: p.max_qty,
      })),
      stockLevels: (levelsRes.data ?? []).map((s) => ({
        id: s.id,
        itemId: s.item_id,
        batchId: s.batch_id,
        locationId: s.location_id,
        condition: s.condition,
        qty: s.qty,
        reservedQty: s.reserved_qty,
        lastCountedAt: s.last_counted_at,
      })),
      reasonCodes: (reasonsRes.data ?? []).map((r) => ({
        code: r.code,
        labelEn: r.label_en,
        labelHi: r.label_hi,
        requiresNote: r.requires_note,
        isActive: r.is_active,
      })),
    });

    await driver.setCache(snapshotCacheKey(hospitalId), snapshot);
    return { snapshot, isOffline: false };
  } catch (err) {
    if (cached && isLikelyNetworkError(err)) {
      return { snapshot: cached, isOffline: true };
    }
    throw err;
  }
}

export async function fetchRecentMovements(
  hospitalId: string,
  snapshot: InventorySnapshot | null,
  itemId?: string,
): Promise<RecentMovementItem[]> {
  if (!isSupabaseConfigured) {
    return [];
  }

  let query = supabase
    .from('stock_movements')
    .select(
      'id, item_id, batch_id, from_location_id, to_location_id, condition, qty, type, reason_code, note, created_at',
    )
    .eq('hospital_id', hospitalId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (itemId) {
    query = query.eq('item_id', itemId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  const itemsById = new Map<string, InventoryItemSummary>();
  const locNameById = new Map<string, string>();
  const batchNoById = new Map<string, string>();

  if (snapshot) {
    for (const item of snapshot.items) {
      itemsById.set(item.id, item);
      for (const b of item.batchStocks) {
        if (b.batchId) {
          batchNoById.set(b.batchId, b.batchNo);
        }
      }
    }
    for (const loc of snapshot.locations) {
      locNameById.set(loc.id, loc.name);
    }
  }

  return (data ?? []).map((m) => {
    const item = itemsById.get(m.item_id);
    return {
      id: m.id,
      itemId: m.item_id,
      itemName: item?.name ?? m.item_id,
      sku: item?.sku ?? '',
      baseUnit: item?.baseUnit ?? 'unit',
      batchNo: m.batch_id ? (batchNoById.get(m.batch_id) ?? null) : null,
      fromLocationName: m.from_location_id ? (locNameById.get(m.from_location_id) ?? null) : null,
      toLocationName: m.to_location_id ? (locNameById.get(m.to_location_id) ?? null) : null,
      condition: m.condition,
      qty: m.qty,
      type: m.type,
      reasonCode: m.reason_code,
      note: m.note,
      createdAt: m.created_at,
    };
  });
}

export interface MovementValidationInput {
  item: Pick<InventoryItemSummary, 'tracksBatch' | 'tracksExpiry' | 'batchStocks' | 'byLocation'>;
  type: ManualMovementType;
  qtyBase: number;
  condition: StockCondition;
  fromLocationId: string | null;
  toLocationId: string | null;
  batchId: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  reasonCode: string | null;
  note: string | null;
  reasonCodes: readonly ReasonCode[];
}

export type MovementValidationResult =
  | { ok: true }
  | { ok: false; code: 'INVALID_QTY' | 'MISSING_LOCATION' | 'SAME_LOCATION' | 'BATCH_REQUIRED' | 'EXPIRY_REQUIRED' | 'INVALID_EXPIRY_DATE' | 'REASON_REQUIRED' | 'NOTE_REQUIRED' | 'INSUFFICIENT_STOCK'; available?: number };

export function validateMovementDraft(input: MovementValidationInput): MovementValidationResult {
  if (!Number.isInteger(input.qtyBase) || input.qtyBase <= 0) {
    return { ok: false, code: 'INVALID_QTY' };
  }

  if (input.type === 'receive') {
    if (!input.toLocationId) return { ok: false, code: 'MISSING_LOCATION' };
    if (input.item.tracksBatch && !input.batchId && !input.batchNo?.trim()) {
      return { ok: false, code: 'BATCH_REQUIRED' };
    }
    if (input.item.tracksExpiry && !input.batchId) {
      if (!input.expiryDate?.trim()) {
        return { ok: false, code: 'EXPIRY_REQUIRED' };
      }
      if (!isValidIsoDate(input.expiryDate.trim())) {
        return { ok: false, code: 'INVALID_EXPIRY_DATE' };
      }
    }
  } else if (input.type === 'issue' || input.type === 'wastage') {
    if (!input.fromLocationId) return { ok: false, code: 'MISSING_LOCATION' };
  } else if (input.type === 'transfer') {
    if (!input.fromLocationId || !input.toLocationId) {
      return { ok: false, code: 'MISSING_LOCATION' };
    }
    if (input.fromLocationId === input.toLocationId) {
      return { ok: false, code: 'SAME_LOCATION' };
    }
  } else if (input.type === 'adjustment') {
    if (Boolean(input.fromLocationId) === Boolean(input.toLocationId)) {
      return { ok: false, code: 'MISSING_LOCATION' };
    }
  }

  if (input.type === 'wastage' || input.type === 'adjustment') {
    if (!input.reasonCode) {
      return { ok: false, code: 'REASON_REQUIRED' };
    }
    const reason = input.reasonCodes.find((r) => r.code === input.reasonCode);
    if (reason?.requiresNote && !input.note?.trim()) {
      return { ok: false, code: 'NOTE_REQUIRED' };
    }
  }

  if (input.fromLocationId) {
    let available = 0;
    if (input.item.tracksBatch) {
      if (!input.batchId) {
        return { ok: false, code: 'BATCH_REQUIRED' };
      }
      const match = input.item.batchStocks.find(
        (b) =>
          b.locationId === input.fromLocationId &&
          b.batchId === input.batchId &&
          b.condition === input.condition,
      );
      available = match?.availableQty ?? 0;
    } else {
      const loc = input.item.byLocation[input.fromLocationId];
      if (input.condition === 'usable') {
        available = loc?.available ?? 0;
      } else if (input.condition === 'damaged') {
        available = loc?.damaged ?? 0;
      } else if (input.condition === 'expired') {
        available = loc?.expired ?? 0;
      } else {
        available = loc?.quarantined ?? 0;
      }
    }

    if (available < input.qtyBase) {
      return { ok: false, code: 'INSUFFICIENT_STOCK', available };
    }
  }

  return { ok: true };
}

export async function executeMovementOnServer(
  payload: MovementPayload,
): Promise<{ movementId: string; duplicate: boolean }> {
  const { data, error } = await supabase.rpc('submit_stock_movement', {
    p_id: payload.id,
    p_item_id: payload.itemId,
    p_type: payload.type,
    p_qty: payload.qtyBase,
    p_condition: payload.condition,
    p_from_location_id: payload.fromLocationId,
    p_to_location_id: payload.toLocationId,
    p_batch_id: payload.batchId,
    p_batch_no: payload.batchNo,
    p_expiry_date: payload.expiryDate,
    p_reason_code: payload.reasonCode,
    p_note: payload.note,
  });

  if (error) {
    throw new Error(error.message);
  }

  const result = (data ?? {}) as { movement_id?: string; duplicate?: boolean };
  return {
    movementId: result.movement_id ?? payload.id,
    duplicate: Boolean(result.duplicate),
  };
}

export async function submitOrQueueMovement(
  draft: Omit<MovementPayload, 'id'>,
  meta?: { itemName?: string; unitSummary?: string },
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<{ mode: 'synced' | 'queued'; movementId: string; duplicate?: boolean }> {
  const payload: MovementPayload = {
    ...draft,
    id: generateMovementId(),
  };

  const online = await checkIsOnline();
  if (!online) {
    await enqueueMovement(payload, meta, driver);
    return { mode: 'queued', movementId: payload.id };
  }

  try {
    const res = await executeMovementOnServer(payload);
    return { mode: 'synced', movementId: res.movementId, duplicate: res.duplicate };
  } catch (err) {
    if (isLikelyNetworkError(err)) {
      await enqueueMovement(payload, meta, driver);
      return { mode: 'queued', movementId: payload.id };
    }
    throw err;
  }
}

export async function syncPendingMovements(
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<FlushQueueResult> {
  const online = await checkIsOnline();
  if (!online) {
    return {
      syncedCount: 0,
      failedCount: 0,
      remainingPending: 0,
      stoppedOnNetworkError: true,
    };
  }
  return flushMovementQueue(executeMovementOnServer, driver);
}
