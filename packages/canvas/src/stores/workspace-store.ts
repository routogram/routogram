import type { WorkspaceRegistry } from "@routogram/types";
import { create } from "zustand";

import {
  activateWorkspace,
  addWorkspace,
  fetchWorkspaceRegistry,
  removeWorkspace,
  rescanWorkspace,
} from "@/lib/apis/workspaces";

type WorkspaceState = {
  registry: WorkspaceRegistry | null;
  loading: boolean;
  actionId: string | null;
  error: string | null;
  pickerOpen: boolean;
  load: () => Promise<void>;
  activate: (id: string) => Promise<void>;
  add: (path: string, scanPath?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  rescan: (id: string) => Promise<void>;
  openPicker: () => void;
  closePicker: () => void;
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  registry: null,
  loading: true,
  actionId: null,
  error: null,
  pickerOpen: false,

  load: async () => {
    try {
      set({ loading: true, error: null });
      set({ registry: await fetchWorkspaceRegistry(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error) });
    }
  },

  activate: async (id) => {
    try {
      set({ actionId: id, error: null });
      await activateWorkspace(id);
      await get().load();
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ actionId: null });
    }
  },

  add: async (path, scanPath) => {
    try {
      set({ actionId: "add", error: null });
      await addWorkspace(path, scanPath);
      await get().load();
      set({ pickerOpen: false });
    } catch (error) {
      set({ error: message(error) });
      throw error;
    } finally {
      set({ actionId: null });
    }
  },

  remove: async (id) => {
    try {
      set({ actionId: id, error: null });
      await removeWorkspace(id);
      await get().load();
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ actionId: null });
    }
  },

  rescan: async (id) => {
    try {
      set({ actionId: id, error: null });
      await rescanWorkspace(id);
      await get().load();
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ actionId: null });
    }
  },

  openPicker: () => set({ pickerOpen: true }),
  closePicker: () => set({ pickerOpen: false }),
}));

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
