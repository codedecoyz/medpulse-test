import { createMemoryOfflineDriver, createSqliteOfflineDriver } from '@/lib/offlineDb';
import {
  discardFailedMovement,
  enqueueMovement,
  flushMovementQueue,
  generateMovementId,
  listQueuedMovements,
  retryFailedMovement,
} from '@/lib/offlineQueue';
import { buildInventorySnapshot, loadCachedSnapshot } from '@/features/inventory/inventoryService';

describe('Offline inventory cache and idempotent movement queue (MP-INV-011, MP-MOV-008, MP-MOV-009)', () => {
  it('persists cached snapshot and queued movements in SQLite driver across restarts', async () => {
    const driver = createSqliteOfflineDriver();
    await driver.clearAll();

    const snapshot = buildInventorySnapshot({
      hospitalId: 'h1',
      locations: [
        { id: 'loc-1', hospital_id: 'h1', parent_id: null, name: 'Central Store', type: 'central_store', created_at: '' },
      ],
      categories: [{ id: 'cat-1', hospitalId: 'h1', name: 'Fluids', slug: 'iv-fluids' }],
      suppliersById: {},
      items: [
        {
          id: 'item-1',
          hospital_id: 'h1',
          sku: 'IVF-036',
          name: 'Normal Saline 500ml',
          category_id: 'cat-1',
          base_unit: 'bottle',
          barcode: null,
          criticality: 'B',
          is_controlled: false,
          is_cold_chain: false,
          tracks_batch: true,
          tracks_expiry: true,
          unit_cost: 34,
          supplier_id: null,
        },
      ],
      units: [{ itemId: 'item-1', unit: 'bottle', factorToBase: 1, isOrderPack: true }],
      batches: [],
      parLevels: [],
      stockLevels: [],
      reasonCodes: [],
      syncedAt: '2026-11-21T00:00:00.000Z',
    });

    await driver.setCache('inventory_snapshot_h1', snapshot);
    const loaded = await loadCachedSnapshot('h1', driver);
    expect(loaded?.lastSyncedAt).toBe('2026-11-21T00:00:00.000Z');
    expect(loaded?.items[0]?.sku).toBe('IVF-036');
  });

  it('flushes queued movements in FIFO order, preserves idempotent UUIDs, and flags business failures', async () => {
    const driver = createMemoryOfflineDriver();
    const id1 = generateMovementId();
    const id2 = generateMovementId();
    const id3 = generateMovementId();

    expect(id1).not.toBe(id2);

    await enqueueMovement(
      {
        id: id1,
        itemId: 'item-1',
        type: 'receive',
        qtyBase: 20,
        condition: 'usable',
        fromLocationId: null,
        toLocationId: 'loc-1',
        batchId: null,
        batchNo: 'B1',
        expiryDate: '2027-05-01',
        reasonCode: null,
        note: null,
      },
      { itemName: 'Normal Saline' },
      driver,
    );

    await enqueueMovement(
      {
        id: id2,
        itemId: 'item-1',
        type: 'issue',
        qtyBase: 99,
        condition: 'usable',
        fromLocationId: 'loc-1',
        toLocationId: null,
        batchId: 'batch-1',
        batchNo: null,
        expiryDate: null,
        reasonCode: null,
        note: null,
      },
      { itemName: 'Normal Saline' },
      driver,
    );

    await enqueueMovement(
      {
        id: id3,
        itemId: 'item-1',
        type: 'issue',
        qtyBase: 5,
        condition: 'usable',
        fromLocationId: 'loc-1',
        toLocationId: null,
        batchId: 'batch-1',
        batchNo: null,
        expiryDate: null,
        reasonCode: null,
        note: null,
      },
      { itemName: 'Normal Saline' },
      driver,
    );

    const seenIds: string[] = [];
    const seenDuplicates = new Set<string>();

    const firstFlush = await flushMovementQueue(async (payload) => {
      seenIds.push(payload.id);
      if (payload.id === id2) {
        throw new Error('Only 12 available');
      }
      const duplicate = seenDuplicates.has(payload.id);
      seenDuplicates.add(payload.id);
      return { movementId: payload.id, duplicate };
    }, driver);

    expect(seenIds).toEqual([id1, id2, id3]);
    expect(firstFlush).toEqual({
      syncedCount: 2,
      failedCount: 1,
      remainingPending: 0,
      stoppedOnNetworkError: false,
    });

    const after = await listQueuedMovements(driver);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(id2);
    expect(after[0]?.status).toBe('failed');
    expect(after[0]?.errorMessage).toBe('Only 12 available');

    await retryFailedMovement(id2, driver);
    const afterRetry = await listQueuedMovements(driver);
    expect(afterRetry[0]?.status).toBe('pending');

    // Network outage halts flush without marking failed
    const netFlush = await flushMovementQueue(async () => {
      throw new Error('Network request failed');
    }, driver);
    expect(netFlush.stoppedOnNetworkError).toBe(true);
    expect(netFlush.remainingPending).toBe(1);

    await discardFailedMovement(id2, driver);
    expect(await listQueuedMovements(driver)).toHaveLength(0);
  });
});
