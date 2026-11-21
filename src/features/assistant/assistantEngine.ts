import type { CompletedCountSession } from '@/features/counting/countSessionStore';
import type { InventorySnapshot } from '@/features/inventory/types';
import type { EvaluatedScenarioPlan } from '@/features/scenarios/scenarioEngine';
import type { OperationalTask } from '@/features/tasks/taskRules';

/**
 * Strict read-only tool whitelist for Ask MedPulse assistant (Section 9.3, MP-AST-001, MP-AST-005).
 */
export const ALLOWED_ASSISTANT_TOOLS = [
  'get_stock',
  'list_expiring',
  'list_below_par',
  'get_count_status',
  'get_readiness',
  'list_open_tasks',
] as const;

export type WhitelistedAssistantTool = (typeof ALLOWED_ASSISTANT_TOOLS)[number];

export interface AssistantContext {
  snapshot: InventorySnapshot | null;
  scenarios: readonly EvaluatedScenarioPlan[];
  tasks: readonly OperationalTask[];
  openTaskCount: number;
  countSessions: readonly CompletedCountSession[];
}

export interface AssistantResponse {
  answer: string;
  toolUsed: WhitelistedAssistantTool;
  bullets: string[];
  asOf: string;
  targetRoute?: string;
}

export function isAllowedAssistantTool(tool: string): tool is WhitelistedAssistantTool {
  return (ALLOWED_ASSISTANT_TOOLS as readonly string[]).includes(tool);
}

/**
 * Executes a single whitelisted read-only stock query tool.
 * Unknown or write tool names are rejected immediately (MP-AST-001, MP-AST-005).
 */
export function executeWhitelistedTool(
  toolName: string,
  args: { query?: string; days?: number },
  ctx: AssistantContext,
): AssistantResponse {
  if (!isAllowedAssistantTool(toolName)) {
    throw new Error('TOOL_NOT_ALLOWED');
  }

  const asOf = ctx.snapshot?.lastSyncedAt || new Date().toISOString();
  const items = ctx.snapshot?.items ?? [];

  switch (toolName) {
    case 'get_stock': {
      const q = (args.query ?? '').trim().toLowerCase();
      const matches = (
        q
          ? items.filter(
              (i) =>
                i.name.toLowerCase().includes(q) ||
                i.sku.toLowerCase().includes(q) ||
                i.categoryName.toLowerCase().includes(q),
            )
          : items
      ).slice(0, 5);

      return {
        toolUsed: 'get_stock',
        asOf,
        answer:
          matches.length > 0
            ? `Found ${matches.length} matching stock items.`
            : 'No matching items found in cached hospital stock.',
        bullets: matches.map(
          (i) => `${i.name} (${i.sku}): ${i.totalUsable} ${i.baseUnit} usable · PAR ${i.totalPar}`,
        ),
        targetRoute: '/(tabs)/inventory',
      };
    }

    case 'list_expiring': {
      const windowDays = args.days ?? 90;
      const expiring = items
        .filter((i) => i.daysToExpiry !== null && i.daysToExpiry <= windowDays && i.totalUsable > 0)
        .sort((a, b) => (a.daysToExpiry ?? 999) - (b.daysToExpiry ?? 999))
        .slice(0, 5);

      return {
        toolUsed: 'list_expiring',
        asOf,
        answer: `${expiring.length} items have usable batches expiring within ${windowDays} days.`,
        bullets: expiring.map(
          (i) =>
            `${i.name} (${i.sku}): expires ${i.earliestExpiry} (${i.daysToExpiry}d left) · ${i.totalUsable} ${i.baseUnit}`,
        ),
        targetRoute: '/(tabs)/inventory',
      };
    }

    case 'list_below_par': {
      const lowItems = items
        .filter((i) => i.status === 'out' || i.status === 'low')
        .sort((a, b) => a.totalUsable / Math.max(a.totalPar, 1) - b.totalUsable / Math.max(b.totalPar, 1))
        .slice(0, 5);

      return {
        toolUsed: 'list_below_par',
        asOf,
        answer: `${lowItems.length} top items require replenishment (out of stock or below PAR).`,
        bullets: lowItems.map(
          (i) =>
            `${i.name} (${i.sku}): ${i.totalUsable}/${i.totalPar} ${i.baseUnit} · short ${Math.max(i.totalPar - i.totalUsable, 0)}`,
        ),
        targetRoute: '/(tabs)/inventory',
      };
    }

    case 'get_count_status': {
      const recent = ctx.countSessions.slice(0, 4);
      const classACycleCount = ctx.tasks.filter((t) => t.category === 'cycle_count').length;
      return {
        toolUsed: 'get_count_status',
        asOf,
        answer:
          recent.length > 0
            ? `${recent.length} recent count sessions completed; ${classACycleCount} Class-A cycle counts due.`
            : `No completed count sessions yet today; ${classACycleCount} Class-A witnessed cycle counts due.`,
        bullets:
          recent.length > 0
            ? recent.map(
                (s) =>
                  `${s.locationName} (${s.type.toUpperCase()} · ${s.mode}): ${s.countedCount} counted · ${s.accuracyPct.toFixed(0)}% accuracy`,
              )
            : ctx.tasks
                .filter((t) => t.category === 'cycle_count')
                .slice(0, 4)
                .map((t) => `${t.title} (${t.locationName})`),
        targetRoute: '/(tabs)/inventory',
      };
    }

    case 'get_readiness': {
      const sorted = [...ctx.scenarios].sort((a, b) => a.score - b.score);
      const avg =
        sorted.length > 0
          ? Math.round(sorted.reduce((sum, s) => sum + s.score, 0) / sorted.length)
          : 0;
      return {
        toolUsed: 'get_readiness',
        asOf,
        answer: `Average hospital scenario readiness is ${avg}% across ${sorted.length} templates.`,
        bullets: sorted
          .slice(0, 5)
          .map(
            (s) =>
              `${s.templateId.replace(/_/g, ' ')}: ${s.score}% (${s.shortfalls.length} shortfalls)`,
          ),
        targetRoute: '/(tabs)/scenarios',
      };
    }

    case 'list_open_tasks': {
      const top = ctx.tasks.slice(0, 5);
      return {
        toolUsed: 'list_open_tasks',
        asOf,
        answer: `${ctx.openTaskCount} open operational tasks prioritized across clinical roles.`,
        bullets: top.map((t) => `[${t.priority.toUpperCase()}] ${t.title} — ${t.locationName}`),
        targetRoute: '/(tabs)/tasks',
      };
    }
  }
}

/**
 * Maps a natural-language question to a strict whitelisted read-only stock query tool
 * (MP-AST-001..005). Never mutates state or calls external APIs.
 */
export function answerAssistantQuery(question: string, ctx: AssistantContext): AssistantResponse {
  const q = question.trim().toLowerCase();

  if (/expir|soon|shelf|batch/i.test(q)) {
    return executeWhitelistedTool('list_expiring', { days: 90 }, ctx);
  }
  if (/readiness|ready|scenario|disaster|accident|fire|outbreak|surge/i.test(q)) {
    return executeWhitelistedTool('get_readiness', {}, ctx);
  }
  if (/below par|low stock|shortage|shortfall|replenish|out of stock|need/i.test(q)) {
    return executeWhitelistedTool('list_below_par', {}, ctx);
  }
  if (/count|variance|audit|cycle/i.test(q)) {
    return executeWhitelistedTool('get_count_status', {}, ctx);
  }
  if (/task|todo|priority|pending/i.test(q)) {
    return executeWhitelistedTool('list_open_tasks', {}, ctx);
  }

  // Extract potential medication/item token (fallback to general stock overview)
  const stopWords = new Set(['how', 'much', 'many', 'do', 'we', 'have', 'what', 'is', 'in', 'stock', 'check', 'show', 'the', 'of', 'for']);
  const keyword = q
    .split(/\s+/)
    .find((word) => word.length >= 3 && !stopWords.has(word));

  return executeWhitelistedTool('get_stock', { query: keyword ?? '' }, ctx);
}
