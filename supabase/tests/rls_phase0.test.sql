-- Phase 0 pgTAP RLS, Integrity & Audit Tests
-- Covers MP-AUTH-002, MP-AUTH-003, MP-AUTH-006, MP-INV-004, MP-SCN-001, MP-RPT-002

begin;

select plan(27);

-- Helper to set JWT claim context inside the test transaction
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

-- Create second hospital + no-role user in postgres superuser context
insert into public.hospitals (id, name, code)
values ('99999999-9999-9999-9999-999999999999', 'Other Hospital', 'OTH-01');

insert into public.locations (id, hospital_id, parent_id, name, type)
values ('99999999-9999-9999-9999-999999999901', '99999999-9999-9999-9999-999999999999', null, 'Other ICU', 'icu');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000', '39999999-9999-9999-9999-999999999999', 'authenticated', 'authenticated',
  'norole@medpulse.local', crypt('x', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
);

-- 1. Location nesting > 1 level is blocked (MP-INV-004)
select throws_ok(
  $$
    insert into public.locations (hospital_id, parent_id, name, type)
    values ('11111111-1111-1111-1111-111111111111', '21111111-1111-1111-1111-111111111108', 'Too Deep Bin', 'ward')
  $$,
  null,
  null,
  'Location nesting deeper than 1 level below top-level is rejected'
);

-- 2. Anon user cannot read hospitals or locations
select pg_temp.set_jwt('anon', null);
select is((select count(*)::int from public.hospitals), 0, 'anon sees 0 hospitals');
select is((select count(*)::int from public.locations), 0, 'anon sees 0 locations');

-- 3. Authenticated user with no profile sees 0 hospitals, 0 locations, 0 flags (MP-AUTH-002)
select pg_temp.set_jwt('authenticated', '39999999-9999-9999-9999-999999999999');
select is((select count(*)::int from public.hospitals), 0, 'no-role user sees 0 hospitals');
select is((select count(*)::int from public.locations), 0, 'no-role user sees 0 locations');
select is((select count(*)::int from public.feature_flags), 0, 'no-role user sees 0 feature flags');

-- 4. Nurse sees only assigned General Ward A + its child Ward A - Shelf 1 (2 rows), never ICU or Other Hospital
select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111104');
select is((select count(*)::int from public.locations), 2, 'nurse sees only assigned ward and its child shelf');
select is(
  (select count(*)::int from public.locations where id = '21111111-1111-1111-1111-111111111104'),
  0,
  'nurse cannot read ICU location'
);

-- 5. Nurse cannot escalate own role via profile update
select throws_ok(
  $$
    update public.profiles set role = 'admin' where id = '31111111-1111-1111-1111-111111111104'
  $$,
  null,
  null,
  'nurse cannot escalate own role'
);

-- 6. Nurse can update own locale preference
select lives_ok(
  $$
    update public.profiles set locale = 'hi' where id = '31111111-1111-1111-1111-111111111104'
  $$,
  'nurse can update own locale'
);

-- 7. Nurse cannot read audit_logs or mutate feature_flags
select is((select count(*)::int from public.audit_logs), 0, 'nurse sees 0 audit logs');
select throws_ok(
  $$
    insert into public.feature_flags (key, hospital_id, enabled)
    values ('scanner_beta', '11111111-1111-1111-1111-111111111111', true)
  $$,
  null,
  null,
  'nurse cannot insert feature_flags'
);
update public.feature_flags set enabled = true where key = 'scanner_beta';
select is(
  (select enabled from public.feature_flags where key = 'scanner_beta' and user_id is null),
  false,
  'nurse update to feature_flags affects 0 rows'
);

-- 8. Store manager, pharmacist, coordinator see all 8 locations in Hospital 1, 0 in Hospital 2, 0 audit_logs
select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111102');
select is((select count(*)::int from public.locations), 8, 'store_manager sees all 8 hospital 1 locations');
select is((select count(*)::int from public.audit_logs), 0, 'store_manager cannot read audit_logs');

select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111103');
select is((select count(*)::int from public.locations), 8, 'pharmacist sees all 8 hospital 1 locations');
select is((select count(*)::int from public.audit_logs), 0, 'pharmacist cannot read audit_logs');

select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111105');
select is((select count(*)::int from public.locations), 8, 'coordinator sees all 8 hospital 1 locations');
select is((select count(*)::int from public.audit_logs), 0, 'coordinator cannot read audit_logs');

-- 9. Auditor can read audit_logs and record auth event
select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111106');
select lives_ok(
  $$ select public.record_auth_event('auth.sign_in', '{"method":"email_otp"}'::jsonb) $$,
  'authenticated user with active profile can record auth event'
);
select ok((select count(*) >= 1 from public.audit_logs where action = 'auth.sign_in'), 'auditor can read auth sign_in audit log');

-- 10. Direct insert/delete on audit_logs is forbidden even for admin (MP-RPT-002)
select pg_temp.set_jwt('authenticated', '31111111-1111-1111-1111-111111111101');
select throws_ok(
  $$
    insert into public.audit_logs (hospital_id, action, entity_type)
    values ('11111111-1111-1111-1111-111111111111', 'tamper', 'test')
  $$,
  null,
  null,
  'admin cannot directly insert into audit_logs'
);
select throws_ok(
  $$ delete from public.audit_logs $$,
  null,
  null,
  'admin cannot delete from audit_logs'
);

-- 11. Admin role change writes audit log (MP-AUTH-006)
select lives_ok(
  $$
    update public.profiles set role = 'pharmacist' where id = '31111111-1111-1111-1111-111111111104'
  $$,
  'admin can change another user role in same hospital'
);
select ok(
  (select count(*) >= 1 from public.audit_logs where action = 'profile.role_changed' and entity_id = '31111111-1111-1111-1111-111111111104'),
  'profile role change writes audit_logs entry'
);

-- 12. Append-only trigger blocks UPDATE and DELETE even under superuser/owner role
reset role;
select throws_ok(
  $$ update public.audit_logs set action = 'tampered' $$,
  null,
  null,
  'append-only trigger blocks UPDATE on audit_logs'
);
select throws_ok(
  $$ delete from public.audit_logs $$,
  null,
  null,
  'append-only trigger blocks DELETE on audit_logs'
);

select * from finish();
rollback;
