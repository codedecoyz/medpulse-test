-- Phase 1 pgTAP Ledger, Validation & RLS Tests
-- Covers MP-INV-001, 005, 006; MP-MOV-001..004, 006, 007, 009; MP-AUTH-003

begin;

select plan(20);

create or replace function pg_temp.set_jwt(p_role text, p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('role', p_role, true);
  if p_user_id is null then
    perform set_config('request.jwt.claims', '{}', true);
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_user_id::text, 'role', p_role)::text,
      true
    );
  end if;
end;
$$;

-- 1. Seed verification: 100 items exist for hospital 1
select is(
  (select count(*)::int from public.items where hospital_id = '11111111-1111-1111-1111-111111111111'),
  100,
  'seed contains 100 items'
);

-- 2. Duplicate SKU in same hospital rejected (MP-INV-001)
select throws_ok(
  $$
    insert into public.items (hospital_id, sku, name, base_unit)
    values ('11111111-1111-1111-1111-111111111111', 'MED-001', 'Duplicate Item', 'vial')
  $$,
  null,
  null,
  'duplicate SKU in same hospital is rejected'
);

-- 3. PAR level check min <= par <= max (MP-INV-005)
select throws_ok(
  $$
    insert into public.par_levels (item_id, location_id, hospital_id, min_qty, par_qty, max_qty)
    select id, '21111111-1111-1111-1111-111111111104', hospital_id, 50, 30, 100
    from public.items where sku = 'MED-001'
    on conflict (item_id, location_id) do update set min_qty = 50, par_qty = 30, max_qty = 100
  $$,
  null,
  null,
  'invalid PAR order min > par is rejected'
);

-- 4. Nurse can read General Ward A stock but NOT ICU stock (MP-AUTH-003)
select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111104');
select ok(
  (select count(*) >= 1 from public.stock_levels where location_id = '21111111-1111-1111-1111-111111111106'),
  'nurse reads assigned General Ward A stock'
);
select is(
  (select count(*)::int from public.stock_levels where location_id = '21111111-1111-1111-1111-111111111104'),
  0,
  'nurse cannot read ICU stock'
);

-- 5. Nurse cannot issue stock from Central Store (not assigned)
select throws_ok(
  $$
    select public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111101',
      (select id from public.items where sku = 'MED-001'),
      'issue',
      1,
      'usable',
      '21111111-1111-1111-1111-111111111101',
      null,
      (select id from public.batches where item_id = (select id from public.items where sku = 'MED-001') limit 1)
    )
  $$,
  null,
  null,
  'nurse blocked from issuing out of unassigned Central Store'
);

-- 6. Coordinator and Auditor cannot record stock movements (Section 3.2)
select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111105');
select throws_ok(
  $$
    select public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111102',
      (select id from public.items where sku = 'CON-081'),
      'issue',
      1,
      'usable',
      '21111111-1111-1111-1111-111111111101'
    )
  $$,
  null,
  null,
  'coordinator cannot insert stock movements'
);

select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111106');
select throws_ok(
  $$
    select public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111103',
      (select id from public.items where sku = 'CON-081'),
      'issue',
      1,
      'usable',
      '21111111-1111-1111-1111-111111111101'
    )
  $$,
  null,
  null,
  'auditor cannot insert stock movements'
);

-- 7. Store manager cannot directly mutate stock_levels (Principle P1)
select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111102');
select throws_ok(
  $$ update public.stock_levels set qty = 9999 $$,
  null,
  null,
  'direct UPDATE on stock_levels is denied'
);

-- 8. Receive batch-tracked item without batch/expiry is blocked (MP-MOV-006)
select throws_ok(
  $$
    select public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111104',
      (select id from public.items where sku = 'MED-001'),
      'receive',
      10,
      'usable',
      null,
      '21111111-1111-1111-1111-111111111101'
    )
  $$,
  null,
  null,
  'receiving batch-tracked item without batch fails'
);

-- 9. Wastage without reason code is blocked (MP-MOV-007)
select throws_ok(
  $$
    select public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111105',
      (select id from public.items where sku = 'CON-081'),
      'wastage',
      1,
      'usable',
      '21111111-1111-1111-1111-111111111101'
    )
  $$,
  null,
  null,
  'wastage without reason code is rejected'
);

-- 10. Negative stock issue is blocked with SQLSTATE 23514 (MP-MOV-004)
select throws_ok(
  $$
    select public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111107',
      (select id from public.items where sku = 'CON-081'),
      'issue',
      999999,
      'usable',
      '21111111-1111-1111-1111-111111111101'
    )
  $$,
  '23514',
  null,
  'negative stock prevention raises check_violation (23514)'
);

-- 11. Atomic transfer updates both locations (including NULL batch_id item CON-081)
select lives_ok(
  $$
    select public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111108',
      (select id from public.items where sku = 'CON-081'),
      'transfer',
      5,
      'usable',
      '21111111-1111-1111-1111-111111111101',
      '21111111-1111-1111-1111-111111111103'
    )
  $$,
  'non-batch transfer succeeds atomically'
);

-- 12. Idempotent replay with same UUID does not double-count (MP-MOV-009)
select is(
  (
    select (public.submit_stock_movement(
      'aaaaaaaa-1111-1111-1111-111111111108',
      (select id from public.items where sku = 'CON-081'),
      'transfer',
      5,
      'usable',
      '21111111-1111-1111-1111-111111111101',
      '21111111-1111-1111-1111-111111111103'
    )->>'duplicate')::boolean
  ),
  true,
  'replaying movement UUID returns duplicate=true'
);

-- 13. Check source & destination quantities reflect exactly 5 transferred
select is(
  (
    select qty from public.stock_levels
    where item_id = (select id from public.items where sku = 'CON-081')
      and location_id = '21111111-1111-1111-1111-111111111101'
      and batch_id is null
      and condition = 'usable'
  ),
  45,
  'idempotent replay kept Central Store stock at 50 - 5 = 45'
);

select is(
  (
    select qty from public.stock_levels
    where item_id = (select id from public.items where sku = 'CON-081')
      and location_id = '21111111-1111-1111-1111-111111111103'
      and batch_id is null
      and condition = 'usable'
  ),
  15,
  'idempotent replay kept ER stock at 10 + 5 = 15'
);

-- 14. stock_movements is append-only (MP-MOV-002)
select throws_ok(
  $$ delete from public.stock_movements where id = 'aaaaaaaa-1111-1111-1111-111111111108' $$,
  null,
  null,
  'authenticated user cannot delete stock_movements'
);

reset role;
select throws_ok(
  $$ update public.stock_movements set qty = 999 where id = 'aaaaaaaa-1111-1111-1111-111111111108' $$,
  null,
  null,
  'append-only trigger blocks UPDATE on stock_movements'
);
select throws_ok(
  $$ delete from public.stock_movements where id = 'aaaaaaaa-1111-1111-1111-111111111108' $$,
  null,
  null,
  'append-only trigger blocks DELETE on stock_movements'
);

-- 15. Movement created an audit log entry
select ok(
  (select count(*) >= 1 from public.audit_logs where entity_id = 'aaaaaaaa-1111-1111-1111-111111111108'),
  'stock movement writes audit_logs entry'
);

select * from finish();
rollback;
