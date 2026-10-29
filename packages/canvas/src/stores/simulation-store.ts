import { create } from "zustand";

import {
  forkSimulation,
  type MigrationResult,
  mutateSimulation,
  resetSimulation,
  type SimulationOperation,
  type SimulationResult,
  scanMigration,
} from "@/lib/apis";

export type SimulationState = {
  enabled: boolean;
  showProjected: boolean;
  loading: boolean;
  error: string | null;
  result: SimulationResult | null;
  migration: MigrationResult | null;
  impactOpen: boolean;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  toggleProjected: () => void;
  run: (operations: SimulationOperation[]) => Promise<void>;
  fork: () => Promise<void>;
  runMigration: (recipeId: string) => Promise<void>;
  setResult: (result: SimulationResult) => void;
  reset: () => Promise<void>;
  dismissImpact: () => void;
};

export const useSimulationStore = create<SimulationState>((set, get) => ({
  enabled: false,
  showProjected: true,
  loading: false,
  error: null,
  result: null,
  migration: null,
  impactOpen: false,
  setEnabled: (enabled: boolean) => {
    set({ enabled, error: null, ...(enabled ? {} : { impactOpen: false }) });
    if (enabled && !get().result) {
      void get().fork();
    }
  },
  toggleEnabled: () => {
    get().setEnabled(!get().enabled);
  },
  toggleProjected: () => set((state) => ({ showProjected: !state.showProjected })),
  fork: async () => {
    set({ loading: true, error: null });
    try {
      const result = await forkSimulation();
      set({ result, migration: null, loading: false });
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  run: async (operations: SimulationOperation[]) => {
    set({ loading: true, error: null });
    try {
      const result = await mutateSimulation(operations);
      set({ result, migration: null, loading: false, impactOpen: true, showProjected: true });
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  runMigration: async (recipeId: string) => {
    set({ loading: true, error: null });
    try {
      const migration = await scanMigration(recipeId);
      set({
        migration,
        result: null,
        loading: false,
        impactOpen: true,
        showProjected: true,
      });
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  setResult: (result: SimulationResult) => set({ result, migration: null, loading: false }),
  reset: async () => {
    set({ loading: true, error: null });
    try {
      const result = await resetSimulation();
      set({ result, migration: null, loading: false, impactOpen: false });
    } catch (error) {
      set({ error: message(error), loading: false });
    }
  },
  dismissImpact: () => set({ impactOpen: false }),
}));

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
