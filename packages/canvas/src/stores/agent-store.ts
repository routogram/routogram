import { create } from "zustand";

import {
  type AgentEvent,
  type AgentMission,
  approveMission,
  fetchMissions,
  rejectMission,
  startMission,
} from "@/lib/apis";

type AgentState = {
  open: boolean;
  loading: boolean;
  error: string | null;
  missions: AgentMission[];
  activeId: string | null;
  setOpen: (open: boolean) => void;
  load: () => Promise<void>;
  start: (goal: string, targetNodeId?: string) => Promise<void>;
  approve: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  setMissions: (missions: AgentMission[]) => void;
  applyEvent: (event: AgentEvent) => void;
};

export const useAgentStore = create<AgentState>((set, get) => ({
  open: false,
  loading: false,
  error: null,
  missions: [],
  activeId: null,
  setOpen: (open) => {
    set({ open });
    if (open && get().missions.length === 0) {
      void get().load();
    }
  },
  load: async () => {
    const missions = await fetchMissions();
    set({ missions, activeId: get().activeId ?? missions[0]?.id ?? null });
  },
  start: async (goal, targetNodeId) => {
    set({ loading: true, error: null });
    try {
      const mission = await startMission(goal, targetNodeId);
      set((state) => ({
        missions: [mission, ...state.missions.filter((item) => item.id !== mission.id)],
        activeId: mission.id,
        loading: false,
      }));
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  approve: async (id) => {
    set({ loading: true, error: null });
    try {
      const mission = await approveMission(id);
      set((state) => ({ missions: replace(state.missions, mission), loading: false }));
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  reject: async (id) => {
    set({ loading: true, error: null });
    try {
      const mission = await rejectMission(id);
      set((state) => ({ missions: replace(state.missions, mission), loading: false }));
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  setMissions: (missions) =>
    set((state) => ({ missions, activeId: state.activeId ?? missions[0]?.id ?? null })),
  applyEvent: (event) =>
    set((state) => {
      const missions = state.missions.map((mission) =>
        mission.id === event.missionId
          ? {
              ...mission,
              status: event.phase,
              events: [...mission.events, event],
              pending:
                event.phase === "awaiting-approval"
                  ? {
                      title: "Architecture patch",
                      diff: "",
                      files:
                        typeof event.data === "object" &&
                        event.data !== null &&
                        Array.isArray((event.data as { files?: unknown }).files)
                          ? (event.data as { files: string[] }).files
                          : [],
                      warnings: [],
                    }
                  : mission.pending,
            }
          : mission,
      );
      return { missions, activeId: state.activeId ?? event.missionId };
    }),
}));

function replace(missions: AgentMission[], mission: AgentMission): AgentMission[] {
  return missions.some((item) => item.id === mission.id)
    ? missions.map((item) => (item.id === mission.id ? mission : item))
    : [mission, ...missions];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
