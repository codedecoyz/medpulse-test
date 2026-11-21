import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from './supabase';
import type { Database } from './database.types';

export type FeatureFlagKey = 'scanner_beta' | 'ai_tasks' | 'ai_scenarios' | 'ai_assistant';

export const DEFAULT_FEATURE_FLAGS: Record<FeatureFlagKey, boolean> = {
  scanner_beta: false, // MP-SCN-001: default OFF
  ai_tasks: true,
  ai_scenarios: true,
  ai_assistant: true,
};

export type FeatureFlagRow = Pick<
  Database['public']['Tables']['feature_flags']['Row'],
  'key' | 'user_id' | 'enabled'
>;

export function resolveFeatureFlags(
  rows: readonly FeatureFlagRow[] | null | undefined,
  userId?: string | null,
): Record<FeatureFlagKey, boolean> {
  const resolved: Record<FeatureFlagKey, boolean> = { ...DEFAULT_FEATURE_FLAGS };
  if (!rows || rows.length === 0) {
    return resolved;
  }

  const keys = Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlagKey[];
  for (const key of keys) {
    const userRow = userId
      ? rows.find((row) => row.key === key && row.user_id === userId)
      : undefined;
    if (userRow !== undefined) {
      resolved[key] = userRow.enabled;
      continue;
    }

    const hospitalRow = rows.find((row) => row.key === key && row.user_id === null);
    if (hospitalRow !== undefined) {
      resolved[key] = hospitalRow.enabled;
    }
  }

  return resolved;
}

export function useFeatureFlags(hospitalId?: string | null, userId?: string | null) {
  return useQuery({
    queryKey: ['feature_flags', hospitalId ?? 'none', userId ?? 'anon'],
    enabled: Boolean(hospitalId) && isSupabaseConfigured,
    initialData: DEFAULT_FEATURE_FLAGS,
    queryFn: async () => {
      if (!hospitalId) {
        return DEFAULT_FEATURE_FLAGS;
      }

      const { data, error } = await supabase
        .from('feature_flags')
        .select('key, user_id, enabled')
        .eq('hospital_id', hospitalId);

      if (error) {
        throw error;
      }

      return resolveFeatureFlags(data, userId);
    },
  });
}

export function useFeatureFlag(
  key: FeatureFlagKey,
  hospitalId?: string | null,
  userId?: string | null,
): boolean {
  const { data } = useFeatureFlags(hospitalId, userId);
  return data?.[key] ?? DEFAULT_FEATURE_FLAGS[key];
}
