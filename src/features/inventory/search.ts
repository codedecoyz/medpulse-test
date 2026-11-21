import type {
  InventoryFilterState,
  InventoryItemSummary,
  StockHealthStatus,
} from './types';

export function getItemStatusAtLocation(
  item: InventoryItemSummary,
  locationId: string | null,
): StockHealthStatus {
  if (!locationId) {
    return item.status;
  }
  const loc = item.byLocation[locationId];
  const usable = loc?.usable ?? 0;
  const par = loc?.parQty;
  const min = loc?.minQty;

  if (usable <= 0) {
    return 'out';
  }
  if ((min !== null && min !== undefined && usable <= min) || (par !== null && par !== undefined && usable < par)) {
    return 'low';
  }
  if (item.daysToExpiry !== null && item.daysToExpiry <= 90) {
    return 'expiring';
  }
  return 'healthy';
}

export function buildSearchIndex(item: Pick<InventoryItemSummary, 'name' | 'sku' | 'barcode'>): string {
  return `${item.name} ${item.sku} ${item.barcode ?? ''}`.toLowerCase();
}

/**
 * Searches and filters the cached catalog by name, SKU, barcode, category,
 * location, and stock status (MP-INV-008: < 300ms for 10,000 items).
 */
export function filterInventoryItems(
  items: readonly InventoryItemSummary[],
  filter: InventoryFilterState,
): InventoryItemSummary[] {
  const query = filter.query.trim().toLowerCase();
  const { categoryId, locationId, status } = filter;

  if (!query && !categoryId && !locationId && status === 'all') {
    return items.slice();
  }

  const out: InventoryItemSummary[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];

    if (categoryId && item.categoryId !== categoryId) {
      continue;
    }

    if (locationId && !item.byLocation[locationId]) {
      continue;
    }

    if (status !== 'all') {
      const effectiveStatus = getItemStatusAtLocation(item, locationId);
      if (effectiveStatus !== status) {
        continue;
      }
    }

    if (query) {
      const idx = item._searchIndex ?? buildSearchIndex(item);
      if (!idx.includes(query)) {
        continue;
      }
    }

    out.push(item);
  }

  return out;
}
