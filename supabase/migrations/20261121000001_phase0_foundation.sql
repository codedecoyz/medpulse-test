-- MedPulse Phase 0 Foundation Schema
-- Satisfies: MP-AUTH-002, MP-AUTH-006, MP-INV-004, MP-SCN-001, MP-RPT-002

create extension if not exists pgcrypto;

-- Roles (Section 3.1)
create type public.user_role as enum (
  'admin',
  'store_manager',
  'pharmacist',
  'nurse',
  'coordinator',
  'auditor'
);

-- Hospitals (multi-tenant boundary; v1.0 assumes 1 hospital per deployment)
create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  idle_timeout_minutes int not null default 15 check (idle_timeout_minutes between 1 and 240),
  created_at timestamptz not null default now()
);

-- Locations (MP-INV-004: 7 types, nested at most 1 extra level)
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  parent_id uuid references public.locations(id) on delete restrict,
  name text not null,
  type text not null check (type in (
    'central_store',
    'pharmacy',
    'er',
    'icu',
    'ot',
    'ward',
    'blood_bank'
  )),
  created_at timestamptz not null default now()
);

create index locations_hospital_parent_idx on public.locations (hospital_id, parent_id);

-- Profiles (MP-AUTH-002: every user has exactly one role)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id),
  full_name text not null,
  role public.user_role not null,
  locale text not null default 'en' check (locale in ('en', 'hi')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_hospital_role_idx on public.profiles (hospital_id, role);

-- User-to-Location Assignments (MP-AUTH-002: one or more locations per user)
create table public.user_locations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, location_id)
);

create index user_locations_user_idx on public.user_locations (user_id);

-- Feature Flags (MP-SCN-001: hospital-level + optional per-user override)
create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create unique index feature_flags_scope_unique_idx
  on public.feature_flags (
    key,
    hospital_id,
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index feature_flags_hospital_key_idx on public.feature_flags (hospital_id, key);

-- Immutable Audit Log (MP-AUTH-006, MP-RPT-002)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_hospital_created_idx on public.audit_logs (hospital_id, created_at desc);

-- Enforce location hierarchy: same hospital and at most 1 level below top-level (MP-INV-004)
create or replace function public.enforce_location_hierarchy()
returns trigger
language plpgsql
as $$
declare
  v_parent_hospital uuid;
  v_parent_parent uuid;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A location cannot be its own parent';
    end if;

    select hospital_id, parent_id
      into v_parent_hospital, v_parent_parent
    from public.locations
    where id = new.parent_id;

    if not found then
      raise exception 'Parent location % does not exist', new.parent_id;
    end if;

    if v_parent_hospital <> new.hospital_id then
      raise exception 'Parent location must belong to the same hospital';
    end if;

    if v_parent_parent is not null then
      raise exception 'Locations can only be nested one level below a top-level location (MP-INV-004)';
    end if;

    if tg_op = 'UPDATE' and exists (
      select 1 from public.locations where parent_id = new.id
    ) then
      raise exception 'Cannot nest a location that already has child locations (MP-INV-004)';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_locations_hierarchy
  before insert or update on public.locations
  for each row
  execute function public.enforce_location_hierarchy();

-- Enforce same hospital across user_locations
create or replace function public.enforce_user_location_hospital()
returns trigger
language plpgsql
as $$
declare
  v_user_hospital uuid;
  v_loc_hospital uuid;
begin
  select hospital_id into v_user_hospital from public.profiles where id = new.user_id;
  select hospital_id into v_loc_hospital from public.locations where id = new.location_id;

  if v_user_hospital is null or v_loc_hospital is null then
    raise exception 'Invalid profile or location reference';
  end if;

  if new.hospital_id <> v_user_hospital or new.hospital_id <> v_loc_hospital then
    raise exception 'user_locations hospital_id must match both profile and location hospital_id';
  end if;

  return new;
end;
$$;

create trigger trg_user_locations_hospital
  before insert or update on public.user_locations
  for each row
  execute function public.enforce_user_location_hospital();

-- Enforce same hospital for per-user feature flag overrides
create or replace function public.enforce_feature_flag_scope()
returns trigger
language plpgsql
as $$
declare
  v_user_hospital uuid;
begin
  new.updated_at := now();
  if new.user_id is not null then
    select hospital_id into v_user_hospital from public.profiles where id = new.user_id;
    if v_user_hospital is null or v_user_hospital <> new.hospital_id then
      raise exception 'Feature flag user override must belong to the same hospital';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_feature_flags_scope
  before insert or update on public.feature_flags
  for each row
  execute function public.enforce_feature_flag_scope();

-- Block UPDATE/DELETE on audit_logs (append-only, MP-RPT-002)
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only and cannot be modified or deleted (MP-RPT-002)';
end;
$$;

create trigger trg_audit_logs_append_only
  before update or delete on public.audit_logs
  for each row
  execute function public.prevent_audit_log_mutation();

-- Prevent non-admin users from escalating their own role, hospital, or active flag
create or replace function public.guard_profile_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id uuid := auth.uid();
  v_caller_role public.user_role;
  v_caller_hospital uuid;
begin
  new.updated_at := now();

  if v_caller_id is not null then
    select role, hospital_id
      into v_caller_role, v_caller_hospital
    from public.profiles
    where id = v_caller_id and is_active = true;

    if new.hospital_id is distinct from old.hospital_id then
      raise exception 'Changing hospital_id via client API is forbidden';
    end if;

    if (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
      if v_caller_role is distinct from 'admin'::public.user_role
         or v_caller_hospital is distinct from old.hospital_id then
        raise exception 'Only an admin in the same hospital may change role or active status';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_profiles_guard_sensitive
  before update on public.profiles
  for each row
  execute function public.guard_profile_sensitive_columns();

-- Audit profile role assignment & changes (MP-AUTH-006)
create or replace function public.audit_profile_role_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is not null and not exists (select 1 from public.profiles where id = v_actor_id) then
    v_actor_id := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.audit_logs (
      hospital_id, actor_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      new.hospital_id,
      v_actor_id,
      'profile.role_assigned',
      'profile',
      new.id,
      null,
      jsonb_build_object('role', new.role, 'is_active', new.is_active)
    );
  elsif tg_op = 'UPDATE' and (old.role is distinct from new.role or old.is_active is distinct from new.is_active) then
    insert into public.audit_logs (
      hospital_id, actor_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      new.hospital_id,
      v_actor_id,
      case when old.role is distinct from new.role then 'profile.role_changed' else 'profile.status_changed' end,
      'profile',
      new.id,
      jsonb_build_object('role', old.role, 'is_active', old.is_active),
      jsonb_build_object('role', new.role, 'is_active', new.is_active)
    );
  end if;

  return new;
end;
$$;

create trigger trg_profiles_audit_role
  after insert or update on public.profiles
  for each row
  execute function public.audit_profile_role_changes();

-- Audit feature flag mutations (MP-RPT-002)
create or replace function public.audit_feature_flag_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is not null and not exists (select 1 from public.profiles where id = v_actor_id) then
    v_actor_id := null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.audit_logs (
      hospital_id, actor_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      new.hospital_id,
      coalesce(v_actor_id, new.updated_by),
      'feature_flag.created',
      'feature_flag',
      new.id,
      null,
      jsonb_build_object('key', new.key, 'enabled', new.enabled, 'user_id', new.user_id)
    );
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (
      hospital_id, actor_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      new.hospital_id,
      coalesce(v_actor_id, new.updated_by),
      'feature_flag.updated',
      'feature_flag',
      new.id,
      jsonb_build_object('key', old.key, 'enabled', old.enabled, 'user_id', old.user_id),
      jsonb_build_object('key', new.key, 'enabled', new.enabled, 'user_id', new.user_id)
    );
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (
      hospital_id, actor_id, action, entity_type, entity_id, before_data, after_data
    ) values (
      old.hospital_id,
      coalesce(v_actor_id, old.updated_by),
      'feature_flag.deleted',
      'feature_flag',
      old.id,
      jsonb_build_object('key', old.key, 'enabled', old.enabled, 'user_id', old.user_id),
      null
    );
    return old;
  end if;

  return null;
end;
$$;

create trigger trg_feature_flags_audit
  after insert or update or delete on public.feature_flags
  for each row
  execute function public.audit_feature_flag_changes();

-- Authenticated RPC to record sign-in / sign-out / re-auth in audit_logs (MP-AUTH-006)
create or replace function public.record_auth_event(
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_hospital_id uuid;
  v_log_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_action not in ('auth.sign_in', 'auth.sign_out', 'auth.reauth') then
    raise exception 'Unsupported auth audit action: %', p_action;
  end if;

  select hospital_id
    into v_hospital_id
  from public.profiles
  where id = v_user_id and is_active = true;

  if v_hospital_id is null then
    raise exception 'Active hospital profile required to record auth event';
  end if;

  insert into public.audit_logs (
    hospital_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    v_hospital_id,
    v_user_id,
    p_action,
    'auth_session',
    v_user_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

revoke all on function public.record_auth_event(text, jsonb) from public;
grant execute on function public.record_auth_event(text, jsonb) to authenticated;
