import fs from 'node:fs';
import path from 'node:path';

function countPgTapAssertions(sql: string): number {
  const matches = sql.match(/select\s+(is|ok|throws_ok|lives_ok)\s*\(/gi);
  return matches?.length ?? 0;
}

describe('Supabase SQL migrations, seed, and pgTAP suite integrity (Phase 0 + Phase 1)', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const foundationSql = fs.readFileSync(
    path.join(rootDir, 'supabase/migrations/20261121000001_phase0_foundation.sql'),
    'utf8',
  );
  const rlsPhase0Sql = fs.readFileSync(
    path.join(rootDir, 'supabase/migrations/20261121000002_phase0_rls.sql'),
    'utf8',
  );
  const inventorySql = fs.readFileSync(
    path.join(rootDir, 'supabase/migrations/20261121000003_phase1_inventory.sql'),
    'utf8',
  );
  const rlsPhase1Sql = fs.readFileSync(
    path.join(rootDir, 'supabase/migrations/20261121000004_phase1_rls.sql'),
    'utf8',
  );
  const seedSql = fs.readFileSync(path.join(rootDir, 'supabase/seed.sql'), 'utf8');
  const pgTap0Sql = fs.readFileSync(
    path.join(rootDir, 'supabase/tests/rls_phase0.test.sql'),
    'utf8',
  );
  const pgTap1Sql = fs.readFileSync(
    path.join(rootDir, 'supabase/tests/rls_phase1.test.sql'),
    'utf8',
  );

  it('enables RLS on every Phase 0 and Phase 1 table (MP-AUTH-003)', () => {
    for (const table of ['hospitals', 'locations', 'profiles', 'user_locations', 'feature_flags', 'audit_logs']) {
      expect(rlsPhase0Sql).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
      );
    }

    for (const table of [
      'categories',
      'suppliers',
      'items',
      'item_units',
      'batches',
      'par_levels',
      'count_reason_codes',
      'stock_movements',
      'stock_levels',
    ]) {
      expect(rlsPhase1Sql).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
      );
    }
  });

  it('uses unique expression indexes instead of expression primary keys', () => {
    expect(foundationSql).not.toMatch(/primary\s+key\s*\([^)]*coalesce/i);
    expect(foundationSql).toMatch(/create\s+unique\s+index\s+feature_flags_scope_unique_idx/i);
    expect(inventorySql).not.toMatch(/primary\s+key\s*\([^)]*coalesce/i);
    expect(inventorySql).toMatch(/create\s+unique\s+index\s+stock_levels_scope_unique_idx/i);
  });

  it('enforces append-only audit_logs & stock_movements and blocks direct stock_levels writes (P1, MP-MOV-002)', () => {
    expect(foundationSql).toMatch(/before\s+update\s+or\s+delete\s+on\s+public\.audit_logs/i);
    expect(rlsPhase0Sql).toMatch(
      /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.audit_logs\s+from\s+anon,\s*authenticated/i,
    );

    expect(inventorySql).toMatch(/before\s+update\s+or\s+delete\s+on\s+public\.stock_movements/i);
    expect(rlsPhase1Sql).toMatch(
      /revoke\s+update,\s*delete\s+on\s+public\.stock_movements\s+from\s+anon,\s*authenticated/i,
    );
    expect(rlsPhase1Sql).toMatch(
      /revoke\s+insert,\s*update,\s*delete\s+on\s+public\.stock_levels\s+from\s+anon,\s*authenticated/i,
    );
  });

  it('seeds 100 items, all 6 roles, scanner_beta=false, and populates stock via ledger only (T-1.6, P1)', () => {
    expect(seedSql).toMatch(/'scanner_beta'[^)]*false/i);
    for (const role of ['admin', 'store_manager', 'pharmacist', 'nurse', 'coordinator', 'auditor']) {
      expect(seedSql).toContain(`'${role}'`);
    }

    // Verify 100 numbered item tuples exist in seed.sql and zero direct inserts into stock_levels
    const itemEntries = seedSql.match(/\(\d+,\s*'(?:MED|CTL|IVF|SRG|PPE|CON|BLD|OXY)-\d{3}'/g);
    expect(itemEntries).toHaveLength(100);
    expect(seedSql).not.toMatch(/insert\s+into\s+public\.stock_levels/i);
    expect(seedSql).toMatch(/insert\s+into\s+public\.stock_movements/i);
  });

  it('keeps pgTAP plan counts accurate across Phase 0 and Phase 1 suites', () => {
    for (const sql of [pgTap0Sql, pgTap1Sql]) {
      const planMatch = sql.match(/select\s+plan\((\d+)\)/i);
      expect(planMatch).not.toBeNull();
      const planned = Number.parseInt(planMatch![1], 10);
      expect(countPgTapAssertions(sql)).toBe(planned);
    }
  });
});
