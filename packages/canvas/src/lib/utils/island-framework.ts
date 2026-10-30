import type { RoutogramNode } from "@routogram/types";

import type { UIFramework } from "@/lib/utils/detect-framework";

export type IslandVisual = {
  framework: UIFramework;
  hydration: string | null;
};

export function resolveIslandVisual(node: RoutogramNode, targetFile?: string): IslandVisual | null {
  const isIsland = node.kind === "island" || node.meta?.isIsland === true;
  if (!isIsland) return null;

  const metadata = node.metadata ?? {};
  const source =
    typeof metadata.source === "string"
      ? metadata.source
      : typeof metadata.source_file === "string"
        ? metadata.source_file
        : undefined;
  const file = (targetFile ?? source ?? node.file).toLowerCase();
  const hydration =
    typeof metadata.hydration === "string" ? metadata.hydration : (node.meta?.hydration ?? null);

  return {
    framework: detectIslandFramework(file),
    hydration,
  };
}

function detectIslandFramework(file: string): UIFramework {
  if (file.endsWith(".vue")) return "vue";
  if (file.endsWith(".svelte")) return "svelte";
  if (file.endsWith(".astro")) return "astro";
  if (file.endsWith(".tsx") || file.endsWith(".jsx")) {
    return file.includes("solid") ? "solid" : "react";
  }
  if (file.endsWith(".ts") || file.endsWith(".js")) return "lit";
  if (file.includes("/solid/")) return "solid";
  if (file.includes("/react/")) return "react";
  if (file.includes("/lit/")) return "lit";
  return "unknown";
}
