import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  discardFailedMovement,
  listQueuedMovements,
  retryFailedMovement,
} from '@/lib/offlineQueue';
import {
  fetchAndCacheInventory,
  fetchRecentMovements,
  submitOrQueueMovement,
  syncPendingMovements,
} from './inventoryService';
import type { MovementPayload } from './types';

export function useInventoryCatalog() {
  const { hospital, locations } = useAuth();
  const hospitalId = hospital?.id ?? null;

  return useQuery({
    queryKey: ['inventory_snapshot', hospitalId ?? 'none'],
    enabled: Boolean(hospitalId),
    queryFn: async () => {
      if (!hospitalId) {
        return null;
      }
      return fetchAndCacheInventory(hospitalId, locations);
    },
  });
}

export function useItemDetail(itemId: string | undefined) {
  const catalogQuery = useInventoryCatalog();
  const item = itemId
    ? (catalogQuery.data?.snapshot.items.find((entry) => entry.id === itemId) ?? null)
    : null;

  return {
    ...catalogQuery,
    item,
    snapshot: catalogQuery.data?.snapshot ?? null,
    isOffline: catalogQuery.data?.isOffline ?? false,
  };
}

export function useRecentMovements(itemId?: string) {
  const { hospital } = useAuth();
  const catalogQuery = useInventoryCatalog();
  const hospitalId = hospital?.id ?? null;
  const snapshot = catalogQuery.data?.snapshot ?? null;

  return useQuery({
    queryKey: ['recent_movements', hospitalId ?? 'none', itemId ?? 'all'],
    enabled: Boolean(hospitalId) && !catalogQuery.data?.isOffline,
    queryFn: async () => {
      if (!hospitalId) return [];
      return fetchRecentMovements(hospitalId, snapshot, itemId);
    },
  });
}

export function useOfflineQueue() {
  const queryClient = useQueryClient();

  const queueQuery = useQuery({
    queryKey: ['offline_movement_queue'],
    queryFn: () => listQueuedMovements(),
  });

  const syncAll = useCallback(async () => {
    const res = await syncPendingMovements();
    await queryClient.invalidateQueries({ queryKey: ['offline_movement_queue'] });
    await queryClient.invalidateQueries({ queryKey: ['inventory_snapshot'] });
    await queryClient.invalidateQueries({ queryKey: ['recent_movements'] });
    return res;
  }, [queryClient]);

  const retryItem = useCallback(
    async (id: string) => {
      await retryFailedMovement(id);
      await syncAll();
    },
    [syncAll],
  );

  const discardItem = useCallback(
    async (id: string) => {
      await discardFailedMovement(id);
      await queryClient.invalidateQueries({ queryKey: ['offline_movement_queue'] });
    },
    [queryClient],
  );

  return {
    ...queueQuery,
    syncAll,
    retryItem,
    discardItem,
  };
}

export function useSubmitMovement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (vars: {
      draft: Omit<MovementPayload, 'id'>;
      itemName?: string;
      unitSummary?: string;
    }) => submitOrQueueMovement(vars.draft, { itemName: vars.itemName, unitSummary: vars.unitSummary }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['offline_movement_queue'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory_snapshot'] });
      await queryClient.invalidateQueries({ queryKey: ['recent_movements'] });
    },
  });
}
