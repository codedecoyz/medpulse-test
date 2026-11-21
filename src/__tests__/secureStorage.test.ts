import fs from 'node:fs';
import path from 'node:path';
import * as SecureStore from 'expo-secure-store';
import { secureStorage } from '@/lib/secureStorage';

interface MockSecureStoreModule {
  __clearMockStore: () => void;
  __getMockStore: () => Map<string, string>;
}

const mockStoreModule = SecureStore as unknown as MockSecureStoreModule;

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('Secure session token storage (MP-AUTH-004)', () => {
  beforeEach(() => {
    mockStoreModule.__clearMockStore();
    jest.clearAllMocks();
  });

  it('stores and removes short session entries directly in SecureStore', async () => {
    await secureStorage.setItem('sb-test-auth-token', '{"access_token":"abc"}');
    expect(await secureStorage.getItem('sb-test-auth-token')).toBe('{"access_token":"abc"}');
    expect(mockStoreModule.__getMockStore().has('sb-test-auth-token')).toBe(true);

    await secureStorage.removeItem('sb-test-auth-token');
    expect(await secureStorage.getItem('sb-test-auth-token')).toBeNull();
    expect(mockStoreModule.__getMockStore().size).toBe(0);
  });

  it('chunks large payloads (> 4KB) cleanly under SecureStore size limits and cleans up old chunks', async () => {
    const largeToken = JSON.stringify({
      access_token: 'x'.repeat(3500),
      refresh_token: 'y'.repeat(900),
    });

    await secureStorage.setItem('sb-large-auth', largeToken);
    const storeMap = mockStoreModule.__getMockStore();
    expect(storeMap.get('sb-large-auth__chunks')).toBe('3');
    for (const [k, v] of storeMap.entries()) {
      expect(k.length).toBeGreaterThan(0);
      expect(v.length).toBeLessThanOrEqual(1500);
    }

    expect(await secureStorage.getItem('sb-large-auth')).toBe(largeToken);

    // Overwriting with a smaller value cleans up previous chunk entries
    await secureStorage.setItem('sb-large-auth', 'small');
    expect(storeMap.has('sb-large-auth__chunks')).toBe(false);
    expect(storeMap.has('sb-large-auth__chunk_0')).toBe(false);
    expect(await secureStorage.getItem('sb-large-auth')).toBe('small');
  });

  it('never imports AsyncStorage anywhere in app/ or src/', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const files = [
      ...collectSourceFiles(path.join(rootDir, 'app')),
      ...collectSourceFiles(path.join(rootDir, 'src')),
    ];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      expect(content).not.toMatch(/async-storage/i);
      expect(content).not.toMatch(/\bAsyncStorage\b/);
    }
  });
});
