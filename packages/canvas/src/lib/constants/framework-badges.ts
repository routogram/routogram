import type { UIFramework } from "@/lib/utils/detect-framework";

export interface FrameworkBadgeStyle {
  label: string;
  className: string;
}

export const FRAMEWORK_BADGE_CONFIG: Record<UIFramework, FrameworkBadgeStyle> = {
  react: {
    label: "REACT",
    className: "border-cyan-800/60 bg-cyan-950/60 text-cyan-400",
  },
  vue: {
    label: "VUE",
    className: "border-emerald-800/60 bg-emerald-950/60 text-emerald-400",
  },
  solid: {
    label: "SOLID",
    className: "border-blue-800/60 bg-blue-950/60 text-blue-400",
  },
  preact: {
    label: "PREACT",
    className: "border-violet-800/60 bg-violet-950/60 text-violet-400",
  },
  lit: {
    label: "LIT",
    className: "border-amber-800/60 bg-amber-950/60 text-amber-400",
  },
  astro: {
    label: "ASTRO",
    className: "border-orange-800/60 bg-orange-950/60 text-orange-400",
  },
  svelte: {
    label: "SVELTE",
    className: "border-rose-800/60 bg-rose-950/60 text-rose-400",
  },
  unknown: {
    label: "JS",
    className: "border-zinc-700 bg-zinc-900 text-zinc-400",
  },
};
