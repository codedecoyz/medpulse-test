import type {
  Criticality,
  LocationRow,
  MovementType,
  StockCondition,
} from '@/lib/database.types';

export type { Criticality, MovementType, StockCondition };

export interface Category {
  id: string;
  hospitalId: string;
  name: string;
  slug: string;
}

export interface ItemUnit {
  itemId: string;
  unit: string;
  factorToBase: number;
  isOrderPack: boolean;
}

export interface Batch {
  id: string;
  hospitalId: string;
  itemId: string;
  batchNo: string;
  expiryDate: string | null;
  createdAt: string;
}

export interface ParLevel {
  itemId: string;
  locationId: string;
  minQty: number;
  parQty: number;
  maxQty: number;
}

export interface StockLevelRecord {
  id: string;
  itemId: string;
  batchId: string | null;
  locationId: string;
  condition: StockCondition;
  qty: number;
  reservedQty: number;
  lastCountedAt: string | null;
}

export interface ReasonCode {
  code: string;
  labelEn: string;
  labelHi: string | null;
  requiresNote: boolean;
  isActive: boolean;
}

export interface StockBreakdown {
  usable: number;
  available: number;
  reserved: number;
  damaged: number;
  expired: number;
  quarantined: number;
  minQty: number | null;
  parQty: number | null;
  maxQty: number | null;
}

export interface BatchStockEntry {
  batchId: string | null;
  batchNo: string;
  expiryDate: string | null;
  batchCreatedAt: string;
  locationId: string;
  locationName: string;
  condition: StockCondition;
  qty: number;
  reservedQty: number;
  availableQty: number;
}

export type StockHealthStatus = 'healthy' | 'low' | 'out' | 'expiring';

export interface InventoryItemSummary {
  id: string;
  hospitalId: string;
  sku: string;
  name: string;
  categoryId: string | null;
  categoryName: string;
  baseUnit: string;
  barcode: string | null;
  criticality: Criticality;
  isControlled: boolean;
  isColdChain: boolean;
  tracksBatch: boolean;
  tracksExpiry: boolean;
  unitCost: number;
  supplierName: string | null;
  units: ItemUnit[];
  totalUsable: number;
  totalAvailable: number;
  totalMin: number;
  totalPar: number;
  totalMax: number;
  earliestExpiry: string | null;
  daysToExpiry: number | null;
  status: StockHealthStatus;
  byLocation: Record<string, StockBreakdown>;
  batchStocks: BatchStockEntry[];
  _searchIndex?: string;
}

export interface RecentMovementItem {
  id: string;
  itemId: string;
  itemName: string;
  sku: string;
  baseUnit: string;
  batchNo: string | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  condition: StockCondition;
  qty: number;
  type: MovementType;
  reasonCode: string | null;
  note: string | null;
  createdAt: string;
}

export interface InventorySnapshot {
  hospitalId: string;
  items: InventoryItemSummary[];
  categories: Category[];
  reasonCodes: ReasonCode[];
  locations: LocationRow[];
  lastSyncedAt: string;
}

export type InventoryStatusFilter = 'all' | StockHealthStatus;

export interface InventoryFilterState {
  query: string;
  categoryId: string | null;
  locationId: string | null;
  status: InventoryStatusFilter;
}

export type ManualMovementType = 'receive' | 'issue' | 'transfer' | 'wastage' | 'adjustment';

export interface MovementPayload {
  id: string;
  itemId: string;
  type: ManualMovementType | 'count_adjustment';
  qtyBase: number;
  condition: StockCondition;
  fromLocationId: string | null;
  toLocationId: string | null;
  batchId: string | null;
  batchNo: string | null;
  expiryDate: string | null;
  reasonCode: string | null;
  note: string | null;
}

export interface QueuedMovement {
  id: string;
  payload: MovementPayload;
  status: 'pending' | 'failed';
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
  itemName?: string;
  unitSummary?: string;
}
