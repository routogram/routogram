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
    className: "border-sky-800/60 bg-sky-950/60 text-sky-400",
  },
  preact: {
    label: "PREACT",
    className: "border-violet-800/60 bg-violet-950/60 text-violet-400",
  },
  lit: {
    label: "LIT",
    className: "border-indigo-800/60 bg-indigo-950/60 text-indigo-400",
  },
  astro: {
    label: "ASTRO",
    className: "border-orange-800/60 bg-orange-950/60 text-orange-400",
  },
  svelte: {
    label: "SVELTE",
    className: "border-orange-800/60 bg-orange-950/60 text-orange-400",
  },
  hono: {
    label: "HONO",
    className: "border-orange-800/60 bg-orange-950/60 text-orange-300",
  },
  nest: {
    label: "NEST",
    className: "border-red-800/60 bg-red-950/60 text-red-300",
  },
  express: {
    label: "EXPRESS",
    className: "border-zinc-600 bg-zinc-800 text-zinc-200",
  },
  vanilla: {
    label: "VANILLA",
    className: "border-yellow-800/60 bg-yellow-950/60 text-yellow-300",
  },
  unknown: {
    label: "JS",
    className: "border-zinc-700 bg-zinc-900 text-zinc-400",
  },
};
