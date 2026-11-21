import { create } from 'zustand';

export type OperationalTaskStatus = 'todo' | 'done' | 'snoozed' | 'escalated';

export interface TaskEventRecord {
  id: string;
  taskId: string;
  action: 'done' | 'snoozed' | 'escalated' | 'reopened';
  actorRole: string;
  at: string;
}

interface TaskStoreState {
  statusById: Record<string, OperationalTaskStatus>;
  events: TaskEventRecord[];
  markTask: (taskId: string, status: OperationalTaskStatus, actorRole: string) => void;
}

export const useTaskStore = create<TaskStoreState>((set) => ({
  statusById: {},
  events: [],
  markTask: (taskId, status, actorRole) =>
    set((state) => {
      const action: TaskEventRecord['action'] = status === 'todo' ? 'reopened' : status;
      return {
        statusById: {
          ...state.statusById,
          [taskId]: status,
        },
        events: [
          {
            id: `${taskId}-${Date.now()}`,
            taskId,
            action,
            actorRole,
            at: new Date().toISOString(),
          },
          ...state.events,
        ].slice(0, 50),
      };
    }),
}));
