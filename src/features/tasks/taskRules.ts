import type { UserRole } from '@/lib/database.types';
import type { InventoryItemSummary, InventorySnapshot } from '@/features/inventory/types';

export type TaskPriority = 'critical' | 'high' | 'normal';
export type TaskCategory =
  | 'restock'
  | 'expiry'
  | 'cycle_count'
  | 'cylinder_check'
  | 'cold_chain';

export interface OperationalTask {
  id: string;
  dedupeKey: string;
  title: string;
  reasoning: string;
  priority: TaskPriority;
  role: UserRole;
  locationName: string;
  itemId: string;
  sku: string;
  category: TaskCategory;
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

function primaryLocationLabel(
  item: InventoryItemSummary,
  locationsById: Map<string, string>,
): string {
  const locIds = Object.keys(item.byLocation);
  if (locIds.length === 0) return 'Central Store';
  return locationsById.get(locIds[0]) ?? 'Central Store';
}

/**
 * Deterministic rules engine for operational tasks (MP-TSK-001, 002, 004, 006).
 * Strictly deduplicated by dedupeKey so re-runs never generate duplicate tasks,
 * and functions identically whether Gemini is available or unavailable.
 */
export function generateOperationalTasks(snapshot: InventorySnapshot | null): OperationalTask[] {
  if (!snapshot) return [];

  const locationsById = new Map<string, string>();
  for (const loc of snapshot.locations) {
    locationsById.set(loc.id, loc.name);
  }

  const seenKeys = new Set<string>();
  const tasks: OperationalTask[] = [];

  const addTask = (task: OperationalTask) => {
    if (seenKeys.has(task.dedupeKey)) {
      return;
    }
    seenKeys.add(task.dedupeKey);
    tasks.push(task);
  };

  for (const item of snapshot.items) {
    const locName = primaryLocationLabel(item, locationsById);

    if (item.totalUsable <= 0) {
      addTask({
        id: `task-out-${item.id}`,
        dedupeKey: `restock:out:${item.id}`,
        title: `Emergency restock: ${item.name}`,
        reasoning: `Usable stock is 0 ${item.baseUnit} vs PAR ${item.totalPar}.`,
        priority: 'critical',
        role: 'store_manager',
        locationName: locName,
        itemId: item.id,
        sku: item.sku,
        category: 'restock',
      });
    } else if (item.totalMin > 0 && item.totalUsable <= item.totalMin) {
      addTask({
        id: `task-min-${item.id}`,
        dedupeKey: `restock:min:${item.id}`,
        title: `Replenish below MIN: ${item.name}`,
        reasoning: `Usable ${item.totalUsable} ${item.baseUnit} is at/below MIN (${item.totalMin}).`,
        priority: 'critical',
        role: 'store_manager',
        locationName: locName,
        itemId: item.id,
        sku: item.sku,
        category: 'restock',
      });
    } else if (item.totalPar > 0 && item.totalUsable < item.totalPar) {
      addTask({
        id: `task-par-${item.id}`,
        dedupeKey: `restock:par:${item.id}`,
        title: `Refill to PAR: ${item.name}`,
        reasoning: `Current stock ${item.totalUsable}/${item.totalPar} ${item.baseUnit} (shortfall ${item.totalPar - item.totalUsable}).`,
        priority: 'high',
        role: item.isControlled ? 'pharmacist' : 'store_manager',
        locationName: locName,
        itemId: item.id,
        sku: item.sku,
        category: 'restock',
      });
    }

    if (item.daysToExpiry !== null && item.daysToExpiry <= 30) {
      addTask({
        id: `task-exp30-${item.id}`,
        dedupeKey: `expiry:30:${item.id}`,
        title: `Rotate/quarantine expiring batch: ${item.name}`,
        reasoning: `Earliest usable batch expires in ${Math.max(item.daysToExpiry, 0)} days (${item.earliestExpiry}).`,
        priority: 'critical',
        role: 'pharmacist',
        locationName: locName,
        itemId: item.id,
        sku: item.sku,
        category: 'expiry',
      });
    } else if (item.daysToExpiry !== null && item.daysToExpiry <= 60) {
      addTask({
        id: `task-exp60-${item.id}`,
        dedupeKey: `expiry:60:${item.id}`,
        title: `FEFO priority issue check: ${item.name}`,
        reasoning: `Batch ${item.earliestExpiry} expires within ${item.daysToExpiry} days.`,
        priority: 'normal',
        role: 'pharmacist',
        locationName: locName,
        itemId: item.id,
        sku: item.sku,
        category: 'expiry',
      });
    }

    if (item.sku.startsWith('OXY-')) {
      addTask({
        id: `task-oxy-${item.id}`,
        dedupeKey: `cylinder:${item.id}`,
        title: `Verify cylinder pressure: ${item.name}`,
        reasoning: `Critical Class-A oxygen reserve requires pressure & valve check.`,
        priority: 'high',
        role: 'nurse',
        locationName: 'ICU',
        itemId: item.id,
        sku: item.sku,
        category: 'cylinder_check',
      });
    }

    if (item.isColdChain) {
      addTask({
        id: `task-cold-${item.id}`,
        dedupeKey: `cold:${item.id}`,
        title: `Cold-chain temp audit: ${item.name}`,
        reasoning: `Verify 2-8°C storage log for temperature-sensitive stock.`,
        priority: 'high',
        role: 'pharmacist',
        locationName: locName,
        itemId: item.id,
        sku: item.sku,
        category: 'cold_chain',
      });
    }

    if (item.criticality === 'A' && (item.isControlled || item.sku.startsWith('BLD-'))) {
      addTask({
        id: `task-cycle-${item.id}`,
        dedupeKey: `cycle:a:${item.id}`,
        title: `7-day witnessed cycle count: ${item.name}`,
        reasoning: `Class-A ${item.isControlled ? 'controlled drug' : 'blood unit'} requires weekly witness verification.`,
        priority: 'high',
        role: item.isControlled ? 'pharmacist' : 'nurse',
        locationName: locName,
        itemId: item.id,
        sku: item.sku,
        category: 'cycle_count',
      });
    }
  }

  tasks.sort((a, b) => {
    const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pDiff !== 0) return pDiff;
    return a.title.localeCompare(b.title);
  });

  return tasks;
}
