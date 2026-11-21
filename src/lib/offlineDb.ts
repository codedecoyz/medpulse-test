import { Platform } from 'react-native';
import { type MedPulseSqliteDb, openMedPulseSqliteDb } from './offlineSqlite';

export interface StoredQueueRow {
  id: string;
  payloadJson: string;
  status: 'pending' | 'failed';
  errorMessage: string | null;
  attempts: number;
  createdAt: string;
}

export interface OfflineStorageDriver {
  getCache<T>(key: string): Promise<T | null>;
  setCache<T>(key: string, value: T): Promise<void>;
  listQueue(): Promise<StoredQueueRow[]>;
  upsertQueueRow(row: StoredQueueRow): Promise<void>;
  deleteQueueRow(id: string): Promise<void>;
  clearAll(): Promise<void>;
}

export function createMemoryOfflineDriver(): OfflineStorageDriver {
  const cache = new Map<string, string>();
  const queue = new Map<string, StoredQueueRow>();

  return {
    async getCache<T>(key: string): Promise<T | null> {
      const raw = cache.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    async setCache<T>(key: string, value: T): Promise<void> {
      cache.set(key, JSON.stringify(value));
    },
    async listQueue(): Promise<StoredQueueRow[]> {
      return Array.from(queue.values()).sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      );
    },
    async upsertQueueRow(row: StoredQueueRow): Promise<void> {
      queue.set(row.id, { ...row });
    },
    async deleteQueueRow(id: string): Promise<void> {
      queue.delete(id);
    },
    async clearAll(): Promise<void> {
      cache.clear();
      queue.clear();
    },
  };
}

let sqliteDbPromise: Promise<MedPulseSqliteDb | null> | null = null;
const webFallbackDriver = createMemoryOfflineDriver();

async function getSqliteDb(): Promise<MedPulseSqliteDb | null> {
  if (!sqliteDbPromise) {
    sqliteDbPromise = (async () => {
      const db = await openMedPulseSqliteDb();
      if (!db) {
        return null;
      }
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS offline_cache (
          key TEXT PRIMARY KEY NOT NULL,
          value_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS offline_movement_queue (
          id TEXT PRIMARY KEY NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          error_message TEXT,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return sqliteDbPromise;
}

export function createSqliteOfflineDriver(): OfflineStorageDriver {
  return {
    async getCache<T>(key: string): Promise<T | null> {
      const db = await getSqliteDb();
      if (!db) return webFallbackDriver.getCache<T>(key);
      const row = await db.getFirstAsync<{ value_json: string }>(
        'SELECT value_json FROM offline_cache WHERE key = ?',
        key,
      );
      if (!row) return null;
      return JSON.parse(row.value_json) as T;
    },
    async setCache<T>(key: string, value: T): Promise<void> {
      const db = await getSqliteDb();
      if (!db) return webFallbackDriver.setCache(key, value);
      await db.runAsync(
        'INSERT OR REPLACE INTO offline_cache (key, value_json, updated_at) VALUES (?, ?, ?)',
        key,
        JSON.stringify(value),
        new Date().toISOString(),
      );
    },
    async listQueue(): Promise<StoredQueueRow[]> {
      const db = await getSqliteDb();
      if (!db) return webFallbackDriver.listQueue();
      const rows = await db.getAllAsync<{
        id: string;
        payload_json: string;
        status: string;
        error_message: string | null;
        attempts: number;
        created_at: string;
      }>('SELECT id, payload_json, status, error_message, attempts, created_at FROM offline_movement_queue ORDER BY created_at ASC');

      return rows.map((row) => ({
        id: row.id,
        payloadJson: row.payload_json,
        status: row.status === 'failed' ? 'failed' : 'pending',
        errorMessage: row.error_message,
        attempts: row.attempts,
        createdAt: row.created_at,
      }));
    },
    async upsertQueueRow(row: StoredQueueRow): Promise<void> {
      const db = await getSqliteDb();
      if (!db) return webFallbackDriver.upsertQueueRow(row);
      await db.runAsync(
        `INSERT OR REPLACE INTO offline_movement_queue
         (id, payload_json, status, error_message, attempts, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        row.id,
        row.payloadJson,
        row.status,
        row.errorMessage,
        row.attempts,
        row.createdAt,
      );
    },
    async deleteQueueRow(id: string): Promise<void> {
      const db = await getSqliteDb();
      if (!db) return webFallbackDriver.deleteQueueRow(id);
      await db.runAsync('DELETE FROM offline_movement_queue WHERE id = ?', id);
    },
    async clearAll(): Promise<void> {
      const db = await getSqliteDb();
      if (!db) return webFallbackDriver.clearAll();
      await db.runAsync('DELETE FROM offline_cache');
      await db.runAsync('DELETE FROM offline_movement_queue');
    },
  };
}

const nativeSqliteDriver = createSqliteOfflineDriver();

export function getDefaultOfflineDriver(): OfflineStorageDriver {
  return Platform.OS === 'web' ? webFallbackDriver : nativeSqliteDriver;
}
