import {
  ALLOWED_ASSISTANT_TOOLS,
  answerAssistantQuery,
  executeWhitelistedTool,
} from '@/features/assistant/assistantEngine';
import {
  canApproveCountSession,
  canSubmitCountLine,
  computeLineVariance,
  computeWhatsNeeded,
  defaultToleranceForItem,
} from '@/features/counting/countingLogic';
import { buildInventorySnapshot } from '@/features/inventory/inventoryService';
import {
  SCENARIO_TEMPLATES,
  evaluateAllScenarios,
  evaluateScenarioPlan,
} from '@/features/scenarios/scenarioEngine';
import { generateOperationalTasks } from '@/features/tasks/taskRules';

function makeShowcaseSnapshot(epinephrineQty = 100) {
  return buildInventorySnapshot({
    hospitalId: 'h1',
    locations: [
      { id: 'loc-central', hospital_id: 'h1', parent_id: null, name: 'Central Store', type: 'central_store', created_at: '' },
      { id: 'loc-er', hospital_id: 'h1', parent_id: null, name: 'Emergency Room', type: 'er', created_at: '' },
    ],
    categories: [
      { id: 'cat-emg', hospitalId: 'h1', name: 'Emergency Drugs', slug: 'emergency-drugs' },
      { id: 'cat-ctl', hospitalId: 'h1', name: 'Controlled Drugs', slug: 'controlled' },
      { id: 'cat-ivf', hospitalId: 'h1', name: 'IV Fluids', slug: 'iv-fluids' },
    ],
    suppliersById: { 'sup-1': 'Apollo Pharma' },
    items: [
      {
        id: 'item-epi',
        hospital_id: 'h1',
        sku: 'MED-001',
        name: 'Epinephrine 1mg/ml Ampoule',
        category_id: 'cat-emg',
        base_unit: 'ampoule',
        barcode: '8901000001',
        criticality: 'A',
        is_controlled: false,
        is_cold_chain: false,
        tracks_batch: true,
        tracks_expiry: true,
        unit_cost: 18,
        supplier_id: 'sup-1',
      },
      {
        id: 'item-morph',
        hospital_id: 'h1',
        sku: 'CTL-026',
        name: 'Morphine Sulphate 10mg/ml',
        category_id: 'cat-ctl',
        base_unit: 'ampoule',
        barcode: '8901000026',
        criticality: 'A',
        is_controlled: true,
        is_cold_chain: false,
        tracks_batch: true,
        tracks_expiry: true,
        unit_cost: 45,
        supplier_id: 'sup-1',
      },
      {
        id: 'item-rl',
        hospital_id: 'h1',
        sku: 'IVF-038',
        name: 'Ringer Lactate 500ml',
        category_id: 'cat-ivf',
        base_unit: 'bottle',
        barcode: '8901000038',
        criticality: 'A',
        is_controlled: false,
        is_cold_chain: false,
        tracks_batch: true,
        tracks_expiry: true,
        unit_cost: 38,
        supplier_id: 'sup-1',
      },
      {
        id: 'item-oxy',
        hospital_id: 'h1',
        sku: 'OXY-098',
        name: 'Oxygen Cylinder Type D 40L',
        category_id: 'cat-emg',
        base_unit: 'cylinder',
        barcode: '8901000098',
        criticality: 'A',
        is_controlled: false,
        is_cold_chain: false,
        tracks_batch: false,
        tracks_expiry: false,
        unit_cost: 8500,
        supplier_id: 'sup-1',
      },
    ],
    units: [
      { itemId: 'item-epi', unit: 'ampoule', factorToBase: 1, isOrderPack: false },
      { itemId: 'item-epi', unit: 'box', factorToBase: 10, isOrderPack: true },
      { itemId: 'item-rl', unit: 'bottle', factorToBase: 1, isOrderPack: false },
      { itemId: 'item-rl', unit: 'box', factorToBase: 20, isOrderPack: true },
    ],
    batches: [
      {
        id: 'b-soon',
        hospitalId: 'h1',
        itemId: 'item-morph',
        batchNo: 'CTL-B1',
        expiryDate: new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10),
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    parLevels: [
      { itemId: 'item-epi', locationId: 'loc-er', minQty: 20, parQty: 50, maxQty: 100 },
      { itemId: 'item-rl', locationId: 'loc-er', minQty: 20, parQty: 60, maxQty: 120 },
    ],
    stockLevels: [
      { id: 's1', itemId: 'item-epi', batchId: null, locationId: 'loc-central', condition: 'usable', qty: epinephrineQty, reservedQty: 0, lastCountedAt: null },
      { id: 's2', itemId: 'item-morph', batchId: 'b-soon', locationId: 'loc-er', condition: 'usable', qty: 8, reservedQty: 0, lastCountedAt: null },
      { id: 's3', itemId: 'item-rl', batchId: null, locationId: 'loc-er', condition: 'usable', qty: 10, reservedQty: 0, lastCountedAt: null },
    ],
    reasonCodes: [],
    syncedAt: '2026-11-21T00:00:00.000Z',
  });
}

describe('Final Showcase Domain Engines (Counting, Scenarios, Tasks, Assistant)', () => {
  it('enforces tolerance, witness, separation-of-duties, and What Is Needed pack rounding (Section 10.1-10.2)', () => {
    expect(
      defaultToleranceForItem({ isControlled: true, sku: 'CTL-026', criticality: 'A', categoryName: 'Controlled' }),
    ).toBe(0);
    expect(
      defaultToleranceForItem({ isControlled: false, sku: 'BLD-091', criticality: 'A', categoryName: 'Blood' }),
    ).toBe(0);
    expect(
      defaultToleranceForItem({ isControlled: false, sku: 'CON-081', criticality: 'C', categoryName: 'PPE' }),
    ).toBe(5);

    const controlledVar = computeLineVariance(9, 10, 0, 45);
    expect(controlledVar.varianceQty).toBe(-1);
    expect(controlledVar.outOfTolerance).toBe(true);
    expect(controlledVar.valueImpact).toBe(-45);

    const withinTol = computeLineVariance(99, 100, 2, 18);
    expect(withinTol.outOfTolerance).toBe(false);

    expect(
      canSubmitCountLine({ isControlled: true, sku: 'CTL-026', categoryName: 'Controlled' }, false),
    ).toEqual({ ok: false, reason: 'WITNESS_REQUIRED' });
    expect(
      canSubmitCountLine({ isControlled: true, sku: 'CTL-026', categoryName: 'Controlled' }, true),
    ).toEqual({ ok: true });

    expect(canApproveCountSession('user-a', 'user-a')).toBe(false);
    expect(canApproveCountSession('user-a', 'user-b')).toBe(true);

    const needed = computeWhatsNeeded([
      {
        itemId: 'item-rl',
        sku: 'IVF-038',
        name: 'Ringer Lactate 500ml',
        baseUnit: 'bottle',
        parQty: 60,
        minQty: 20,
        maxQty: 120,
        countedGood: 32,
        unusableRemoved: 1,
        daysToExpiry: 150,
        units: [
          { itemId: 'item-rl', unit: 'bottle', factorToBase: 1, isOrderPack: false },
          { itemId: 'item-rl', unit: 'box', factorToBase: 20, isOrderPack: true },
        ],
      },
    ]);
    expect(needed[0].needed).toBe(28);
    expect(needed[0].suggestedOrder).toBe(40);
    expect(needed[0].flags.belowPar).toBe(true);
    expect(needed[0].flags.atOrBelowMin).toBe(false);
  });

  it('evaluates all 9 scenario templates and applies the critical < 0.5 readiness cap at 59 (Section 10.3)', () => {
    expect(SCENARIO_TEMPLATES).toHaveLength(9);

    const lowSnap = makeShowcaseSnapshot(5);
    const lowPlan = evaluateScenarioPlan('cardiac_surge', { casualties: 25, arrivalWindowMin: 30 }, lowSnap);
    expect(lowPlan.score).toBeLessThanOrEqual(59);
    expect(lowPlan.band).toBe('not_ready');
    expect(lowPlan.shortfalls.length).toBeGreaterThan(0);

    const highSnap = makeShowcaseSnapshot(150);
    const highPlan = evaluateScenarioPlan('cardiac_surge', { casualties: 25, arrivalWindowMin: 30 }, highSnap);
    expect(highPlan.score).toBeGreaterThan(lowPlan.score);

    const all = evaluateAllScenarios(highSnap);
    expect(all).toHaveLength(9);
  });

  it('generates prioritized deduplicated operational tasks from stock rules (MP-TSK-001..006)', () => {
    const snap = makeShowcaseSnapshot(100);
    const tasks = generateOperationalTasks(snap);

    expect(tasks.some((t) => t.priority === 'critical' && t.sku === 'OXY-098')).toBe(true);
    expect(tasks.some((t) => t.priority === 'critical' && t.sku === 'IVF-038')).toBe(true);
    expect(tasks.some((t) => t.category === 'expiry' && t.sku === 'CTL-026')).toBe(true);

    const keys = tasks.map((t) => t.dedupeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('enforces read-only assistant tool whitelist and returns timestamped answers (MP-AST-001..005)', () => {
    const snap = makeShowcaseSnapshot(100);
    const scenarios = evaluateAllScenarios(snap);
    const tasks = generateOperationalTasks(snap);
    const ctx = {
      snapshot: snap,
      scenarios,
      tasks,
      openTaskCount: tasks.length,
      countSessions: [],
    };

    expect(ALLOWED_ASSISTANT_TOOLS).toHaveLength(6);
    expect(() => executeWhitelistedTool('delete_all_stock', {}, ctx)).toThrow('TOOL_NOT_ALLOWED');

    const res = answerAssistantQuery('What items are expiring soon?', ctx);
    expect(res.toolUsed).toBe('list_expiring');
    expect(res.asOf).toBe('2026-11-21T00:00:00.000Z');
    expect(res.bullets.length).toBeGreaterThan(0);
  });
});
