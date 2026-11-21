import fs from 'node:fs';
import path from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  classifyAuthError,
  loadAccessContext,
  validateEmail,
  validateOtp,
} from '@/features/auth/authService';
import { isIdleExpired } from '@/features/auth/idleTimeout';
import type { Database } from '@/lib/database.types';

function createMockSupabase(tables: Record<string, unknown[]>): SupabaseClient<Database> {
  const client = {
    from: (table: string) => {
      const rows = [...(tables[table] ?? [])] as Record<string, unknown>[];
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];

      const builder = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          filters.push((row) => row[col] === val);
          return builder;
        },
        order: () => {
          const filtered = rows.filter((row) => filters.every((fn) => fn(row)));
          return Promise.resolve({ data: filtered, error: null });
        },
        maybeSingle: () => {
          const filtered = rows.filter((row) => filters.every((fn) => fn(row)));
          return Promise.resolve({ data: filtered[0] ?? null, error: null });
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
          const filtered = rows.filter((row) => filters.every((fn) => fn(row)));
          return Promise.resolve(resolve({ data: filtered, error: null }));
        },
      };

      return builder;
    },
  };

  return client as unknown as SupabaseClient<Database>;
}

describe('Auth validation, no-role blocking, idle lock & secret safety', () => {
  it('validates hospital emails and 6-to-8 digit OTPs (MP-AUTH-001)', () => {
    expect(validateEmail('nurse@medpulse.local')).toBe(true);
    expect(validateEmail('bad-email')).toBe(false);
    expect(validateOtp('123456')).toBe(true);
    expect(validateOtp('12345678')).toBe(true);
    expect(validateOtp('12ab56')).toBe(false);
    expect(validateOtp('12345')).toBe(false);
    expect(validateOtp('123456789')).toBe(false);
  });

  it('classifies OTP rate-limit, missing-user, validation, and unknown auth errors', () => {
    expect(
      classifyAuthError({ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' }),
    ).toBe('rate_limit');
    expect(classifyAuthError({ status: 429, message: 'Too many requests' })).toBe('rate_limit');
    expect(classifyAuthError({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toBe(
      'user_not_found',
    );
    expect(classifyAuthError(new Error('INVALID_EMAIL'))).toBe('invalid_email');
    expect(classifyAuthError(new Error('INVALID_OTP'))).toBe('invalid_otp');
    expect(classifyAuthError(new Error('SUPABASE_NOT_CONFIGURED'))).toBe('supabase_not_configured');
    expect(classifyAuthError(new Error('Network timeout'))).toBe('unknown');
  });

  it('blocks users lacking an active profile or assigned locations (MP-AUTH-002)', async () => {
    const noProfileClient = createMockSupabase({
      profiles: [],
      hospitals: [],
      user_locations: [],
      locations: [],
    });
    expect((await loadAccessContext('u1', noProfileClient)).status).toBe('no_role');

    const inactiveClient = createMockSupabase({
      profiles: [{ id: 'u1', hospital_id: 'h1', full_name: 'A', role: 'nurse', locale: 'en', is_active: false }],
      hospitals: [{ id: 'h1', name: 'H1', code: 'H1', idle_timeout_minutes: 15, created_at: '' }],
      user_locations: [{ user_id: 'u1', location_id: 'l1', hospital_id: 'h1' }],
      locations: [{ id: 'l1', hospital_id: 'h1', parent_id: null, name: 'Ward A', type: 'ward', created_at: '' }],
    });
    expect((await loadAccessContext('u1', inactiveClient)).status).toBe('no_role');

    const noLocationClient = createMockSupabase({
      profiles: [{ id: 'u1', hospital_id: 'h1', full_name: 'A', role: 'nurse', locale: 'en', is_active: true }],
      hospitals: [{ id: 'h1', name: 'H1', code: 'H1', idle_timeout_minutes: 15, created_at: '' }],
      user_locations: [],
      locations: [{ id: 'l1', hospital_id: 'h1', parent_id: null, name: 'Ward A', type: 'ward', created_at: '' }],
    });
    expect((await loadAccessContext('u1', noLocationClient)).status).toBe('no_role');
  });

  it('returns authenticated context when profile and location assignment exist', async () => {
    const client = createMockSupabase({
      profiles: [{ id: 'u1', hospital_id: 'h1', full_name: 'Ward Nurse', role: 'nurse', locale: 'en', is_active: true }],
      hospitals: [{ id: 'h1', name: 'MedPulse General', code: 'MPGH', idle_timeout_minutes: 15, created_at: '' }],
      user_locations: [{ user_id: 'u1', location_id: 'l2', hospital_id: 'h1' }],
      locations: [
        { id: 'l2', hospital_id: 'h1', parent_id: null, name: 'General Ward A', type: 'ward', created_at: '' },
      ],
    });

    const ctx = await loadAccessContext('u1', client);
    expect(ctx.status).toBe('authenticated');
    if (ctx.status === 'authenticated') {
      expect(ctx.profile.role).toBe('nurse');
      expect(ctx.primaryLocationId).toBe('l2');
    }
  });

  it('enforces configurable idle timeout (MP-AUTH-005)', () => {
    const now = 1_000_000_000;
    expect(isIdleExpired(null, now, 15)).toBe(false);
    expect(isIdleExpired(now - 14 * 60 * 1000, now, 15)).toBe(false);
    expect(isIdleExpired(now - 15 * 60 * 1000, now, 15)).toBe(true);
    expect(isIdleExpired(now - 5 * 60 * 1000, now, 5)).toBe(true);
  });

  it('contains zero references to GEMINI_API_KEY in client code (MP-NFR-001)', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const scanDirs = [path.join(rootDir, 'app'), path.join(rootDir, 'src')];

    const checkDir = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__tests__') continue;
          checkDir(full);
        } else if (/\.(ts|tsx|js|jsx|json)$/.test(entry.name)) {
          const content = fs.readFileSync(full, 'utf8');
          expect(content).not.toContain('GEMINI_API_KEY');
        }
      }
    };

    for (const dir of scanDirs) {
      checkDir(dir);
    }
  });
});
