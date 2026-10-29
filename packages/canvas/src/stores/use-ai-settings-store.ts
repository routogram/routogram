import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ModelOption = {
  id: string;
  name: string;
  provider: "deepseek" | "openai" | "anthropic" | "custom";
  defaultEffort?: EffortLevel;
};

export type EffortLevel = "Low" | "Medium" | "High";

export const DEFAULT_MODEL: ModelOption = {
  id: "deepseek-flash",
  name: "DeepSeek-V4.1-Flash",
  provider: "deepseek",
  defaultEffort: "Low",
};
export const DEFAULT_EFFORT: EffortLevel = "Low";

type AiSettingsState = {
  selectedModel: ModelOption;
  effort: EffortLevel;
  setModel: (model: ModelOption) => void;
  setEffort: (effort: EffortLevel) => void;
};

export const useAiSettingsStore = create<AiSettingsState>()(
  persist(
    (set) => ({
      selectedModel: DEFAULT_MODEL,
      effort: DEFAULT_EFFORT,
      setModel: (selectedModel) => set({ selectedModel }),
      setEffort: (effort) => set({ effort }),
    }),
    { name: "routogram-ai-settings" },
  ),
);
