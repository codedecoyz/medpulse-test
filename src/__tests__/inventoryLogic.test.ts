import {
  daysUntilExpiry,
  getDefaultFefoBatch,
  isBatchExpired,
  isValidIsoDate,
  sortBatchesFefo,
} from '@/features/inventory/fefo';
import { buildSearchIndex, filterInventoryItems } from '@/features/inventory/search';
import type { InventoryItemSummary } from '@/features/inventory/types';
import {
  formatUomConversion,
  fromBaseUnits,
  toBaseUnits,
  validateParLevels,
} from '@/features/inventory/uom';

describe('Phase 1 Inventory domain logic (MP-INV-002, 005, 007, 008)', () => {
  it('converts UoM to integer base units accurately (MP-INV-002)', () => {
    expect(toBaseUnits(3, 100)).toBe(300);
    expect(fromBaseUnits(350, 100)).toBe(3);
    expect(formatUomConversion(3, 'box', 100, 'tablet')).toBe('3 box = 300 tablet');
    expect(() => toBaseUnits(0, 10)).toThrow();
    expect(() => toBaseUnits(1.5, 10)).toThrow();
  });

  it('enforces PAR level invariant min <= par <= max (MP-INV-005)', () => {
    expect(validateParLevels(10, 30, 80)).toBe(true);
    expect(validateParLevels(0, 0, 0)).toBe(true);
    expect(validateParLevels(40, 30, 80)).toBe(false);
    expect(validateParLevels(10, 90, 80)).toBe(false);
    expect(validateParLevels(-1, 10, 20)).toBe(false);
  });

  it('sorts FEFO batches earliest expiry first, nulls last, and excludes expired/empty (MP-INV-007)', () => {
    const refDate = new Date('2026-11-21T00:00:00.000Z');
    const batches = [
      {
        batchId: 'b-expired',
        expiryDate: '2026-11-20',
        batchCreatedAt: '2026-01-01T00:00:00Z',
        condition: 'usable' as const,
        availableQty: 10,
      },
      {
        batchId: 'b-null',
        expiryDate: null,
        batchCreatedAt: '2026-02-01T00:00:00Z',
        condition: 'usable' as const,
        availableQty: 10,
      },
      {
        batchId: 'b-late',
        expiryDate: '2027-06-01',
        batchCreatedAt: '2026-03-01T00:00:00Z',
        condition: 'usable' as const,
        availableQty: 10,
      },
      {
        batchId: 'b-early-2',
        expiryDate: '2027-01-15',
        batchCreatedAt: '2026-04-01T00:00:00Z',
        condition: 'usable' as const,
        availableQty: 5,
      },
      {
        batchId: 'b-early-1',
        expiryDate: '2027-01-15',
        batchCreatedAt: '2026-02-10T00:00:00Z',
        condition: 'usable' as const,
        availableQty: 8,
      },
      {
        batchId: 'b-damaged',
        expiryDate: '2026-12-01',
        batchCreatedAt: '2026-01-01T00:00:00Z',
        condition: 'damaged' as const,
        availableQty: 4,
      },
      {
        batchId: 'b-zero',
        expiryDate: '2026-12-05',
        batchCreatedAt: '2026-01-01T00:00:00Z',
        condition: 'usable' as const,
        availableQty: 0,
      },
    ];

    const sorted = sortBatchesFefo(batches, refDate);
    expect(sorted.map((b) => b.batchId)).toEqual([
      'b-early-1',
      'b-early-2',
      'b-late',
      'b-null',
    ]);
    expect(getDefaultFefoBatch(batches, refDate)?.batchId).toBe('b-early-1');
    expect(isBatchExpired('2026-11-20', refDate)).toBe(true);
    expect(isBatchExpired('2026-11-21', refDate)).toBe(false);
    expect(daysUntilExpiry('2026-11-26', refDate)).toBe(5);
    expect(isValidIsoDate('2027-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
  });

  it('filters 10,000 cached items within 300ms (MP-INV-008)', () => {
    const items: InventoryItemSummary[] = Array.from({ length: 10_000 }, (_, i) => {
      const base: InventoryItemSummary = {
        id: `item-${i}`,
        hospitalId: 'h1',
        sku: `SKU-${String(i).padStart(5, '0')}`,
        name: i === 7777 ? 'Normal Saline 0.9% 500ml Target' : `Hospital Consumable ${i}`,
        categoryId: i % 2 === 0 ? 'cat-a' : 'cat-b',
        categoryName: i % 2 === 0 ? 'Fluids' : 'Consumables',
        baseUnit: 'bottle',
        barcode: `890${String(i).padStart(7, '0')}`,
        criticality: 'B',
        isControlled: false,
        isColdChain: false,
        tracksBatch: true,
        tracksExpiry: true,
        unitCost: 35,
        supplierName: 'Apollo',
        units: [{ itemId: `item-${i}`, unit: 'bottle', factorToBase: 1, isOrderPack: true }],
        totalUsable: i % 10 === 0 ? 5 : 40,
        totalAvailable: i % 10 === 0 ? 5 : 40,
        totalMin: 10,
        totalPar: 25,
        totalMax: 60,
        earliestExpiry: '2027-05-01',
        daysToExpiry: 160,
        status: i % 10 === 0 ? 'low' : 'healthy',
        byLocation: {
          'loc-1': {
            usable: i % 10 === 0 ? 5 : 40,
            available: i % 10 === 0 ? 5 : 40,
            reserved: 0,
            damaged: 0,
            expired: 0,
            quarantined: 0,
            minQty: 10,
            parQty: 25,
            maxQty: 60,
          },
        },
        batchStocks: [],
      };
      base._searchIndex = buildSearchIndex(base);
      return base;
    });

    const start = Date.now();
    const byName = filterInventoryItems(items, {
      query: 'saline 0.9%',
      categoryId: 'cat-b',
      locationId: 'loc-1',
      status: 'healthy',
    });
    const byBarcode = filterInventoryItems(items, {
      query: '8900007777',
      categoryId: null,
      locationId: null,
      status: 'all',
    });
    const elapsedMs = Date.now() - start;

    expect(byName).toHaveLength(1);
    expect(byName[0]?.id).toBe('item-7777');
    expect(byBarcode).toHaveLength(1);
    expect(byBarcode[0]?.id).toBe('item-7777');
    expect(elapsedMs).toBeLessThan(300);
  });
});
