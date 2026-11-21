-- MedPulse Phase 1 RLS Policies
-- Satisfies: MP-AUTH-003, MP-MOV-002, Section 3.2 permission matrix, Principle P1

alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.items enable row level security;
alter table public.item_units enable row level security;
alter table public.batches enable row level security;
alter table public.par_levels enable row level security;
alter table public.count_reason_codes enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_levels enable row level security;

-- categories
create policy categories_select_hospital
  on public.categories for select to authenticated
  using (hospital_id = public.auth_hospital_id());

create policy categories_write_managers
  on public.categories for all to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  );

-- suppliers
create policy suppliers_select_hospital
  on public.suppliers for select to authenticated
  using (hospital_id = public.auth_hospital_id());

create policy suppliers_write_managers
  on public.suppliers for all to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager']::public.user_role[])
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager']::public.user_role[])
  );

-- items
create policy items_select_hospital
  on public.items for select to authenticated
  using (hospital_id = public.auth_hospital_id());

create policy items_write_managers
  on public.items for all to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  );

-- item_units
create policy item_units_select_hospital
  on public.item_units for select to authenticated
  using (hospital_id = public.auth_hospital_id());

create policy item_units_write_managers
  on public.item_units for all to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  );

-- batches (nurses can insert when receiving into assigned location; edits/deletes restricted)
create policy batches_select_hospital
  on public.batches for select to authenticated
  using (hospital_id = public.auth_hospital_id());

create policy batches_insert_operators
  on public.batches for insert to authenticated
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist','nurse']::public.user_role[])
  );

create policy batches_update_managers
  on public.batches for update to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  );

create policy batches_delete_managers
  on public.batches for delete to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
  );

-- par_levels (scoped for nurses; writable by admin/store_manager per Section 3.2)
create policy par_levels_select_scoped
  on public.par_levels for select to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and (
      public.auth_user_role() <> 'nurse'::public.user_role
      or public.auth_has_location_access(location_id)
    )
  );

create policy par_levels_write_managers
  on public.par_levels for all to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager']::public.user_role[])
  )
  with check (
    hospital_id = public.auth_hospital_id()
    and public.auth_has_role(array['admin','store_manager']::public.user_role[])
  );

-- count_reason_codes
create policy reason_codes_select_authenticated
  on public.count_reason_codes for select to authenticated
  using (public.auth_hospital_id() is not null);

create policy reason_codes_write_admin
  on public.count_reason_codes for all to authenticated
  using (public.auth_user_role() = 'admin'::public.user_role)
  with check (public.auth_user_role() = 'admin'::public.user_role);

-- stock_levels (read scoped by location; NO direct client writes - Principle P1)
create policy stock_levels_select_scoped
  on public.stock_levels for select to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and (
      public.auth_user_role() <> 'nurse'::public.user_role
      or public.auth_has_location_access(location_id)
    )
  );

revoke insert, update, delete on public.stock_levels from anon, authenticated;

-- stock_movements (append-only; Section 3.2: admin/store_manager/pharmacist Y, nurse Own, coordinator/auditor -)
create policy stock_movements_select_scoped
  on public.stock_movements for select to authenticated
  using (
    hospital_id = public.auth_hospital_id()
    and (
      public.auth_user_role() <> 'nurse'::public.user_role
      or (from_location_id is not null and public.auth_has_location_access(from_location_id))
      or (to_location_id is not null and public.auth_has_location_access(to_location_id))
    )
  );

create policy stock_movements_insert_scoped
  on public.stock_movements for insert to authenticated
  with check (
    hospital_id = public.auth_hospital_id()
    and created_by = auth.uid()
    and (
      public.auth_has_role(array['admin','store_manager','pharmacist']::public.user_role[])
      or (
        public.auth_user_role() = 'nurse'::public.user_role
        and (
          (type in ('receive', 'return') and to_location_id is not null and public.auth_has_location_access(to_location_id))
          or (type in ('issue', 'wastage', 'transfer') and from_location_id is not null and public.auth_has_location_access(from_location_id))
        )
      )
    )
  );

revoke update, delete on public.stock_movements from anon, authenticated;
