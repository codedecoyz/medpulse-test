import type { StockCondition } from './types';

function toUtcDayString(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoDayMs(dayStr: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
    return null;
  }
  const ms = Date.parse(`${dayStr}T00:00:00.000Z`);
  return Number.isFinite(ms) ? ms : null;
}

export function isValidIsoDate(dayStr: string): boolean {
  const ms = parseIsoDayMs(dayStr);
  if (ms === null) return false;
  return toUtcDayString(new Date(ms)) === dayStr;
}

/**
 * Returns true when a batch expiry date is strictly before today's UTC date.
 */
export function isBatchExpired(expiryDate: string | null, referenceDate: Date = new Date()): boolean {
  if (!expiryDate) {
    return false;
  }
  const todayStr = toUtcDayString(referenceDate);
  return expiryDate < todayStr;
}

export function daysUntilExpiry(
  expiryDate: string | null,
  referenceDate: Date = new Date(),
): number | null {
  if (!expiryDate) {
    return null;
  }
  const expiryMs = parseIsoDayMs(expiryDate);
  if (expiryMs === null) {
    return null;
  }
  const todayMs = Date.parse(`${toUtcDayString(referenceDate)}T00:00:00.000Z`);
  return Math.round((expiryMs - todayMs) / (24 * 60 * 60 * 1000));
}

export interface FefoBatchCandidate {
  batchId: string | null;
  expiryDate: string | null;
  batchCreatedAt: string;
  condition?: StockCondition;
  availableQty?: number;
}

/**
 * Orders usable non-expired batches by FEFO (Section 10.5 & MP-INV-007):
 * expiry_date ASC NULLS LAST, then batch created_at ASC.
 */
export function sortBatchesFefo<T extends FefoBatchCandidate>(
  batches: readonly T[],
  referenceDate: Date = new Date(),
): T[] {
  return batches
    .filter((batch) => {
      if (batch.condition && batch.condition !== 'usable') {
        return false;
      }
      if (typeof batch.availableQty === 'number' && batch.availableQty <= 0) {
        return false;
      }
      if (isBatchExpired(batch.expiryDate, referenceDate)) {
        return false;
      }
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (a.expiryDate && b.expiryDate) {
        if (a.expiryDate !== b.expiryDate) {
          return a.expiryDate < b.expiryDate ? -1 : 1;
        }
      } else if (a.expiryDate && !b.expiryDate) {
        return -1;
      } else if (!a.expiryDate && b.expiryDate) {
        return 1;
      }

      if (a.batchCreatedAt !== b.batchCreatedAt) {
        return a.batchCreatedAt < b.batchCreatedAt ? -1 : 1;
      }
      return 0;
    });
}

export function getDefaultFefoBatch<T extends FefoBatchCandidate>(
  batches: readonly T[],
  referenceDate: Date = new Date(),
): T | null {
  const sorted = sortBatchesFefo(batches, referenceDate);
  return sorted[0] ?? null;
}
