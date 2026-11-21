import { create } from 'zustand';
import type { WhatsNeededLine } from './countingLogic';

export type CountType = 'par' | 'cycle' | 'spot';
export type CountMode = 'blind' | 'visible';

export interface CompletedCountSession {
  id: string;
  locationId: string;
  locationName: string;
  type: CountType;
  mode: CountMode;
  countedCount: number;
  skippedCount: number;
  varianceCount: number;
  postedCount: number;
  accuracyPct: number;
  completedAt: string;
  whatsNeeded: WhatsNeededLine[];
}

interface CountSessionState {
  sessions: CompletedCountSession[];
  addSession: (session: CompletedCountSession) => void;
  clearSessions: () => void;
}

export const useCountSessionStore = create<CountSessionState>((set) => ({
  sessions: [],
  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions.filter((s) => s.id !== session.id)].slice(0, 15),
    })),
  clearSessions: () => set({ sessions: [] }),
}));
