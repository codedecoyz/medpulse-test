/* eslint-disable @typescript-eslint/no-require-imports */
import type { ReactNode } from 'react';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      store.delete(key);
    }),
    __clearMockStore: () => {
      store.clear();
    },
    __getMockStore: () => store,
  };
});

jest.mock('expo-crypto', () => {
  let seq = 0;
  return {
    randomUUID: jest.fn(() => {
      seq += 1;
      return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
    }),
  };
});

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({
    isConnected: true,
    isInternetReachable: true,
  })),
}));

jest.mock('expo-sqlite', () => {
  const kv = new Map<string, string>();
  const queue = new Map<string, Record<string, unknown>>();
  return {
    openDatabaseAsync: jest.fn(async () => ({
      execAsync: jest.fn(async () => undefined),
      runAsync: jest.fn(async (sql: string, ...params: unknown[]) => {
        if (sql.includes('offline_cache')) {
          if (sql.startsWith('INSERT') || sql.startsWith('REPLACE')) {
            kv.set(String(params[0]), String(params[1]));
          } else if (sql.startsWith('DELETE')) {
            kv.clear();
          }
        } else if (sql.includes('offline_movement_queue')) {
          if (sql.startsWith('INSERT')) {
            queue.set(String(params[0]), {
              id: params[0],
              payload_json: params[1],
              status: params[2],
              error_message: params[3] ?? null,
              attempts: params[4] ?? 0,
              created_at: params[5],
            });
          } else if (sql.startsWith('UPDATE')) {
            const id = String(params[params.length - 1]);
            const existing = queue.get(id);
            if (existing) {
              existing.status = params[0];
              existing.error_message = params[1];
              existing.attempts = params[2];
            }
          } else if (sql.startsWith('DELETE')) {
            if (params.length > 0) {
              queue.delete(String(params[0]));
            } else {
              queue.clear();
            }
          }
        }
      }),
      getFirstAsync: jest.fn(async (_sql: string, key?: string) => {
        if (key && kv.has(key)) {
          return { value_json: kv.get(key) };
        }
        return null;
      }),
      getAllAsync: jest.fn(async () => Array.from(queue.values())),
    })),
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const MockIcon = ({ name }: { name: string }) =>
    React.createElement(View, { testID: `icon-${name}` });
  return {
    MaterialCommunityIcons: MockIcon,
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react') as typeof import('react');
  const { View } = require('react-native') as typeof import('react-native');
  const MockSvg = ({ children }: { children?: ReactNode }) =>
    React.createElement(View, null, children);
  const MockShape = () => React.createElement(View);
  return {
    __esModule: true,
    default: MockSvg,
    Svg: MockSvg,
    Circle: MockShape,
    G: MockSvg,
    Rect: MockShape,
    Path: MockShape,
  };
});
