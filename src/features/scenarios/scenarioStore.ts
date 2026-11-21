import { create } from 'zustand';
import {
  SCENARIO_TEMPLATES,
  type ScenarioParameters,
  type ScenarioTemplateId,
} from './scenarioEngine';

export type ChecklistTaskStatus = 'todo' | 'in_progress' | 'done';

export interface ScenarioRuntimeState {
  params: ScenarioParameters;
  approvalStatus: 'pending_approval' | 'approved';
  approvedByName: string | null;
  approvedAt: string | null;
  isActive: boolean;
  emergencyMode: boolean;
  activatedAt: string | null;
  taskStatuses: Record<string, ChecklistTaskStatus>;
  lastStandDownReason: string | null;
  lastStandDownAt: string | null;
}

function createInitialRecord(): Record<ScenarioTemplateId, ScenarioRuntimeState> {
  const initial = {} as Record<ScenarioTemplateId, ScenarioRuntimeState>;
  for (const tpl of SCENARIO_TEMPLATES) {
    const taskStatuses: Record<string, ChecklistTaskStatus> = {};
    for (const step of tpl.timeline) {
      taskStatuses[step.id] = 'todo';
    }
    initial[tpl.id] = {
      params: { ...tpl.defaultParams },
      approvalStatus: 'pending_approval',
      approvedByName: null,
      approvedAt: null,
      isActive: false,
      emergencyMode: false,
      activatedAt: null,
      taskStatuses,
      lastStandDownReason: null,
      lastStandDownAt: null,
    };
  }
  return initial;
}

interface ScenarioStore {
  byId: Record<ScenarioTemplateId, ScenarioRuntimeState>;
  setParams: (id: ScenarioTemplateId, next: Partial<ScenarioParameters>) => void;
  approvePlan: (id: ScenarioTemplateId, approverName: string) => void;
  activatePlan: (id: ScenarioTemplateId, timelineIds: readonly string[]) => void;
  cycleTaskStatus: (id: ScenarioTemplateId, stepId: string) => void;
  toggleEmergencyMode: (id: ScenarioTemplateId) => void;
  standDownPlan: (id: ScenarioTemplateId, reason: string) => void;
}

export const useScenarioStore = create<ScenarioStore>((set) => ({
  byId: createInitialRecord(),

  setParams: (id, next) =>
    set((state) => {
      const current = state.byId[id];
      const casualties = Math.max(
        1,
        Math.min(500, next.casualties ?? current.params.casualties),
      );
      const arrivalWindowMin = Math.max(
        5,
        Math.min(240, next.arrivalWindowMin ?? current.params.arrivalWindowMin),
      );
      return {
        byId: {
          ...state.byId,
          [id]: {
            ...current,
            params: { casualties, arrivalWindowMin },
            // Parameter change invalidates prior human approval per MP-SEN-008
            approvalStatus: current.isActive ? current.approvalStatus : 'pending_approval',
          },
        },
      };
    }),

  approvePlan: (id, approverName) =>
    set((state) => ({
      byId: {
        ...state.byId,
        [id]: {
          ...state.byId[id],
          approvalStatus: 'approved',
          approvedByName: approverName,
          approvedAt: new Date().toISOString(),
        },
      },
    })),

  activatePlan: (id, timelineIds) =>
    set((state) => {
      const current = state.byId[id];
      if (current.approvalStatus !== 'approved') {
        return state;
      }
      const nextStatuses: Record<string, ChecklistTaskStatus> = { ...current.taskStatuses };
      for (const stepId of timelineIds) {
        nextStatuses[stepId] = 'todo';
      }
      return {
        byId: {
          ...state.byId,
          [id]: {
            ...current,
            isActive: true,
            emergencyMode: true,
            activatedAt: new Date().toISOString(),
            taskStatuses: nextStatuses,
          },
        },
      };
    }),

  cycleTaskStatus: (id, stepId) =>
    set((state) => {
      const current = state.byId[id];
      const existing = current.taskStatuses[stepId] ?? 'todo';
      const nextStatus: ChecklistTaskStatus =
        existing === 'todo' ? 'in_progress' : existing === 'in_progress' ? 'done' : 'todo';
      return {
        byId: {
          ...state.byId,
          [id]: {
            ...current,
            taskStatuses: {
              ...current.taskStatuses,
              [stepId]: nextStatus,
            },
          },
        },
      };
    }),

  toggleEmergencyMode: (id) =>
    set((state) => ({
      byId: {
        ...state.byId,
        [id]: {
          ...state.byId[id],
          emergencyMode: !state.byId[id].emergencyMode,
        },
      },
    })),

  standDownPlan: (id, reason) =>
    set((state) => {
      const current = state.byId[id];
      return {
        byId: {
          ...state.byId,
          [id]: {
            ...current,
            isActive: false,
            emergencyMode: false,
            lastStandDownReason: reason.trim() || 'Drill / incident concluded',
            lastStandDownAt: new Date().toISOString(),
          },
        },
      };
    }),
}));
