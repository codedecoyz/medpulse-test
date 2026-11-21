import { DEFAULT_FEATURE_FLAGS, resolveFeatureFlags } from '@/lib/flags';

describe('Feature flags resolution (MP-SCN-001)', () => {
  it('defaults scanner_beta to false and AI flags to true', () => {
    expect(DEFAULT_FEATURE_FLAGS).toEqual({
      scanner_beta: false,
      ai_tasks: true,
      ai_scenarios: true,
      ai_assistant: true,
    });
  });

  it('applies hospital-wide flags and gives precedence to per-user overrides', () => {
    const rows = [
      { key: 'scanner_beta', user_id: null, enabled: false },
      { key: 'scanner_beta', user_id: 'user-1', enabled: true },
      { key: 'ai_tasks', user_id: null, enabled: false },
    ];

    expect(resolveFeatureFlags(rows, 'user-2')).toEqual({
      scanner_beta: false,
      ai_tasks: false,
      ai_scenarios: true,
      ai_assistant: true,
    });

    expect(resolveFeatureFlags(rows, 'user-1')).toEqual({
      scanner_beta: true,
      ai_tasks: false,
      ai_scenarios: true,
      ai_assistant: true,
    });
  });
});
