-- MedPulse Phase 1 Inventory & Ledger Schema
-- Satisfies: MP-INV-001..006, MP-MOV-001..004, MP-MOV-006, MP-MOV-007, MP-MOV-009

create type public.stock_condition as enum (
  'usable',
  'damaged',
  'expired',
  'quarantined'
);

create type public.movement_type as enum (
  'receive',
  'issue',
  'transfer',
  'return',
  'wastage',
  'adjustment',
  'count_adjustment'
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (hospital_id, slug)
);

create index categories_hospital_idx on public.categories (hospital_id, name);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  lead_time_days int not null default 7 check (lead_time_days >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hospital_id, name)
);

create index suppliers_hospital_idx on public.suppliers (hospital_id, name);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  sku text not null,
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  base_unit text not null,
  barcode text,
  criticality char(1) not null default 'B' check (criticality in ('A', 'B', 'C')),
  is_controlled boolean not null default false,
  is_cold_chain boolean not null default false,
  tracks_batch boolean not null default true,
  tracks_expiry boolean not null default true,
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, sku)
);

create index items_hospital_name_idx on public.items (hospital_id, name);
create index items_hospital_barcode_idx on public.items (hospital_id, barcode) where barcode is not null;

create table public.item_units (
  item_id uuid not null references public.items(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  unit text not null,
  factor_to_base int not null check (factor_to_base > 0),
  is_order_pack boolean not null default false,
  primary key (item_id, unit)
);

create index item_units_hospital_idx on public.item_units (hospital_id, item_id);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  batch_no text not null,
  expiry_date date,
  created_at timestamptz not null default now(),
  unique (item_id, batch_no)
);

create index batches_expiry_idx on public.batches (expiry_date);
create index batches_hospital_item_idx on public.batches (hospital_id, item_id);

create table public.par_levels (
  item_id uuid not null references public.items(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  min_qty int not null check (min_qty >= 0),
  par_qty int not null check (par_qty >= 0),
  max_qty int not null check (max_qty >= 0),
  check (min_qty <= par_qty and par_qty <= max_qty),
  primary key (item_id, location_id)
);

create index par_levels_hospital_loc_idx on public.par_levels (hospital_id, location_id);

create table public.count_reason_codes (
  code text primary key,
  label_en text not null,
  label_hi text,
  requires_note boolean not null default false,
  is_active boolean not null default true
);

-- Append-only ledger (P1, MP-MOV-001, MP-MOV-002)
create table public.stock_movements (
  id uuid primary key, -- client-generated UUID for idempotency (MP-MOV-009)
  hospital_id uuid not null references public.hospitals(id),
  item_id uuid not null references public.items(id),
  batch_id uuid references public.batches(id),
  from_location_id uuid references public.locations(id),
  to_location_id uuid references public.locations(id),
  condition public.stock_condition not null default 'usable',
  qty int not null check (qty > 0),
  type public.movement_type not null,
  reason_code text references public.count_reason_codes(code),
  note text,
  ref_type text,
  ref_id uuid,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index stock_movements_item_created_idx on public.stock_movements (item_id, created_at desc);
create index stock_movements_hospital_created_idx on public.stock_movements (hospital_id, created_at desc);

-- Maintained solely by stock_movements trigger (P1, MP-MOV-003)
create table public.stock_levels (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  batch_id uuid references public.batches(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  condition public.stock_condition not null default 'usable',
  qty int not null default 0 check (qty >= 0),
  reserved_qty int not null default 0 check (reserved_qty >= 0),
  last_counted_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index stock_levels_scope_unique_idx
  on public.stock_levels (
    item_id,
    coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    location_id,
    condition
  );

create index stock_levels_hospital_loc_idx on public.stock_levels (hospital_id, location_id);
create index stock_levels_hospital_item_idx on public.stock_levels (hospital_id, item_id);

-- Hospital consistency triggers
create or replace function public.enforce_item_hospital_match()
returns trigger
language plpgsql
as $$
declare
  v_item_hospital uuid;
begin
  select hospital_id into v_item_hospital from public.items where id = new.item_id;
  if v_item_hospital is null or v_item_hospital <> new.hospital_id then
    raise exception 'Referenced item does not belong to hospital %', new.hospital_id;
  end if;
  return new;
end;
$$;

create trigger trg_item_units_hospital
  before insert or update on public.item_units
  for each row
  execute function public.enforce_item_hospital_match();

create trigger trg_batches_hospital
  before insert or update on public.batches
  for each row
  execute function public.enforce_item_hospital_match();

create or replace function public.enforce_par_level_hospital()
returns trigger
language plpgsql
as $$
declare
  v_item_hospital uuid;
  v_loc_hospital uuid;
begin
  select hospital_id into v_item_hospital from public.items where id = new.item_id;
  select hospital_id into v_loc_hospital from public.locations where id = new.location_id;

  if v_item_hospital is null or v_loc_hospital is null then
    raise exception 'Invalid item or location reference on par_levels';
  end if;

  if new.hospital_id <> v_item_hospital or new.hospital_id <> v_loc_hospital then
    raise exception 'par_levels hospital_id must match item and location';
  end if;

  return new;
end;
$$;

create trigger trg_par_levels_hospital
  before insert or update on public.par_levels
  for each row
  execute function public.enforce_par_level_hospital();

-- Append-only enforcement on stock_movements (MP-MOV-002)
create or replace function public.prevent_stock_movement_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'stock_movements is append-only and cannot be modified or deleted (MP-MOV-002)';
end;
$$;

create trigger trg_stock_movements_append_only
  before update or delete on public.stock_movements
  for each row
  execute function public.prevent_stock_movement_mutation();

-- Validate movement shape, batch/expiry rules, and reason codes (MP-MOV-006, MP-MOV-007)
create or replace function public.validate_stock_movement()
returns trigger
language plpgsql
as $$
declare
  v_item record;
  v_batch record;
  v_from_hospital uuid;
  v_to_hospital uuid;
  v_creator_hospital uuid;
  v_reason record;
begin
  select hospital_id, tracks_batch, tracks_expiry
    into v_item
  from public.items
  where id = new.item_id;

  if not found or v_item.hospital_id <> new.hospital_id then
    raise exception 'Item does not belong to hospital %', new.hospital_id;
  end if;

  select hospital_id into v_creator_hospital
  from public.profiles
  where id = new.created_by and is_active = true;

  if v_creator_hospital is null or v_creator_hospital <> new.hospital_id then
    raise exception 'Movement creator must be an active user in the same hospital';
  end if;

  if new.from_location_id is not null then
    select hospital_id into v_from_hospital from public.locations where id = new.from_location_id;
    if v_from_hospital is null or v_from_hospital <> new.hospital_id then
      raise exception 'Source location does not belong to hospital';
    end if;
  end if;

  if new.to_location_id is not null then
    select hospital_id into v_to_hospital from public.locations where id = new.to_location_id;
    if v_to_hospital is null or v_to_hospital <> new.hospital_id then
      raise exception 'Destination location does not belong to hospital';
    end if;
  end if;

  if new.batch_id is not null then
    select hospital_id, item_id, expiry_date
      into v_batch
    from public.batches
    where id = new.batch_id;

    if not found or v_batch.hospital_id <> new.hospital_id or v_batch.item_id <> new.item_id then
      raise exception 'Batch does not belong to item and hospital';
    end if;
  end if;

  case new.type
    when 'receive' then
      if new.from_location_id is not null or new.to_location_id is null then
        raise exception 'receive requires to_location_id and null from_location_id';
      end if;
      if v_item.tracks_batch and new.batch_id is null then
        raise exception 'Batch number is required for batch-tracked items (MP-MOV-006)';
      end if;
      if v_item.tracks_expiry and (new.batch_id is null or v_batch.expiry_date is null) then
        raise exception 'Expiry date is required for expiry-tracked items (MP-MOV-006)';
      end if;
    when 'issue', 'wastage' then
      if new.from_location_id is null or new.to_location_id is not null then
        raise exception '% requires from_location_id and null to_location_id', new.type;
      end if;
    when 'transfer' then
      if new.from_location_id is null or new.to_location_id is null or new.from_location_id = new.to_location_id then
        raise exception 'transfer requires two distinct locations';
      end if;
    when 'return' then
      if new.to_location_id is null or (new.from_location_id is not null and new.from_location_id = new.to_location_id) then
        raise exception 'return requires to_location_id distinct from from_location_id';
      end if;
    when 'adjustment', 'count_adjustment' then
      if (new.from_location_id is null) = (new.to_location_id is null) then
        raise exception '% requires exactly one of from_location_id or to_location_id', new.type;
      end if;
  end case;

  if new.type in ('wastage', 'adjustment', 'count_adjustment') then
    if new.reason_code is null then
      raise exception 'Reason code is required for % (MP-MOV-007)', new.type;
    end if;
    select code, requires_note, is_active
      into v_reason
    from public.count_reason_codes
    where code = new.reason_code;

    if not found or not v_reason.is_active then
      raise exception 'Invalid or inactive reason code: %', new.reason_code;
    end if;

    if v_reason.requires_note and coalesce(btrim(new.note), '') = '' then
      raise exception 'Note is required for reason code %', new.reason_code;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_stock_movements_validate
  before insert on public.stock_movements
  for each row
  execute function public.validate_stock_movement();

-- Atomically maintain stock_levels and write audit_logs (MP-MOV-003, MP-MOV-004, MP-RPT-002)
create or replace function public.apply_stock_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_loc uuid;
  v_second_loc uuid;
  v_level_id uuid;
  v_qty int;
  v_reserved int;
  v_available int;
begin
  -- Deterministic advisory lock order prevents deadlocks on concurrent transfers
  if new.from_location_id is not null and new.to_location_id is not null then
    v_first_loc := least(new.from_location_id, new.to_location_id);
    v_second_loc := greatest(new.from_location_id, new.to_location_id);
    perform pg_advisory_xact_lock(hashtext(new.item_id::text), hashtext(v_first_loc::text));
    if v_second_loc <> v_first_loc then
      perform pg_advisory_xact_lock(hashtext(new.item_id::text), hashtext(v_second_loc::text));
    end if;
  elsif new.from_location_id is not null then
    perform pg_advisory_xact_lock(hashtext(new.item_id::text), hashtext(new.from_location_id::text));
  elsif new.to_location_id is not null then
    perform pg_advisory_xact_lock(hashtext(new.item_id::text), hashtext(new.to_location_id::text));
  end if;

  if new.from_location_id is not null then
    select id, qty, reserved_qty
      into v_level_id, v_qty, v_reserved
    from public.stock_levels
    where item_id = new.item_id
      and batch_id is not distinct from new.batch_id
      and location_id = new.from_location_id
      and condition = new.condition
    for update;

    v_available := greatest(coalesce(v_qty, 0) - coalesce(v_reserved, 0), 0);

    if not found or v_available < new.qty then
      raise exception 'Only % available', v_available
        using errcode = 'check_violation';
    end if;

    update public.stock_levels
       set qty = qty - new.qty,
           updated_at = now()
     where id = v_level_id;
  end if;

  if new.to_location_id is not null then
    update public.stock_levels
       set qty = qty + new.qty,
           updated_at = now()
     where item_id = new.item_id
       and batch_id is not distinct from new.batch_id
       and location_id = new.to_location_id
       and condition = new.condition;

    if not found then
      insert into public.stock_levels (
        hospital_id, item_id, batch_id, location_id, condition, qty
      ) values (
        new.hospital_id, new.item_id, new.batch_id, new.to_location_id, new.condition, new.qty
      );
    end if;
  end if;

  insert into public.audit_logs (
    hospital_id, actor_id, action, entity_type, entity_id, after_data
  ) values (
    new.hospital_id,
    new.created_by,
    'stock.' || new.type::text,
    'stock_movement',
    new.id,
    jsonb_build_object(
      'item_id', new.item_id,
      'batch_id', new.batch_id,
      'from_location_id', new.from_location_id,
      'to_location_id', new.to_location_id,
      'condition', new.condition,
      'qty', new.qty,
      'reason_code', new.reason_code
    )
  );

  return new;
end;
$$;

create trigger trg_stock_movements_apply
  after insert on public.stock_movements
  for each row
  execute function public.apply_stock_movement();

-- Idempotent client movement submission RPC (SECURITY INVOKER preserves caller RLS, MP-MOV-009)
create or replace function public.submit_stock_movement(
  p_id uuid,
  p_item_id uuid,
  p_type public.movement_type,
  p_qty int,
  p_condition public.stock_condition default 'usable',
  p_from_location_id uuid default null,
  p_to_location_id uuid default null,
  p_batch_id uuid default null,
  p_batch_no text default null,
  p_expiry_date date default null,
  p_reason_code text default null,
  p_note text default null,
  p_ref_type text default null,
  p_ref_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_hospital_id uuid := public.auth_hospital_id();
  v_existing_id uuid;
  v_resolved_batch_id uuid := p_batch_id;
  v_inserted_id uuid;
begin
  if v_user_id is null or v_hospital_id is null then
    raise exception 'Authenticated hospital user required';
  end if;

  select id into v_existing_id
  from public.stock_movements
  where id = p_id;

  if found then
    return jsonb_build_object('movement_id', v_existing_id, 'duplicate', true);
  end if;

  if v_resolved_batch_id is null and p_batch_no is not null and btrim(p_batch_no) <> '' then
    select id into v_resolved_batch_id
    from public.batches
    where item_id = p_item_id
      and batch_no = btrim(p_batch_no);

    if not found then
      insert into public.batches (hospital_id, item_id, batch_no, expiry_date)
      values (v_hospital_id, p_item_id, btrim(p_batch_no), p_expiry_date)
      on conflict (item_id, batch_no) do update
        set expiry_date = coalesce(public.batches.expiry_date, excluded.expiry_date)
      returning id into v_resolved_batch_id;
    end if;
  end if;

  insert into public.stock_movements (
    id,
    hospital_id,
    item_id,
    batch_id,
    from_location_id,
    to_location_id,
    condition,
    qty,
    type,
    reason_code,
    note,
    ref_type,
    ref_id,
    created_by
  ) values (
    p_id,
    v_hospital_id,
    p_item_id,
    v_resolved_batch_id,
    p_from_location_id,
    p_to_location_id,
    p_condition,
    p_qty,
    p_type,
    p_reason_code,
    p_note,
    p_ref_type,
    p_ref_id,
    v_user_id
  )
  on conflict (id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    return jsonb_build_object('movement_id', p_id, 'duplicate', true);
  end if;

  return jsonb_build_object('movement_id', v_inserted_id, 'duplicate', false);
end;
$$;

revoke all on function public.submit_stock_movement(
  uuid, uuid, public.movement_type, int, public.stock_condition,
  uuid, uuid, uuid, text, date, text, text, text, uuid
) from public;

grant execute on function public.submit_stock_movement(
  uuid, uuid, public.movement_type, int, public.stock_condition,
  uuid, uuid, uuid, text, date, text, text, text, uuid
) to authenticated;
