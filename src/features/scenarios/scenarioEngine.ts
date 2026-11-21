import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReadinessBand, ReadinessConfidence } from '@/components/ReadinessGauge';
import type { InventorySnapshot } from '@/features/inventory/types';

export type ScenarioTemplateId =
  | 'road_accident'
  | 'fire'
  | 'building_collapse'
  | 'disease_outbreak'
  | 'chemical_exposure'
  | 'cardiac_surge'
  | 'natural_disaster'
  | 'food_poisoning'
  | 'maternity_surge';

export type ResourceCriticality = 'critical' | 'high' | 'normal';
export type ShortfallSeverity = 'critical' | 'high' | 'moderate';

export interface ScenarioParameters {
  casualties: number;
  arrivalWindowMin: number;
}

export interface ScenarioResourceFormula {
  sku: string;
  fallbackName: string;
  unit: string;
  baseQty: number;
  perCasualty: number;
  criticality: ResourceCriticality;
  basis: string;
}

export interface ScenarioStaffNeed {
  role: string;
  baseCount: number;
  perTenCasualties: number;
}

export interface ScenarioTimelineStep {
  id: string;
  tOffsetMin: number;
  action: string;
  ownerRole: string;
}

export interface ScenarioTemplateDefinition {
  id: ScenarioTemplateId;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  defaultParams: ScenarioParameters;
  assumptions: string[];
  resources: ScenarioResourceFormula[];
  staff: ScenarioStaffNeed[];
  timeline: ScenarioTimelineStep[];
  externalSupport: string[];
}

export interface EvaluatedResource {
  sku: string;
  itemId: string | null;
  name: string;
  unit: string;
  requiredQty: number;
  availableQty: number;
  shortfallQty: number;
  coverage: number;
  criticality: ResourceCriticality;
  shortfallSeverity: ShortfallSeverity | null;
  pickRouteLocationId: string | null;
  pickRouteLocationName: string;
  basis: string;
  unmapped: boolean;
}

export interface EvaluatedScenarioPlan {
  templateId: ScenarioTemplateId;
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  params: ScenarioParameters;
  score: number;
  band: ReadinessBand;
  confidence: ReadinessConfidence;
  summary: string;
  assumptions: string[];
  resources: EvaluatedResource[];
  shortfalls: EvaluatedResource[];
  staff: { role: string; count: number }[];
  timeline: ScenarioTimelineStep[];
  externalSupport: string[];
  computedAt: string;
}

export const SCENARIO_TEMPLATES: ScenarioTemplateDefinition[] = [
  {
    id: 'road_accident',
    icon: 'ambulance',
    defaultParams: { casualties: 25, arrivalWindowMin: 20 },
    assumptions: [
      'Assume 30% red-triage haemorrhage/airway trauma, 45% yellow fractures, 25% green.',
      'Quantities cover first 4 hours of resuscitation and initial surgical stabilisation.',
    ],
    resources: [
      { sku: 'IVF-038', fallbackName: 'Ringer Lactate 500ml', unit: 'bottle', baseQty: 15, perCasualty: 2.2, criticality: 'critical', basis: '2L crystalloid resuscitation per trauma case' },
      { sku: 'IVF-036', fallbackName: 'Normal Saline 0.9% 500ml', unit: 'bottle', baseQty: 10, perCasualty: 1.5, criticality: 'high', basis: 'Wound irrigation and IV maintenance' },
      { sku: 'MED-008', fallbackName: 'Tranexamic Acid 500mg/5ml', unit: 'ampoule', baseQty: 5, perCasualty: 1.2, criticality: 'critical', basis: 'Early antifibrinolytic haemorrhage control' },
      { sku: 'BLD-091', fallbackName: 'PRBC O-Negative 350ml', unit: 'unit', baseQty: 4, perCasualty: 0.4, criticality: 'critical', basis: 'Uncrossmatched emergency O-Neg transfusion' },
      { sku: 'SRG-054', fallbackName: 'IV Cannula 16G Grey', unit: 'piece', baseQty: 10, perCasualty: 1.5, criticality: 'high', basis: 'Dual large-bore trauma IV access' },
      { sku: 'SRG-062', fallbackName: 'Trauma Compression Dressing', unit: 'pack', baseQty: 10, perCasualty: 1.4, criticality: 'high', basis: 'External haemorrhage tourniquet & packing' },
      { sku: 'CTL-026', fallbackName: 'Morphine Sulphate 10mg/ml', unit: 'ampoule', baseQty: 5, perCasualty: 0.8, criticality: 'high', basis: 'Acute fracture & polytrauma analgesia' },
      { sku: 'OXY-098', fallbackName: 'Oxygen Cylinder Type D 40L', unit: 'cylinder', baseQty: 2, perCasualty: 0.2, criticality: 'critical', basis: 'High-flow trauma bay oxygen manifold' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 0 },
      { role: 'nurse', baseCount: 4, perTenCasualties: 3 },
      { role: 'pharmacist', baseCount: 1, perTenCasualties: 1 },
      { role: 'store_manager', baseCount: 1, perTenCasualties: 1 },
    ],
    timeline: [
      { id: 'ra-1', tOffsetMin: 0, action: 'Clear ER bays and stage O-Neg blood cooler & crash carts', ownerRole: 'coordinator' },
      { id: 'ra-2', tOffsetMin: 5, action: 'Dispatch Central Store emergency trauma fluid & cannula run', ownerRole: 'store_manager' },
      { id: 'ra-3', tOffsetMin: 10, action: 'Issue witnessed Morphine & Tranexamic Acid kits to ER', ownerRole: 'pharmacist' },
      { id: 'ra-4', tOffsetMin: 20, action: 'Open secondary triage overflow and log consumption transfers', ownerRole: 'nurse' },
    ],
    externalSupport: ['Regional Blood Centre: pre-alert 10 O-Neg + 15 O-Pos PRBC units', 'District Trauma Network standby'],
  },
  {
    id: 'fire',
    icon: 'fire-alert',
    defaultParams: { casualties: 20, arrivalWindowMin: 25 },
    assumptions: [
      'Assume 40% inhalation/major thermal burns requiring aggressive Parkland fluid resuscitation.',
      'Includes smoke-inhalation bronchodilation and early airway intubation readiness.',
    ],
    resources: [
      { sku: 'IVF-038', fallbackName: 'Ringer Lactate 500ml', unit: 'bottle', baseQty: 20, perCasualty: 3.0, criticality: 'critical', basis: 'Parkland burn fluid resuscitation formula' },
      { sku: 'SRG-068', fallbackName: 'Burn Hydrogel Dressing 20x20', unit: 'sheet', baseQty: 10, perCasualty: 2.0, criticality: 'critical', basis: 'Sterile cooling & partial-thickness burn cover' },
      { sku: 'SRG-051', fallbackName: 'Endotracheal Tube Cuffed 7.0', unit: 'piece', baseQty: 4, perCasualty: 0.5, criticality: 'critical', basis: 'Prophylactic airway protection in inhalational burn' },
      { sku: 'CTL-027', fallbackName: 'Fentanyl Citrate 100mcg/2ml', unit: 'ampoule', baseQty: 6, perCasualty: 1.0, criticality: 'high', basis: 'Potent short-acting burn debridement analgesia' },
      { sku: 'OXY-098', fallbackName: 'Oxygen Cylinder Type D 40L', unit: 'cylinder', baseQty: 2, perCasualty: 0.25, criticality: 'critical', basis: '100% FiO2 for carbon monoxide washout' },
      { sku: 'PPE-072', fallbackName: 'Sterile Surgical Gloves 7.0', unit: 'pair', baseQty: 20, perCasualty: 2.0, criticality: 'normal', basis: 'Aseptic burn wound handling' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 0 },
      { role: 'nurse', baseCount: 4, perTenCasualties: 3 },
      { role: 'pharmacist', baseCount: 1, perTenCasualties: 1 },
    ],
    timeline: [
      { id: 'fr-1', tOffsetMin: 0, action: 'Stage airway intubation trays & high-flow O2 in Resus', ownerRole: 'coordinator' },
      { id: 'fr-2', tOffsetMin: 5, action: 'Deliver burn hydrogel sheets & warmed Ringer Lactate cases', ownerRole: 'store_manager' },
      { id: 'fr-3', tOffsetMin: 15, action: 'Verify cold-chain & narcotic opioid witness sign-offs', ownerRole: 'pharmacist' },
      { id: 'fr-4', tOffsetMin: 30, action: 'Establish sterile burn dressing stations in OT/Ward A', ownerRole: 'nurse' },
    ],
    externalSupport: ['State Burns Centre referral tele-bridge', 'CryoCare skin-graft courier standby'],
  },
  {
    id: 'building_collapse',
    icon: 'office-building-cog-outline',
    defaultParams: { casualties: 30, arrivalWindowMin: 45 },
    assumptions: [
      'High proportion of crush syndrome, compartment injury, and delayed extrication hypothermia.',
      'Requires hyperkalemia stabilization and prophylactic bicarbonate/saline diuresis.',
    ],
    resources: [
      { sku: 'IVF-036', fallbackName: 'Normal Saline 0.9% 500ml', unit: 'bottle', baseQty: 20, perCasualty: 2.0, criticality: 'critical', basis: 'Immediate crush syndrome saline diuresis' },
      { sku: 'IVF-044', fallbackName: 'Sodium Bicarbonate 7.5% 25ml', unit: 'ampoule', baseQty: 10, perCasualty: 1.0, criticality: 'critical', basis: 'Urine alkalinization against rhabdomyolysis' },
      { sku: 'MED-023', fallbackName: 'Tetanus Toxoid 0.5ml Vial', unit: 'vial', baseQty: 10, perCasualty: 1.0, criticality: 'high', basis: 'Open crush/rubble wound tetanus prophylaxis' },
      { sku: 'SRG-058', fallbackName: 'Chest Drain Tube 28Fr', unit: 'piece', baseQty: 4, perCasualty: 0.3, criticality: 'high', basis: 'Pneumothorax / hemothorax decompression' },
      { sku: 'SRG-060', fallbackName: 'Triple Lumen CVC Kit 7Fr', unit: 'kit', baseQty: 2, perCasualty: 0.2, criticality: 'high', basis: 'Central venous access in shock' },
      { sku: 'BLD-092', fallbackName: 'PRBC O-Positive 350ml', unit: 'unit', baseQty: 4, perCasualty: 0.3, criticality: 'critical', basis: 'Traumatic blood loss support' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 1 },
      { role: 'nurse', baseCount: 5, perTenCasualties: 3 },
      { role: 'store_manager', baseCount: 2, perTenCasualties: 1 },
    ],
    timeline: [
      { id: 'bc-1', tOffsetMin: 0, action: 'Reserve 2 OT slots and prepare crush-syndrome drug bundle', ownerRole: 'coordinator' },
      { id: 'bc-2', tOffsetMin: 10, action: 'Transfer Sodium Bicarbonate & Normal Saline to ER trauma bays', ownerRole: 'store_manager' },
      { id: 'bc-3', tOffsetMin: 20, action: 'Prepare chest drain & CVC surgical kits at OT staging', ownerRole: 'nurse' },
    ],
    externalSupport: ['Regional dialysis unit alert for crush acute kidney injury'],
  },
  {
    id: 'disease_outbreak',
    icon: 'virus-outline',
    defaultParams: { casualties: 40, arrivalWindowMin: 60 },
    assumptions: [
      'Acute febrile respiratory/infectious surge needing isolation PPE and broad-spectrum sepsis cover.',
    ],
    resources: [
      { sku: 'PPE-071', fallbackName: 'N95 Particulate Respirator', unit: 'piece', baseQty: 30, perCasualty: 2.0, criticality: 'critical', basis: 'Airborne isolation protection for care staff' },
      { sku: 'PPE-077', fallbackName: 'Biohazard Isolation Coverall', unit: 'piece', baseQty: 15, perCasualty: 0.8, criticality: 'critical', basis: 'Full barrier isolation ward shifts' },
      { sku: 'MED-011', fallbackName: 'Ceftriaxone 1g IV Vial', unit: 'vial', baseQty: 20, perCasualty: 1.5, criticality: 'high', basis: 'Empiric sepsis antimicrobial cover' },
      { sku: 'MED-014', fallbackName: 'Paracetamol 1g/100ml IV', unit: 'bottle', baseQty: 15, perCasualty: 1.0, criticality: 'normal', basis: 'High fever stabilization' },
      { sku: 'PPE-078', fallbackName: 'Alcohol Hand Rub 500ml', unit: 'bottle', baseQty: 10, perCasualty: 0.3, criticality: 'high', basis: 'Bedside infection control stations' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 0 },
      { role: 'nurse', baseCount: 4, perTenCasualties: 2 },
      { role: 'pharmacist', baseCount: 1, perTenCasualties: 1 },
    ],
    timeline: [
      { id: 'do-1', tOffsetMin: 0, action: 'Convert General Ward A zone to negative/barrier isolation', ownerRole: 'coordinator' },
      { id: 'do-2', tOffsetMin: 10, action: 'Distribute N95 & biohazard coveralls to ER triage & Ward A', ownerRole: 'store_manager' },
      { id: 'do-3', tOffsetMin: 25, action: 'Pre-stage IV antibiotics & antipyretics in Main Pharmacy', ownerRole: 'pharmacist' },
    ],
    externalSupport: ['Public health lab specimen transport activation'],
  },
  {
    id: 'chemical_exposure',
    icon: 'biohazard',
    defaultParams: { casualties: 15, arrivalWindowMin: 20 },
    assumptions: [
      'Assumes organophosphate/toxicant aerosol exposure needing immediate atropinization & decon.',
    ],
    resources: [
      { sku: 'MED-002', fallbackName: 'Atropine Sulphate 0.6mg/ml', unit: 'ampoule', baseQty: 20, perCasualty: 4.0, criticality: 'critical', basis: 'Repeated cholinergic crisis reversal' },
      { sku: 'PPE-077', fallbackName: 'Biohazard Isolation Coverall', unit: 'piece', baseQty: 12, perCasualty: 1.0, criticality: 'critical', basis: 'Decon team chemical splash protection' },
      { sku: 'PPE-076', fallbackName: 'Full Face Shield Anti-Fog', unit: 'piece', baseQty: 15, perCasualty: 1.0, criticality: 'high', basis: 'Eye/mucous membrane splash shield' },
      { sku: 'CTL-032', fallbackName: 'Diazepam 10mg/2ml Ampoule', unit: 'ampoule', baseQty: 10, perCasualty: 1.2, criticality: 'critical', basis: 'Neurotoxic seizure termination' },
      { sku: 'CON-085', fallbackName: 'Non-Rebreather Trauma Mask', unit: 'piece', baseQty: 10, perCasualty: 1.0, criticality: 'high', basis: 'High-concentration O2 post-decon' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 0 },
      { role: 'nurse', baseCount: 4, perTenCasualties: 3 },
      { role: 'pharmacist', baseCount: 1, perTenCasualties: 1 },
    ],
    timeline: [
      { id: 'ce-1', tOffsetMin: 0, action: 'Activate outdoor decontamination shower & suit up decon team', ownerRole: 'coordinator' },
      { id: 'ce-2', tOffsetMin: 5, action: 'Pull all Atropine & Diazepam buffer boxes to ER Hot Zone gate', ownerRole: 'pharmacist' },
      { id: 'ce-3', tOffsetMin: 15, action: 'Ensure oxygen masks staged post-decontamination', ownerRole: 'nurse' },
    ],
    externalSupport: ['Poison Control Antidote Depot emergency courier request'],
  },
  {
    id: 'cardiac_surge',
    icon: 'heart-pulse',
    defaultParams: { casualties: 12, arrivalWindowMin: 30 },
    assumptions: [
      'Heatwave / mass event cardiac arrest and acute coronary syndrome cluster.',
    ],
    resources: [
      { sku: 'MED-001', fallbackName: 'Epinephrine 1mg/ml Ampoule', unit: 'ampoule', baseQty: 10, perCasualty: 3.0, criticality: 'critical', basis: 'ACLS arrest resuscitation cycles' },
      { sku: 'MED-003', fallbackName: 'Amiodarone 150mg/3ml Ampoule', unit: 'ampoule', baseQty: 6, perCasualty: 2.0, criticality: 'critical', basis: 'Shock-refractory VT/VF rhythm control' },
      { sku: 'MED-006', fallbackName: 'Adenosine 6mg/2ml Vial', unit: 'vial', baseQty: 4, perCasualty: 1.0, criticality: 'high', basis: 'SVT acute termination' },
      { sku: 'MED-019', fallbackName: 'Heparin 5000IU/5ml Vial', unit: 'vial', baseQty: 10, perCasualty: 1.5, criticality: 'critical', basis: 'ACS systemic anticoagulation' },
      { sku: 'MED-004', fallbackName: 'Norepinephrine 4mg/4ml Vial', unit: 'vial', baseQty: 6, perCasualty: 1.5, criticality: 'critical', basis: 'Cardiogenic shock vasopressor infusion' },
      { sku: 'CON-086', fallbackName: 'Adult Bag Valve Mask (Ambu)', unit: 'kit', baseQty: 6, perCasualty: 0.5, criticality: 'high', basis: 'Manual ventilation backup' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 0 },
      { role: 'nurse', baseCount: 4, perTenCasualties: 3 },
      { role: 'pharmacist', baseCount: 1, perTenCasualties: 1 },
    ],
    timeline: [
      { id: 'cs-1', tOffsetMin: 0, action: 'Clear ICU step-down beds & verify crash cart Epinephrine/Amiodarone', ownerRole: 'nurse' },
      { id: 'cs-2', tOffsetMin: 10, action: 'Replenish vasopressors & Heparin from Main Pharmacy', ownerRole: 'pharmacist' },
      { id: 'cs-3', tOffsetMin: 20, action: 'Place backup O2 cylinders at ER/ICU transfer corridor', ownerRole: 'store_manager' },
    ],
    externalSupport: ['Inter-hospital cath lab diversion coordination'],
  },
  {
    id: 'natural_disaster',
    icon: 'weather-lightning-rainy',
    defaultParams: { casualties: 35, arrivalWindowMin: 60 },
    assumptions: [
      'Flood/storm displacement with mixed trauma, hypothermia, waterborne sepsis, and utility backup.',
    ],
    resources: [
      { sku: 'IVF-038', fallbackName: 'Ringer Lactate 500ml', unit: 'bottle', baseQty: 20, perCasualty: 1.5, criticality: 'critical', basis: 'Dehydration & trauma volume support' },
      { sku: 'MED-011', fallbackName: 'Ceftriaxone 1g IV Vial', unit: 'vial', baseQty: 15, perCasualty: 1.0, criticality: 'high', basis: 'Contaminated wound sepsis prophylaxis' },
      { sku: 'MED-023', fallbackName: 'Tetanus Toxoid 0.5ml Vial', unit: 'vial', baseQty: 15, perCasualty: 1.0, criticality: 'high', basis: 'Flood debris trauma immunization' },
      { sku: 'OXY-099', fallbackName: 'Oxygen Cylinder Jumbo 47L', unit: 'cylinder', baseQty: 4, perCasualty: 0.15, criticality: 'critical', basis: 'Off-grid cylinder backup during power fluctuation' },
      { sku: 'SRG-064', fallbackName: 'Sterile Gauze Swab 10x10cm', unit: 'pack', baseQty: 20, perCasualty: 2.0, criticality: 'normal', basis: 'Debridement & wound care packs' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 1 },
      { role: 'store_manager', baseCount: 2, perTenCasualties: 1 },
      { role: 'nurse', baseCount: 5, perTenCasualties: 2 },
    ],
    timeline: [
      { id: 'nd-1', tOffsetMin: 0, action: 'Verify generator & jumbo O2 cylinder manifolds in ICU/OT', ownerRole: 'store_manager' },
      { id: 'nd-2', tOffsetMin: 15, action: 'Confirm cold-chain vaccine/insulin fridge battery backup', ownerRole: 'pharmacist' },
      { id: 'nd-3', tOffsetMin: 30, action: 'Pre-position wound & fluid trolleys across ER & Ward A', ownerRole: 'nurse' },
    ],
    externalSupport: ['Bharat Medical Gases 4-hour emergency cylinder refill contract'],
  },
  {
    id: 'food_poisoning',
    icon: 'food-apple-outline',
    defaultParams: { casualties: 45, arrivalWindowMin: 35 },
    assumptions: [
      'Large-scale gastroenteritis outbreak with severe volume depletion and emesis.',
    ],
    resources: [
      { sku: 'IVF-038', fallbackName: 'Ringer Lactate 500ml', unit: 'bottle', baseQty: 20, perCasualty: 2.0, criticality: 'critical', basis: 'Rapid isotonic GI fluid replacement' },
      { sku: 'IVF-036', fallbackName: 'Normal Saline 0.9% 500ml', unit: 'bottle', baseQty: 15, perCasualty: 1.2, criticality: 'high', basis: 'Maintenance electrolyte rehydration' },
      { sku: 'MED-015', fallbackName: 'Ondansetron 4mg/2ml Ampoule', unit: 'ampoule', baseQty: 20, perCasualty: 1.5, criticality: 'high', basis: 'Intractable vomiting control' },
      { sku: 'MED-016', fallbackName: 'Pantoprazole 40mg IV Vial', unit: 'vial', baseQty: 10, perCasualty: 1.0, criticality: 'normal', basis: 'Gastric mucosal protection' },
      { sku: 'SRG-056', fallbackName: 'IV Cannula 20G Pink', unit: 'piece', baseQty: 20, perCasualty: 1.2, criticality: 'high', basis: 'Rapid peripheral hydration access' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 0 },
      { role: 'nurse', baseCount: 4, perTenCasualties: 2 },
      { role: 'pharmacist', baseCount: 1, perTenCasualties: 1 },
    ],
    timeline: [
      { id: 'fp-1', tOffsetMin: 0, action: 'Set up rapid IV hydration chairs in Ward A corridor', ownerRole: 'nurse' },
      { id: 'fp-2', tOffsetMin: 10, action: 'Pull RL, NS, Ondansetron & 20G cannulas from Central Store', ownerRole: 'store_manager' },
      { id: 'fp-3', tOffsetMin: 20, action: 'Track oral/IV intake batch usage for outbreak reporting', ownerRole: 'pharmacist' },
    ],
    externalSupport: ['Apollo Pharma same-day crystalloid restock dispatch'],
  },
  {
    id: 'maternity_surge',
    icon: 'baby-carriage',
    defaultParams: { casualties: 15, arrivalWindowMin: 40 },
    assumptions: [
      'Simultaneous emergency obstetric deliveries with postpartum haemorrhage prophylaxis.',
    ],
    resources: [
      { sku: 'MED-008', fallbackName: 'Tranexamic Acid 500mg/5ml', unit: 'ampoule', baseQty: 6, perCasualty: 1.5, criticality: 'critical', basis: 'WOMAN-trial PPH haemorrhage control' },
      { sku: 'IVF-038', fallbackName: 'Ringer Lactate 500ml', unit: 'bottle', baseQty: 15, perCasualty: 2.0, criticality: 'critical', basis: 'Intrapartum & PPH volume replacement' },
      { sku: 'BLD-091', fallbackName: 'PRBC O-Negative 350ml', unit: 'unit', baseQty: 4, perCasualty: 0.4, criticality: 'critical', basis: 'Massive obstetric haemorrhage reserve' },
      { sku: 'CTL-030', fallbackName: 'Propofol 1% 20ml Vial', unit: 'vial', baseQty: 4, perCasualty: 0.8, criticality: 'high', basis: 'Emergency C-section induction support' },
      { sku: 'SRG-065', fallbackName: 'Vicryl Suture 2-0', unit: 'foil', baseQty: 10, perCasualty: 2.0, criticality: 'high', basis: 'C-section & tear repair sutures' },
    ],
    staff: [
      { role: 'coordinator', baseCount: 1, perTenCasualties: 0 },
      { role: 'nurse', baseCount: 4, perTenCasualties: 3 },
      { role: 'pharmacist', baseCount: 1, perTenCasualties: 0 },
    ],
    timeline: [
      { id: 'ms-1', tOffsetMin: 0, action: 'Verify OT obstetric suite & Blood Bank crossmatch readiness', ownerRole: 'coordinator' },
      { id: 'ms-2', tOffsetMin: 10, action: 'Stage Tranexamic Acid, RL & Vicryl sutures in OT', ownerRole: 'nurse' },
      { id: 'ms-3', tOffsetMin: 20, action: 'Confirm witness lock for controlled anaesthetic issue', ownerRole: 'pharmacist' },
    ],
    externalSupport: ['Regional Blood Centre crossmatched FFP & platelet standby'],
  },
];

const CRITICALITY_WEIGHT: Record<ResourceCriticality, number> = {
  critical: 3,
  high: 2,
  normal: 1,
};

export function getScenarioTemplate(id: string): ScenarioTemplateDefinition {
  return SCENARIO_TEMPLATES.find((t) => t.id === id) ?? SCENARIO_TEMPLATES[0];
}

/**
 * Computes scenario readiness deterministically from live hospital stock (Section 10.3, MP-SEN-003).
 */
export function evaluateScenarioPlan(
  templateId: ScenarioTemplateId,
  params: ScenarioParameters,
  snapshot: InventorySnapshot | null,
  customSummary?: string,
): EvaluatedScenarioPlan {
  const template = getScenarioTemplate(templateId);
  const clampedCasualties = Math.max(1, Math.min(500, Math.round(params.casualties)));
  const clampedWindow = Math.max(5, Math.min(240, Math.round(params.arrivalWindowMin)));

  const itemsBySku = new Map<string, InventorySnapshot['items'][number]>();
  const locationNamesById = new Map<string, string>();
  if (snapshot) {
    for (const item of snapshot.items) {
      itemsBySku.set(item.sku.toUpperCase(), item);
    }
    for (const loc of snapshot.locations) {
      locationNamesById.set(loc.id, loc.name);
    }
  }

  let weightedSum = 0;
  let totalWeight = 0;
  let criticalShortfallUnderHalf = false;
  let unmappedCount = 0;
  let countedRecentlyCount = 0;

  const resources: EvaluatedResource[] = template.resources.map((formula) => {
    const requiredQty = Math.ceil(formula.baseQty + formula.perCasualty * clampedCasualties);
    const catalogItem = itemsBySku.get(formula.sku.toUpperCase()) ?? null;
    const unmapped = catalogItem === null;
    if (unmapped) {
      unmappedCount += 1;
    }

    const availableQty = catalogItem?.totalAvailable ?? 0;
    const coverage = requiredQty === 0 ? 1 : Math.min(availableQty / requiredQty, 1);
    const shortfallQty = Math.max(requiredQty - availableQty, 0);

    const w = CRITICALITY_WEIGHT[formula.criticality];
    weightedSum += w * coverage;
    totalWeight += w;

    if (formula.criticality === 'critical' && coverage < 0.5) {
      criticalShortfallUnderHalf = true;
    }

    // Pick location holding the highest available usable stock for fastest picking route
    let pickRouteLocationId: string | null = null;
    let pickRouteLocationName = 'Central Store';
    if (catalogItem) {
      let bestAvail = -1;
      for (const [locId, stats] of Object.entries(catalogItem.byLocation)) {
        if (stats.available > bestAvail) {
          bestAvail = stats.available;
          pickRouteLocationId = locId;
          pickRouteLocationName = locationNamesById.get(locId) ?? 'Location';
        }
      }
      if (catalogItem.totalUsable > 0) {
        countedRecentlyCount += 1;
      }
    }

    let shortfallSeverity: ShortfallSeverity | null = null;
    if (shortfallQty > 0) {
      if (formula.criticality === 'critical' && coverage < 0.5) {
        shortfallSeverity = 'critical';
      } else if (coverage < 0.8 || (formula.criticality === 'high' && coverage < 0.5)) {
        shortfallSeverity = 'high';
      } else {
        shortfallSeverity = 'moderate';
      }
    }

    return {
      sku: formula.sku,
      itemId: catalogItem?.id ?? null,
      name: catalogItem?.name ?? formula.fallbackName,
      unit: catalogItem?.baseUnit ?? formula.unit,
      requiredQty,
      availableQty,
      shortfallQty,
      coverage,
      criticality: formula.criticality,
      shortfallSeverity,
      pickRouteLocationId,
      pickRouteLocationName,
      basis: formula.basis,
      unmapped,
    };
  });

  const rawScore = totalWeight > 0 ? (100 * weightedSum) / totalWeight : 0;
  const score = Math.round(criticalShortfallUnderHalf ? Math.min(rawScore, 59) : rawScore);
  const band: ReadinessBand = score >= 85 ? 'ready' : score >= 60 ? 'partially_ready' : 'not_ready';

  const mappedRatio =
    template.resources.length > 0 ? countedRecentlyCount / template.resources.length : 0;
  const confidence: ReadinessConfidence =
    unmappedCount === 0 && mappedRatio >= 0.9
      ? 'high'
      : mappedRatio >= 0.6
        ? 'medium'
        : 'low';

  const staff = template.staff.map((s) => ({
    role: s.role,
    count: s.baseCount + Math.floor(clampedCasualties / 10) * s.perTenCasualties,
  }));

  const shortfalls = resources.filter((r) => r.shortfallQty > 0);
  const defaultSummary =
    customSummary ??
    `${clampedCasualties} casualties · ${clampedWindow}m arrival window · ${shortfalls.length} item shortfalls`;

  return {
    templateId: template.id,
    icon: template.icon,
    params: { casualties: clampedCasualties, arrivalWindowMin: clampedWindow },
    score,
    band,
    confidence,
    summary: defaultSummary,
    assumptions: template.assumptions,
    resources,
    shortfalls,
    staff,
    timeline: template.timeline,
    externalSupport: template.externalSupport,
    computedAt: snapshot?.lastSyncedAt || new Date().toISOString(),
  };
}

export function evaluateAllScenarios(
  snapshot: InventorySnapshot | null,
  customParamsById: Partial<Record<ScenarioTemplateId, ScenarioParameters>> = {},
): EvaluatedScenarioPlan[] {
  return SCENARIO_TEMPLATES.map((tpl) =>
    evaluateScenarioPlan(tpl.id, customParamsById[tpl.id] ?? tpl.defaultParams, snapshot),
  );
}

/**
 * Computes hospital-wide readiness summary across top emergency scenarios for the Home dashboard.
 */
export function computeAggregateHospitalReadiness(plans: readonly EvaluatedScenarioPlan[]): {
  score: number;
  band: ReadinessBand;
  readyCount: number;
  totalCount: number;
} {
  if (plans.length === 0) {
    return { score: 0, band: 'not_ready', readyCount: 0, totalCount: 0 };
  }
  const avg = Math.round(plans.reduce((acc, p) => acc + p.score, 0) / plans.length);
  const band: ReadinessBand = avg >= 85 ? 'ready' : avg >= 60 ? 'partially_ready' : 'not_ready';
  const readyCount = plans.filter((p) => p.band === 'ready').length;
  return { score: avg, band, readyCount, totalCount: plans.length };
}
