-- MedPulse Development Seed (Phase 0 + Phase 1, idempotent)
-- 1 hospital, 8 locations, 6 dev roles, flags, 11 reason codes, 8 categories, 6 suppliers,
-- 100 hospital items with UoMs, PAR levels, batches, and ledger-driven initial stock movements.

insert into public.hospitals (id, name, code, idle_timeout_minutes)
values (
  '11111111-1111-1111-1111-111111111111',
  'MedPulse General Hospital',
  'MPGH-01',
  15
)
on conflict (id) do nothing;

-- Locations (7 types + 1 nested child location)
insert into public.locations (id, hospital_id, parent_id, name, type)
values
  ('21111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', null, 'Central Store', 'central_store'),
  ('21111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111', null, 'Main Pharmacy', 'pharmacy'),
  ('21111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111111', null, 'Emergency Room', 'er'),
  ('21111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111111', null, 'ICU', 'icu'),
  ('21111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111111', null, 'Operating Theatre', 'ot'),
  ('21111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111111', null, 'General Ward A', 'ward'),
  ('21111111-1111-1111-1111-111111111107', '11111111-1111-1111-1111-111111111111', null, 'Blood Bank', 'blood_bank'),
  ('21111111-1111-1111-1111-111111111108', '11111111-1111-1111-1111-111111111111', '21111111-1111-1111-1111-111111111106', 'Ward A - Shelf 1', 'ward')
on conflict (id) do nothing;

-- Dev auth.users for local testing across all 6 roles
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-1111-1111-111111111101', 'authenticated', 'authenticated', 'admin@medpulse.local', crypt('medpulse-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-1111-1111-111111111102', 'authenticated', 'authenticated', 'store@medpulse.local', crypt('medpulse-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-1111-1111-111111111103', 'authenticated', 'authenticated', 'pharmacist@medpulse.local', crypt('medpulse-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-1111-1111-111111111104', 'authenticated', 'authenticated', 'nurse@medpulse.local', crypt('medpulse-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-1111-1111-111111111105', 'authenticated', 'authenticated', 'coordinator@medpulse.local', crypt('medpulse-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '31111111-1111-1111-1111-111111111106', 'authenticated', 'authenticated', 'auditor@medpulse.local', crypt('medpulse-dev-only', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do nothing;

-- Profiles
insert into public.profiles (id, hospital_id, full_name, role, locale)
values
  ('31111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'Hospital Admin', 'admin', 'en'),
  ('31111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111', 'Central Store Manager', 'store_manager', 'en'),
  ('31111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111111', 'Lead Pharmacist', 'pharmacist', 'en'),
  ('31111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111111', 'Ward A Nurse In-Charge', 'nurse', 'en'),
  ('31111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111111', 'Emergency Coordinator', 'coordinator', 'en'),
  ('31111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111111', 'Compliance Auditor', 'auditor', 'en')
on conflict (id) do nothing;

-- Location assignments
insert into public.user_locations (user_id, location_id, hospital_id)
values
  ('31111111-1111-1111-1111-111111111101', '21111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111'),
  ('31111111-1111-1111-1111-111111111102', '21111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111'),
  ('31111111-1111-1111-1111-111111111103', '21111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111'),
  ('31111111-1111-1111-1111-111111111104', '21111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111111'),
  ('31111111-1111-1111-1111-111111111105', '21111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111111'),
  ('31111111-1111-1111-1111-111111111106', '21111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

-- Feature flags (MP-SCN-001: scanner_beta default OFF)
insert into public.feature_flags (key, hospital_id, user_id, enabled)
values
  ('scanner_beta', '11111111-1111-1111-1111-111111111111', null, false),
  ('ai_tasks', '11111111-1111-1111-1111-111111111111', null, true),
  ('ai_scenarios', '11111111-1111-1111-1111-111111111111', null, true),
  ('ai_assistant', '11111111-1111-1111-1111-111111111111', null, true)
on conflict do nothing;

-- Standard reason codes (MP-CNT-021, MP-MOV-007)
insert into public.count_reason_codes (code, label_en, label_hi, requires_note)
values
  ('miscount', 'Miscount', 'गिनती में त्रुटि', false),
  ('unrecorded_issue', 'Unrecorded issue', 'बिना दर्ज निर्गम', false),
  ('unrecorded_receipt', 'Unrecorded receipt', 'बिना दर्ज प्राप्ति', false),
  ('wastage_spillage', 'Wastage / spillage', 'बर्बादी / रिसाव', false),
  ('damaged', 'Damaged', 'क्षतिग्रस्त', false),
  ('expired', 'Expired', 'समाप्त (एक्सपायर्ड)', false),
  ('theft_loss', 'Theft / loss suspected', 'चोरी / हानि संदिग्ध', true),
  ('transfer_unrecorded', 'Transfer not recorded', 'स्थानांतरण दर्ज नहीं', false),
  ('wrong_uom', 'Wrong unit of measure', 'गलत माप इकाई', false),
  ('found_stock', 'Found stock', 'मिला हुआ स्टॉक', false),
  ('other', 'Other (note required)', 'अन्य (टिप्पणी आवश्यक)', true)
on conflict (code) do nothing;

-- Categories
insert into public.categories (id, hospital_id, name, slug)
values
  ('41111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'Emergency Drugs', 'emergency-drugs'),
  ('41111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111', 'IV Fluids', 'iv-fluids'),
  ('41111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111111', 'General Medicines', 'medicines'),
  ('41111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111111', 'Controlled Drugs', 'controlled'),
  ('41111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111111', 'Surgical & Trauma', 'surgical'),
  ('41111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111111', 'PPE & Infection Control', 'ppe'),
  ('41111111-1111-1111-1111-111111111107', '11111111-1111-1111-1111-111111111111', 'Blood Products', 'blood'),
  ('41111111-1111-1111-1111-111111111108', '11111111-1111-1111-1111-111111111111', 'Medical Gases & Oxygen', 'oxygen')
on conflict (id) do nothing;

-- Suppliers
insert into public.suppliers (id, hospital_id, name, contact_name, phone, email, lead_time_days)
values
  ('51111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'Apollo Pharma Distributors', 'R. Mehta', '+91-98100-11001', 'orders@apollopharma.example', 3),
  ('51111111-1111-1111-1111-111111111102', '11111111-1111-1111-1111-111111111111', 'MedLife Surgical Co.', 'S. Nair', '+91-98100-11002', 'supply@medlifesurg.example', 5),
  ('51111111-1111-1111-1111-111111111103', '11111111-1111-1111-1111-111111111111', 'CryoCare Cold Chain Ltd.', 'A. Kapoor', '+91-98100-11003', 'cold@cryocare.example', 2),
  ('51111111-1111-1111-1111-111111111104', '11111111-1111-1111-1111-111111111111', 'Bharat Medical Gases', 'V. Rao', '+91-98100-11004', 'dispatch@bharatgas.example', 1),
  ('51111111-1111-1111-1111-111111111105', '11111111-1111-1111-1111-111111111111', 'Regional Blood Centre', 'Dr. K. Sen', '+91-98100-11005', 'blood@regionalcentre.example', 1),
  ('51111111-1111-1111-1111-111111111106', '11111111-1111-1111-1111-111111111111', 'SafeGuard Consumables', 'P. Verma', '+91-98100-11006', 'sales@safeguard.example', 7)
on conflict (id) do nothing;

-- 100 realistic hospital inventory items + UoMs + PAR levels + batches + ledger movements (T-1.6)
do $$
declare
  v_hosp uuid := '11111111-1111-1111-1111-111111111111';
  v_actor uuid := '31111111-1111-1111-1111-111111111102';
  v_central uuid := '21111111-1111-1111-1111-111111111101';
  v_pharm uuid := '21111111-1111-1111-1111-111111111102';
  v_er uuid := '21111111-1111-1111-1111-111111111103';
  v_icu uuid := '21111111-1111-1111-1111-111111111104';
  v_ot uuid := '21111111-1111-1111-1111-111111111105';
  v_ward uuid := '21111111-1111-1111-1111-111111111106';
  v_blood uuid := '21111111-1111-1111-1111-111111111107';
  v_item_id uuid;
  v_cat_id uuid;
  v_sup_id uuid;
  v_batch_early uuid;
  v_batch_late uuid;
  v_loc uuid;
  v_qty int;
  v_mov_id uuid;
  r record;
begin
  for r in
    select *
    from (
      values
        (1, 'MED-001', 'Epinephrine 1mg/ml Ampoule', 'emergency-drugs', 'ampoule', '8901000001', 'A', false, false, true, true, 18.00, 10, 'box'),
        (2, 'MED-002', 'Atropine Sulphate 0.6mg/ml', 'emergency-drugs', 'ampoule', '8901000002', 'A', false, false, true, true, 14.00, 10, 'box'),
        (3, 'MED-003', 'Amiodarone 150mg/3ml Ampoule', 'emergency-drugs', 'ampoule', '8901000003', 'A', false, false, true, true, 95.00, 5, 'box'),
        (4, 'MED-004', 'Norepinephrine 4mg/4ml Vial', 'emergency-drugs', 'vial', '8901000004', 'A', false, false, true, true, 180.00, 10, 'box'),
        (5, 'MED-005', 'Dopamine 200mg/5ml Ampoule', 'emergency-drugs', 'ampoule', '8901000005', 'A', false, false, true, true, 42.00, 10, 'box'),
        (6, 'MED-006', 'Adenosine 6mg/2ml Vial', 'emergency-drugs', 'vial', '8901000006', 'A', false, false, true, true, 210.00, 5, 'box'),
        (7, 'MED-007', 'Naloxone 0.4mg/ml Ampoule', 'emergency-drugs', 'ampoule', '8901000007', 'A', false, false, true, true, 130.00, 10, 'box'),
        (8, 'MED-008', 'Tranexamic Acid 500mg/5ml', 'emergency-drugs', 'ampoule', '8901000008', 'A', false, false, true, true, 65.00, 10, 'box'),
        (9, 'MED-009', 'Hydrocortisone 100mg Vial', 'emergency-drugs', 'vial', '8901000009', 'B', false, false, true, true, 45.00, 10, 'box'),
        (10, 'MED-010', 'Dexamethasone 4mg/ml Vial', 'emergency-drugs', 'vial', '8901000010', 'B', false, false, true, true, 24.00, 10, 'box'),
        (11, 'MED-011', 'Ceftriaxone 1g IV Vial', 'medicines', 'vial', '8901000011', 'B', false, false, true, true, 58.00, 10, 'box'),
        (12, 'MED-012', 'Piperacillin-Tazobactam 4.5g', 'medicines', 'vial', '8901000012', 'A', false, false, true, true, 320.00, 10, 'box'),
        (13, 'MED-013', 'Meropenem 1g IV Vial', 'medicines', 'vial', '8901000013', 'A', false, false, true, true, 540.00, 5, 'box'),
        (14, 'MED-014', 'Paracetamol 1g/100ml IV', 'medicines', 'bottle', '8901000014', 'B', false, false, true, true, 75.00, 12, 'case'),
        (15, 'MED-015', 'Ondansetron 4mg/2ml Ampoule', 'medicines', 'ampoule', '8901000015', 'B', false, false, true, true, 16.00, 10, 'box'),
        (16, 'MED-016', 'Pantoprazole 40mg IV Vial', 'medicines', 'vial', '8901000016', 'B', false, false, true, true, 48.00, 10, 'box'),
        (17, 'MED-017', 'Furosemide 20mg/2ml Ampoule', 'medicines', 'ampoule', '8901000017', 'B', false, false, true, true, 12.00, 10, 'box'),
        (18, 'MED-018', 'Metoprolol 5mg/5ml Ampoule', 'medicines', 'ampoule', '8901000018', 'B', false, false, true, true, 88.00, 10, 'box'),
        (19, 'MED-019', 'Heparin 5000IU/5ml Vial', 'medicines', 'vial', '8901000019', 'A', false, false, true, true, 145.00, 10, 'box'),
        (20, 'MED-020', 'Enoxaparin 40mg Prefilled', 'medicines', 'syringe', '8901000020', 'B', false, false, true, true, 290.00, 10, 'box'),
        (21, 'MED-021', 'Insulin Regular 100IU/ml', 'medicines', 'vial', '8901000021', 'A', false, true, true, true, 165.00, 5, 'pack'),
        (22, 'MED-022', 'Insulin Glargine Pen 3ml', 'medicines', 'pen', '8901000022', 'B', false, true, true, true, 480.00, 5, 'pack'),
        (23, 'MED-023', 'Tetanus Toxoid 0.5ml Vial', 'emergency-drugs', 'vial', '8901000023', 'A', false, true, true, true, 32.00, 10, 'box'),
        (24, 'MED-024', 'Anti-Rabies Vaccine Vial', 'emergency-drugs', 'vial', '8901000024', 'A', false, true, true, true, 340.00, 5, 'pack'),
        (25, 'MED-025', 'Polyvalent Anti-Snake Venom', 'emergency-drugs', 'vial', '8901000025', 'A', false, true, true, true, 620.00, 5, 'pack'),
        (26, 'CTL-026', 'Morphine Sulphate 10mg/ml', 'controlled', 'ampoule', '8901000026', 'A', true, false, true, true, 45.00, 10, 'box'),
        (27, 'CTL-027', 'Fentanyl Citrate 100mcg/2ml', 'controlled', 'ampoule', '8901000027', 'A', true, false, true, true, 85.00, 10, 'box'),
        (28, 'CTL-028', 'Midazolam 5mg/5ml Vial', 'controlled', 'vial', '8901000028', 'A', true, false, true, true, 62.00, 10, 'box'),
        (29, 'CTL-029', 'Ketamine 50mg/ml 10ml Vial', 'controlled', 'vial', '8901000029', 'A', true, false, true, true, 110.00, 10, 'box'),
        (30, 'CTL-030', 'Propofol 1% 20ml Vial', 'controlled', 'vial', '8901000030', 'A', true, false, true, true, 155.00, 5, 'box'),
        (31, 'CTL-031', 'Lorazepam 2mg/ml Ampoule', 'controlled', 'ampoule', '8901000031', 'A', true, true, true, true, 38.00, 10, 'box'),
        (32, 'CTL-032', 'Diazepam 10mg/2ml Ampoule', 'controlled', 'ampoule', '8901000032', 'A', true, false, true, true, 26.00, 10, 'box'),
        (33, 'CTL-033', 'Pethidine 50mg/ml Ampoule', 'controlled', 'ampoule', '8901000033', 'A', true, false, true, true, 52.00, 10, 'box'),
        (34, 'CTL-034', 'Tramadol 50mg/ml Ampoule', 'controlled', 'ampoule', '8901000034', 'B', true, false, true, true, 28.00, 10, 'box'),
        (35, 'CTL-035', 'Phenobarbital 200mg/ml', 'controlled', 'ampoule', '8901000035', 'A', true, false, true, true, 49.00, 10, 'box'),
        (36, 'IVF-036', 'Normal Saline 0.9% 500ml', 'iv-fluids', 'bottle', '8901000036', 'B', false, false, true, true, 34.00, 20, 'box'),
        (37, 'IVF-037', 'Normal Saline 0.9% 1000ml', 'iv-fluids', 'bottle', '8901000037', 'B', false, false, true, true, 54.00, 12, 'case'),
        (38, 'IVF-038', 'Ringer Lactate 500ml', 'iv-fluids', 'bottle', '8901000038', 'A', false, false, true, true, 38.00, 20, 'box'),
        (39, 'IVF-039', 'Dextrose 5% 500ml', 'iv-fluids', 'bottle', '8901000039', 'B', false, false, true, true, 36.00, 20, 'box'),
        (40, 'IVF-040', 'Dextrose 10% 500ml', 'iv-fluids', 'bottle', '8901000040', 'B', false, false, true, true, 42.00, 20, 'box'),
        (41, 'IVF-041', 'DNS 0.9%/5% 500ml', 'iv-fluids', 'bottle', '8901000041', 'B', false, false, true, true, 37.00, 20, 'box'),
        (42, 'IVF-042', 'Mannitol 20% 100ml', 'iv-fluids', 'bottle', '8901000042', 'A', false, false, true, true, 78.00, 12, 'case'),
        (43, 'IVF-043', 'Human Albumin 20% 100ml', 'iv-fluids', 'vial', '8901000043', 'A', false, true, true, true, 2850.00, 4, 'pack'),
        (44, 'IVF-044', 'Sodium Bicarbonate 7.5% 25ml', 'iv-fluids', 'ampoule', '8901000044', 'A', false, false, true, true, 29.00, 10, 'box'),
        (45, 'IVF-045', 'Potassium Chloride 15% 10ml', 'iv-fluids', 'ampoule', '8901000045', 'A', false, false, true, true, 22.00, 10, 'box'),
        (46, 'IVF-046', 'Water for Injection 10ml', 'iv-fluids', 'ampoule', '8901000046', 'C', false, false, true, true, 6.00, 50, 'box'),
        (47, 'IVF-047', 'Hypertonic Saline 3% 100ml', 'iv-fluids', 'bottle', '8901000047', 'A', false, false, true, true, 68.00, 10, 'box'),
        (48, 'IVF-048', 'Hydroxyethyl Starch 6% 500ml', 'iv-fluids', 'bag', '8901000048', 'B', false, false, true, true, 380.00, 10, 'case'),
        (49, 'IVF-049', 'Gelatin Colloid 500ml', 'iv-fluids', 'bag', '8901000049', 'B', false, false, true, true, 340.00, 10, 'case'),
        (50, 'IVF-050', 'Paediatric Isolyte-P 500ml', 'iv-fluids', 'bottle', '8901000050', 'B', false, false, true, true, 44.00, 20, 'box'),
        (51, 'SRG-051', 'Endotracheal Tube Cuffed 7.0', 'surgical', 'piece', '8901000051', 'A', false, false, true, true, 95.00, 10, 'box'),
        (52, 'SRG-052', 'Endotracheal Tube Cuffed 7.5', 'surgical', 'piece', '8901000052', 'A', false, false, true, true, 95.00, 10, 'box'),
        (53, 'SRG-053', 'Endotracheal Tube Cuffed 8.0', 'surgical', 'piece', '8901000053', 'A', false, false, true, true, 95.00, 10, 'box'),
        (54, 'SRG-054', 'IV Cannula 16G Grey', 'surgical', 'piece', '8901000054', 'A', false, false, true, true, 28.00, 50, 'box'),
        (55, 'SRG-055', 'IV Cannula 18G Green', 'surgical', 'piece', '8901000055', 'A', false, false, true, true, 26.00, 50, 'box'),
        (56, 'SRG-056', 'IV Cannula 20G Pink', 'surgical', 'piece', '8901000056', 'B', false, false, true, true, 24.00, 50, 'box'),
        (57, 'SRG-057', 'IV Cannula 22G Blue', 'surgical', 'piece', '8901000057', 'B', false, false, true, true, 24.00, 50, 'box'),
        (58, 'SRG-058', 'Chest Drain Tube 28Fr', 'surgical', 'piece', '8901000058', 'A', false, false, true, true, 220.00, 10, 'box'),
        (59, 'SRG-059', 'Foley Catheter 16Fr', 'surgical', 'piece', '8901000059', 'B', false, false, true, true, 85.00, 10, 'box'),
        (60, 'SRG-060', 'Triple Lumen CVC Kit 7Fr', 'surgical', 'kit', '8901000060', 'A', false, false, true, true, 1450.00, 5, 'box'),
        (61, 'SRG-061', 'Arterial Line Catheter Kit', 'surgical', 'kit', '8901000061', 'A', false, false, true, true, 890.00, 5, 'box'),
        (62, 'SRG-062', 'Trauma Compression Dressing', 'surgical', 'pack', '8901000062', 'A', false, false, true, true, 140.00, 10, 'box'),
        (63, 'SRG-063', 'Elastic Crepe Bandage 15cm', 'surgical', 'roll', '8901000063', 'C', false, false, true, true, 48.00, 12, 'box'),
        (64, 'SRG-064', 'Sterile Gauze Swab 10x10cm', 'surgical', 'pack', '8901000064', 'B', false, false, true, true, 22.00, 25, 'box'),
        (65, 'SRG-065', 'Vicryl Suture 2-0', 'surgical', 'foil', '8901000065', 'B', false, false, true, true, 260.00, 12, 'box'),
        (66, 'SRG-066', 'Nylon Suture 3-0', 'surgical', 'foil', '8901000066', 'B', false, false, true, true, 180.00, 12, 'box'),
        (67, 'SRG-067', 'Skin Stapler 35W', 'surgical', 'piece', '8901000067', 'B', false, false, true, true, 410.00, 6, 'box'),
        (68, 'SRG-068', 'Burn Hydrogel Dressing 20x20', 'surgical', 'sheet', '8901000068', 'A', false, false, true, true, 390.00, 10, 'box'),
        (69, 'SRG-069', 'Disposable Syringe 5ml', 'surgical', 'piece', '8901000069', 'C', false, false, true, true, 4.50, 100, 'box'),
        (70, 'SRG-070', 'Disposable Syringe 10ml', 'surgical', 'piece', '8901000070', 'C', false, false, true, true, 6.00, 100, 'box'),
        (71, 'PPE-071', 'N95 Particulate Respirator', 'ppe', 'piece', '8901000071', 'A', false, false, true, true, 45.00, 20, 'box'),
        (72, 'PPE-072', 'Sterile Surgical Gloves 7.0', 'ppe', 'pair', '8901000072', 'B', false, false, true, true, 36.00, 50, 'box'),
        (73, 'PPE-073', 'Sterile Surgical Gloves 7.5', 'ppe', 'pair', '8901000073', 'B', false, false, true, true, 36.00, 50, 'box'),
        (74, 'PPE-074', 'Nitrile Exam Gloves Medium', 'ppe', 'piece', '8901000074', 'C', false, false, true, true, 5.00, 100, 'box'),
        (75, 'PPE-075', 'Impervious Surgical Gown', 'ppe', 'piece', '8901000075', 'B', false, false, true, true, 195.00, 10, 'pack'),
        (76, 'PPE-076', 'Full Face Shield Anti-Fog', 'ppe', 'piece', '8901000076', 'C', false, false, false, false, 65.00, 20, 'box'),
        (77, 'PPE-077', 'Biohazard Isolation Coverall', 'ppe', 'piece', '8901000077', 'A', false, false, true, true, 420.00, 10, 'pack'),
        (78, 'PPE-078', 'Alcohol Hand Rub 500ml', 'ppe', 'bottle', '8901000078', 'B', false, false, true, true, 180.00, 12, 'case'),
        (79, 'PPE-079', 'Povidone Iodine 10% 500ml', 'ppe', 'bottle', '8901000079', 'B', false, false, true, true, 150.00, 10, 'case'),
        (80, 'PPE-080', 'Chlorhexidine 2% Prep Swab', 'ppe', 'swab', '8901000080', 'B', false, false, true, true, 18.00, 50, 'box'),
        (81, 'CON-081', 'Disposable Bed Sheet', 'ppe', 'piece', '8901000081', 'C', false, false, false, false, 35.00, 20, 'pack'),
        (82, 'CON-082', 'ECG Monitoring Electrode', 'surgical', 'piece', '8901000082', 'C', false, false, false, false, 8.00, 50, 'pack'),
        (83, 'CON-083', 'Adult Oxygen Mask w/ Tubing', 'oxygen', 'piece', '8901000083', 'B', false, false, false, false, 55.00, 20, 'box'),
        (84, 'CON-084', 'Adult Nasal Cannula', 'oxygen', 'piece', '8901000084', 'C', false, false, false, false, 32.00, 25, 'box'),
        (85, 'CON-085', 'Non-Rebreather Trauma Mask', 'oxygen', 'piece', '8901000085', 'A', false, false, false, false, 95.00, 20, 'box'),
        (86, 'CON-086', 'Adult Bag Valve Mask (Ambu)', 'oxygen', 'kit', '8901000086', 'A', false, false, false, false, 680.00, 5, 'case'),
        (87, 'CON-087', 'Suction Catheter 14Fr', 'surgical', 'piece', '8901000087', 'C', false, false, false, false, 16.00, 50, 'box'),
        (88, 'CON-088', 'Blood Transfusion Set', 'blood', 'piece', '8901000088', 'A', false, false, false, false, 48.00, 25, 'box'),
        (89, 'CON-089', 'Vented IV Infusion Set', 'iv-fluids', 'piece', '8901000089', 'C', false, false, false, false, 22.00, 50, 'box'),
        (90, 'CON-090', 'Quick-Release Tourniquet', 'surgical', 'piece', '8901000090', 'C', false, false, false, false, 120.00, 10, 'pack'),
        (91, 'BLD-091', 'PRBC O-Negative 350ml', 'blood', 'unit', '8901000091', 'A', false, true, true, true, 1600.00, 1, 'unit'),
        (92, 'BLD-092', 'PRBC O-Positive 350ml', 'blood', 'unit', '8901000092', 'A', false, true, true, true, 1500.00, 1, 'unit'),
        (93, 'BLD-093', 'PRBC A-Positive 350ml', 'blood', 'unit', '8901000093', 'A', false, true, true, true, 1500.00, 1, 'unit'),
        (94, 'BLD-094', 'PRBC B-Positive 350ml', 'blood', 'unit', '8901000094', 'A', false, true, true, true, 1500.00, 1, 'unit'),
        (95, 'BLD-095', 'Fresh Frozen Plasma 200ml', 'blood', 'unit', '8901000095', 'A', false, true, true, true, 900.00, 1, 'unit'),
        (96, 'BLD-096', 'Random Donor Platelets 50ml', 'blood', 'unit', '8901000096', 'A', false, false, true, true, 850.00, 1, 'unit'),
        (97, 'OXY-097', 'Oxygen Cylinder Type B 10L', 'oxygen', 'cylinder', '8901000097', 'A', false, false, false, false, 4500.00, 1, 'cylinder'),
        (98, 'OXY-098', 'Oxygen Cylinder Type D 40L', 'oxygen', 'cylinder', '8901000098', 'A', false, false, false, false, 8500.00, 1, 'cylinder'),
        (99, 'OXY-099', 'Oxygen Cylinder Jumbo 47L', 'oxygen', 'cylinder', '8901000099', 'A', false, false, false, false, 9800.00, 1, 'cylinder'),
        (100, 'OXY-100', 'Portable Aluminium O2 2L', 'oxygen', 'cylinder', '8901000100', 'A', false, false, false, false, 6200.00, 1, 'cylinder')
    ) as t(idx, sku, name, cat_slug, base_unit, barcode, crit, is_ctrl, is_cold, trk_batch, trk_exp, cost, pack_factor, pack_name)
  loop
    v_item_id := md5('medpulse-item-' || r.sku)::uuid;
    select id into v_cat_id from public.categories where hospital_id = v_hosp and slug = r.cat_slug;

    v_sup_id := case r.cat_slug
      when 'blood' then '51111111-1111-1111-1111-111111111105'::uuid
      when 'oxygen' then '51111111-1111-1111-1111-111111111104'::uuid
      when 'surgical' then '51111111-1111-1111-1111-111111111102'::uuid
      when 'ppe' then '51111111-1111-1111-1111-111111111106'::uuid
      else case when r.is_cold then '51111111-1111-1111-1111-111111111103'::uuid else '51111111-1111-1111-1111-111111111101'::uuid end
    end;

    insert into public.items (
      id, hospital_id, sku, name, category_id, base_unit, barcode, criticality,
      is_controlled, is_cold_chain, tracks_batch, tracks_expiry, unit_cost, supplier_id
    ) values (
      v_item_id, v_hosp, r.sku, r.name, v_cat_id, r.base_unit, r.barcode, r.crit,
      r.is_ctrl, r.is_cold, r.trk_batch, r.trk_exp, r.cost, v_sup_id
    )
    on conflict (id) do nothing;

    -- Base unit + pack unit
    insert into public.item_units (item_id, hospital_id, unit, factor_to_base, is_order_pack)
    values (v_item_id, v_hosp, r.base_unit, 1, r.pack_factor = 1)
    on conflict (item_id, unit) do nothing;

    if r.pack_factor > 1 then
      insert into public.item_units (item_id, hospital_id, unit, factor_to_base, is_order_pack)
      values (v_item_id, v_hosp, r.pack_name, r.pack_factor, true)
      on conflict (item_id, unit) do nothing;
    end if;

    -- PAR levels for Central Store + clinical location
    v_loc := case
      when r.cat_slug = 'blood' then v_blood
      when r.cat_slug in ('controlled', 'emergency-drugs') then v_er
      when r.cat_slug = 'iv-fluids' then v_ward
      when r.cat_slug = 'surgical' then v_ot
      when r.cat_slug = 'oxygen' then v_icu
      else v_pharm
    end;

    insert into public.par_levels (item_id, location_id, hospital_id, min_qty, par_qty, max_qty)
    values
      (v_item_id, v_central, v_hosp, 20, 60, 150),
      (v_item_id, v_loc, v_hosp, 10, 30, 80)
    on conflict (item_id, location_id) do nothing;

    if r.sku = 'CON-081' then
      insert into public.par_levels (item_id, location_id, hospital_id, min_qty, par_qty, max_qty)
      values
        (v_item_id, v_er, v_hosp, 10, 25, 60),
        (v_item_id, v_ward, v_hosp, 10, 25, 60)
      on conflict (item_id, location_id) do nothing;
    end if;

    -- Create batches (early + late expiry for FEFO) when batch-tracked
    v_batch_early := null;
    v_batch_late := null;

    if r.trk_batch then
      v_batch_early := md5('medpulse-batch-early-' || r.sku)::uuid;
      v_batch_late := md5('medpulse-batch-late-' || r.sku)::uuid;

      insert into public.batches (id, hospital_id, item_id, batch_no, expiry_date)
      values
        (
          v_batch_early,
          v_hosp,
          v_item_id,
          r.sku || '-B1',
          case when r.trk_exp then (current_date + ((r.idx % 4) * 20 + 25)) else null end
        ),
        (
          v_batch_late,
          v_hosp,
          v_item_id,
          r.sku || '-B2',
          case when r.trk_exp then (current_date + 240) else null end
        )
      on conflict (id) do nothing;
    end if;

    -- Initial receive movements via append-only ledger (Principle P1)
    v_qty := case
      when r.sku = 'CON-081' then 50
      when r.idx % 10 = 0 then 8   -- intentionally below MIN for alert/filter realism
      when r.idx % 7 = 0 then 18   -- intentionally below PAR
      else 45
    end;

    v_mov_id := md5('medpulse-seed-rcv-central-' || r.sku)::uuid;
    insert into public.stock_movements (
      id, hospital_id, item_id, batch_id, from_location_id, to_location_id,
      condition, qty, type, note, created_by
    ) values (
      v_mov_id, v_hosp, v_item_id, v_batch_early, null, v_central,
      'usable', v_qty, 'receive', 'Initial Central Store seed stock', v_actor
    )
    on conflict (id) do nothing;

    if v_batch_late is not null then
      v_mov_id := md5('medpulse-seed-rcv-central-late-' || r.sku)::uuid;
      insert into public.stock_movements (
        id, hospital_id, item_id, batch_id, from_location_id, to_location_id,
        condition, qty, type, note, created_by
      ) values (
        v_mov_id, v_hosp, v_item_id, v_batch_late, null, v_central,
        'usable', 25, 'receive', 'Secondary FEFO batch seed stock', v_actor
      )
      on conflict (id) do nothing;
    end if;

    -- Secondary clinical location stock (including Ward A so nurse RLS tests see stock)
    v_mov_id := md5('medpulse-seed-rcv-loc-' || r.sku)::uuid;
    insert into public.stock_movements (
      id, hospital_id, item_id, batch_id, from_location_id, to_location_id,
      condition, qty, type, note, created_by
    ) values (
      v_mov_id, v_hosp, v_item_id, v_batch_early, null, v_loc,
      'usable', case when r.sku = 'CON-081' then 15 else 20 end, 'receive', 'Initial unit stock', v_actor
    )
    on conflict (id) do nothing;

    if r.sku = 'CON-081' then
      insert into public.stock_movements (
        id, hospital_id, item_id, batch_id, from_location_id, to_location_id,
        condition, qty, type, note, created_by
      ) values (
        md5('medpulse-seed-rcv-con081-er')::uuid, v_hosp, v_item_id, null, null, v_er,
        'usable', 10, 'receive', 'ER baseline', v_actor
      )
      on conflict (id) do nothing;

      insert into public.stock_movements (
        id, hospital_id, item_id, batch_id, from_location_id, to_location_id,
        condition, qty, type, note, created_by
      ) values (
        md5('medpulse-seed-rcv-con081-ward')::uuid, v_hosp, v_item_id, null, null, v_ward,
        'usable', 18, 'receive', 'Ward A baseline', v_actor
      )
      on conflict (id) do nothing;
    end if;
  end loop;
end $$;
