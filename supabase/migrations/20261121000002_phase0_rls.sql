-- MedPulse Phase 0 RLS Baseline & Helper Functions
-- Satisfies: MP-AUTH-002, MP-AUTH-003, MP-SCN-001, MP-RPT-002

-- Helper: current authenticated user's active hospital_id
create or replace function public.auth_hospital_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select hospital_id
  from public.profiles
  where id = auth.uid()
    and is_active = true;
$$;

-- Helper: current authenticated user's active role
create or replace function public.auth_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true;
$$;

-- Helper: role membership check
create or replace function public.auth_has_role(p_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.auth_user_role() = any(p_roles), false);
$$;

-- Helper: location-level access check (nurses scoped to assigned locations + sub-locations)
create or replace function public.auth_has_location_access(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and l.hospital_id = public.auth_hospital_id()
      and (
        public.auth_user_role() <> 'nurse'::public.user_role
        or exists (
          select 1
          from public.user_locations ul
          where ul.user_id = auth.uid()
            and (ul.location_id = l.id or ul.location_id = l.parent_id)
        )
      )
  );
$$;

revoke all on function public.auth_hospital_id() from public;
revoke all on function public.auth_user_role() from public;
revoke all on function public.auth_has_role(public.user_role[]) from public;
revoke all on function public.auth_has_location_access(uuid) from public;

grant execute on function public.auth_hospital_id() to authenticated;
grant execute on function public.auth_user_role() to authenticated;
grant execute on function public.auth_has_role(public.user_role[]) to authenticated;
grant execute on function public.auth_has_location_access(uuid) to authenticated;

-- Enable RLS on all Phase 0 tables
alter table public.hospitals enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_logs enable row level security;

-- hospitals policies
create policy hospitals_select_own
  on public.hospitals
  for select
  to authenticated
  using (id = public.auth_hospital_id());

create policy hospitals_update_admin
  on public.hospitals
  for update
  to authenticated
  using (id = public.auth_hospital_id() and public.auth_user_role() = 'admin'::public.user_role)
  with check (id = public.auth_hospital_id() and public.auth_user_role() = 'admin'::public.user_role);

-- locations policies
create policy locations_select_scoped
  on public.locations
  for select
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and (
      public.auth_user_role() <> 'nurse'::public.user_role
      or public.auth_has_location_access(id)
    )
  );

create policy locations_insert_admin
  on public.locations
  for insert
  to authenticated
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

create policy locations_update_admin
  on public.locations
  for update
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

create policy locations_delete_admin
  on public.locations
  for delete
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

-- profiles policies
create policy profiles_select_scoped
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or (
      hospital_id = public.auth_hospital_id()
      and public.auth_user_role() in (
        'admin'::public.user_role,
        'store_manager'::public.user_role,
        'pharmacist'::public.user_role,
        'coordinator'::public.user_role,
        'auditor'::public.user_role
      )
    )
  );

create policy profiles_insert_admin
  on public.profiles
  for insert
  to authenticated
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

create policy profiles_update_self_or_admin
  on public.profiles
  for update
  to authenticated
  using (
    (id = auth.uid() and hospital_id = public.auth_hospital_id())
    or (hospital_id = public.auth_hospital_id() and public.auth_user_role() = 'admin'::public.user_role)
  )
  with check (
    (id = auth.uid() and hospital_id = public.auth_hospital_id())
    or (hospital_id = public.auth_hospital_id() and public.auth_user_role() = 'admin'::public.user_role)
  );

create policy profiles_delete_admin
  on public.profiles
  for delete
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

-- user_locations policies
create policy user_locations_select_scoped
  on public.user_locations
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      hospital_id = public.auth_hospital_id()
      and public.auth_user_role() in (
        'admin'::public.user_role,
        'store_manager'::public.user_role,
        'coordinator'::public.user_role,
        'auditor'::public.user_role
      )
    )
  );

create policy user_locations_insert_admin
  on public.user_locations
  for insert
  to authenticated
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

create policy user_locations_update_admin
  on public.user_locations
  for update
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

create policy user_locations_delete_admin
  on public.user_locations
  for delete
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

-- feature_flags policies (MP-SCN-001: all hospital users read; admin writes)
create policy feature_flags_select_scoped
  on public.feature_flags
  for select
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and (
      user_id is null
      or user_id = auth.uid()
      or public.auth_user_role() = 'admin'::public.user_role
    )
  );

create policy feature_flags_insert_admin
  on public.feature_flags
  for insert
  to authenticated
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

create policy feature_flags_update_admin
  on public.feature_flags
  for update
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

create policy feature_flags_delete_admin
  on public.feature_flags
  for delete
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() = 'admin'::public.user_role
  );

-- audit_logs policies (admin + auditor read-only; no client insert/update/delete)
create policy audit_logs_select_admin_auditor
  on public.audit_logs
  for select
  to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_user_role() in ('admin'::public.user_role, 'auditor'::public.user_role)
  );

revoke insert, update, delete on public.audit_logs from anon, authenticated;
