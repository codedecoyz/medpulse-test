import type { InventoryItemSummary, ItemUnit } from '@/features/inventory/types';

export interface LineVarianceResult {
  varianceQty: number;
  variancePct: number;
  outOfTolerance: boolean;
  valueImpact: number;
}

export interface WhatsNeededFlagSet {
  belowPar: boolean;
  atOrBelowMin: boolean;
  overstock: boolean;
  expiring: boolean;
}

export interface WhatsNeededInput {
  itemId: string;
  sku: string;
  name: string;
  baseUnit: string;
  parQty: number;
  minQty: number;
  maxQty: number;
  countedGood: number;
  unusableRemoved: number;
  daysToExpiry: number | null;
  units: readonly ItemUnit[];
}

export interface WhatsNeededLine {
  itemId: string;
  sku: string;
  name: string;
  baseUnit: string;
  parQty: number;
  minQty: number;
  maxQty: number;
  countedGood: number;
  needed: number;
  packSize: number;
  packUnit: string;
  suggestedOrder: number;
  unusableRemoved: number;
  flags: WhatsNeededFlagSet;
}

/**
 * Default tolerance per MP-CNT-002:
 * 0% for controlled drugs or blood products, 5% for C-class consumables, 2% otherwise.
 */
export function defaultToleranceForItem(
  item: Pick<InventoryItemSummary, 'isControlled' | 'sku' | 'criticality' | 'categoryName'>,
): number {
  if (
    item.isControlled ||
    item.sku.toUpperCase().startsWith('BLD-') ||
    /blood/i.test(item.categoryName)
  ) {
    return 0;
  }
  if (item.criticality === 'C') {
    return 5;
  }
  return 2;
}

/**
 * Computes line variance and tolerance status per Section 10.2.
 */
export function computeLineVariance(
  countedGood: number,
  systemQty: number,
  tolerancePct: number,
  unitCost: number,
): LineVarianceResult {
  const varianceQty = countedGood - systemQty;
  const variancePct = (Math.abs(varianceQty) / Math.max(systemQty, 1)) * 100;
  const outOfTolerance = tolerancePct === 0 ? varianceQty !== 0 : variancePct > tolerancePct;
  const valueImpact = varianceQty * unitCost;

  return {
    varianceQty,
    variancePct,
    outOfTolerance,
    valueImpact,
  };
}

/**
 * Computes What's Needed & pack-rounded reorder suggestions per Section 10.1 (MP-CNT-022).
 */
export function computeWhatsNeeded(lines: readonly WhatsNeededInput[]): WhatsNeededLine[] {
  return lines.map((line) => {
    const needed = Math.max(line.parQty - line.countedGood, 0);
    const orderPacks = line.units.filter((u) => u.isOrderPack && u.factorToBase > 0);
    const largestOrderPack = orderPacks.reduce<ItemUnit | null>(
      (best, curr) => (!best || curr.factorToBase > best.factorToBase ? curr : best),
      null,
    );
    const packSize = largestOrderPack?.factorToBase ?? 1;
    const packUnit = largestOrderPack?.unit ?? line.baseUnit;
    const suggestedOrder = needed > 0 ? Math.ceil(needed / packSize) * packSize : 0;

    return {
      itemId: line.itemId,
      sku: line.sku,
      name: line.name,
      baseUnit: line.baseUnit,
      parQty: line.parQty,
      minQty: line.minQty,
      maxQty: line.maxQty,
      countedGood: line.countedGood,
      needed,
      packSize,
      packUnit,
      suggestedOrder,
      unusableRemoved: line.unusableRemoved,
      flags: {
        belowPar: line.parQty > 0 && line.countedGood < line.parQty,
        atOrBelowMin: line.minQty > 0 && line.countedGood <= line.minQty,
        overstock: line.maxQty > 0 && line.countedGood > line.maxQty,
        expiring: line.daysToExpiry !== null && line.daysToExpiry <= 90,
      },
    };
  });
}

/**
 * Enforces witness sign-off requirement for controlled drugs and blood products (MP-CNT-019).
 */
export function requiresWitnessForItem(
  item: Pick<InventoryItemSummary, 'isControlled' | 'sku' | 'categoryName'>,
): boolean {
  return (
    item.isControlled ||
    item.sku.toUpperCase().startsWith('BLD-') ||
    /blood/i.test(item.categoryName)
  );
}

export function canSubmitCountLine(
  item: Pick<InventoryItemSummary, 'isControlled' | 'sku' | 'categoryName'>,
  witnessConfirmed: boolean,
): { ok: true } | { ok: false; reason: 'WITNESS_REQUIRED' } {
  if (requiresWitnessForItem(item) && !witnessConfirmed) {
    return { ok: false, reason: 'WITNESS_REQUIRED' };
  }
  return { ok: true };
}

/**
 * Enforces separation of duties between counter and approver (MP-CNT-018).
 */
export function canApproveCountSession(counterId: string, approverId: string): boolean {
  if (!counterId || !approverId) return false;
  return counterId !== approverId;
}
