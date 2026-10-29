import en from "./locales/en.json";
import vi from "./locales/vi.json";

export const messages = { en, vi } as const;
export type AppMessages = (typeof messages)["en"];
