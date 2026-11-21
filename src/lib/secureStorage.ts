import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK_SIZE = 1500;
const CHUNK_MANIFEST_SUFFIX = '__chunks';
const CHUNK_ITEM_PREFIX = '__chunk_';

const webMemoryStore = new Map<string, string>();

function sanitizeKey(key: string): string {
  const sanitized = key.replace(/[^A-Za-z0-9._-]/g, '_');
  return sanitized.length > 0 ? sanitized : 'medpulse_key';
}

async function rawGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webMemoryStore.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function rawSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function rawDelete(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

async function deleteChunkEntries(safeKey: string): Promise<void> {
  const manifestRaw = await rawGet(`${safeKey}${CHUNK_MANIFEST_SUFFIX}`);
  if (manifestRaw !== null) {
    const count = Number.parseInt(manifestRaw, 10);
    if (Number.isFinite(count) && count > 0) {
      for (let i = 0; i < count; i += 1) {
        await rawDelete(`${safeKey}${CHUNK_ITEM_PREFIX}${i}`);
      }
    }
    await rawDelete(`${safeKey}${CHUNK_MANIFEST_SUFFIX}`);
  }
}

/**
 * Supabase auth storage adapter backed exclusively by expo-secure-store on native
 * platforms (MP-AUTH-004). Automatically chunks values over 1500 characters so
 * large JWT sessions never exceed SecureStore's 2048-byte entry limit.
 */
export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const safeKey = sanitizeKey(key);
    const manifestRaw = await rawGet(`${safeKey}${CHUNK_MANIFEST_SUFFIX}`);

    if (manifestRaw !== null) {
      const count = Number.parseInt(manifestRaw, 10);
      if (!Number.isFinite(count) || count <= 0) {
        return null;
      }
      const parts: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const part = await rawGet(`${safeKey}${CHUNK_ITEM_PREFIX}${i}`);
        if (part === null) {
          return null;
        }
        parts.push(part);
      }
      return parts.join('');
    }

    return rawGet(safeKey);
  },

  async setItem(key: string, value: string): Promise<void> {
    const safeKey = sanitizeKey(key);
    await deleteChunkEntries(safeKey);

    if (value.length <= CHUNK_SIZE) {
      await rawSet(safeKey, value);
      return;
    }

    await rawDelete(safeKey);
    const chunkCount = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < chunkCount; i += 1) {
      const slice = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      await rawSet(`${safeKey}${CHUNK_ITEM_PREFIX}${i}`, slice);
    }
    await rawSet(`${safeKey}${CHUNK_MANIFEST_SUFFIX}`, String(chunkCount));
  },

  async removeItem(key: string): Promise<void> {
    const safeKey = sanitizeKey(key);
    await deleteChunkEntries(safeKey);
    await rawDelete(safeKey);
  },
};
