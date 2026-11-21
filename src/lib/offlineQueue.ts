import * as Crypto from 'expo-crypto';
import type { MovementPayload, QueuedMovement } from '@/features/inventory/types';
import {
  type OfflineStorageDriver,
  type StoredQueueRow,
  getDefaultOfflineDriver,
} from './offlineDb';

interface StoredPayloadEnvelope {
  payload: MovementPayload;
  itemName?: string;
  unitSummary?: string;
}

export type MovementExecutor = (
  payload: MovementPayload,
) => Promise<{ movementId: string; duplicate: boolean }>;

export interface FlushQueueResult {
  syncedCount: number;
  failedCount: number;
  remainingPending: number;
  stoppedOnNetworkError: boolean;
}

export function generateMovementId(): string {
  return Crypto.randomUUID();
}

export function isLikelyNetworkError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message: unknown }).message).toLowerCase()
        : String(err).toLowerCase();

  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('offline') ||
    message.includes('failed to fetch') ||
    message.includes('connection')
  );
}

function rowToQueuedMovement(row: StoredQueueRow): QueuedMovement {
  const parsed = JSON.parse(row.payloadJson) as StoredPayloadEnvelope;
  return {
    id: row.id,
    payload: parsed.payload,
    status: row.status,
    errorMessage: row.errorMessage,
    attempts: row.attempts,
    createdAt: row.createdAt,
    itemName: parsed.itemName,
    unitSummary: parsed.unitSummary,
  };
}

export async function enqueueMovement(
  payload: MovementPayload,
  meta?: { itemName?: string; unitSummary?: string },
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<QueuedMovement> {
  const createdAt = new Date().toISOString();
  const envelope: StoredPayloadEnvelope = {
    payload,
    itemName: meta?.itemName,
    unitSummary: meta?.unitSummary,
  };

  const row: StoredQueueRow = {
    id: payload.id,
    payloadJson: JSON.stringify(envelope),
    status: 'pending',
    errorMessage: null,
    attempts: 0,
    createdAt,
  };

  await driver.upsertQueueRow(row);
  return rowToQueuedMovement(row);
}

export async function listQueuedMovements(
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<QueuedMovement[]> {
  const rows = await driver.listQueue();
  return rows.map(rowToQueuedMovement);
}

export async function retryFailedMovement(
  id: string,
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<void> {
  const rows = await driver.listQueue();
  const existing = rows.find((r) => r.id === id);
  if (!existing) return;
  await driver.upsertQueueRow({
    ...existing,
    status: 'pending',
    errorMessage: null,
  });
}

export async function discardFailedMovement(
  id: string,
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<void> {
  await driver.deleteQueueRow(id);
}

/**
 * Replays pending queued movements strictly in FIFO order (MP-MOV-008, MP-MOV-009).
 * Network errors leave items pending and halt replay; deterministic server/validation
 * rejections mark the item `failed` ("Needs attention") so later items are unblocked.
 */
export async function flushMovementQueue(
  executor: MovementExecutor,
  driver: OfflineStorageDriver = getDefaultOfflineDriver(),
): Promise<FlushQueueResult> {
  const rows = await driver.listQueue();
  let syncedCount = 0;
  let failedCount = 0;
  let stoppedOnNetworkError = false;

  for (const row of rows) {
    if (row.status !== 'pending') {
      continue;
    }

    const item = rowToQueuedMovement(row);
    try {
      await executor(item.payload);
      await driver.deleteQueueRow(row.id);
      syncedCount += 1;
    } catch (err) {
      if (isLikelyNetworkError(err)) {
        stoppedOnNetworkError = true;
        break;
      }

      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Movement sync failed';

      await driver.upsertQueueRow({
        ...row,
        status: 'failed',
        errorMessage,
        attempts: row.attempts + 1,
      });
      failedCount += 1;
    }
  }

  const remaining = await driver.listQueue();
  const remainingPending = remaining.filter((r) => r.status === 'pending').length;

  return {
    syncedCount,
    failedCount,
    remainingPending,
    stoppedOnNetworkError,
  };
}
