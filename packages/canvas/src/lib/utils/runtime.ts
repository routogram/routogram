import type {
  RoutogramNode,
  RoutogramRuntimeApiCall,
  RoutogramRuntimeComponentMetric,
  RoutogramRuntimeSnapshot,
} from "@routogram/types";

export function findRuntimeComponent(
  node: RoutogramNode,
  runtime: RoutogramRuntimeSnapshot | null,
): RoutogramRuntimeComponentMetric | null {
  if (!runtime || node.kind !== "component") {
    return null;
  }

  const normalizedNodeFile = normalizeFile(node.file);

  return (
    runtime.components.find((component) => {
      if (component.file) {
        const normalizedRuntimeFile = normalizeFile(component.file);
        if (
          normalizedRuntimeFile === normalizedNodeFile ||
          normalizedRuntimeFile.endsWith(normalizedNodeFile) ||
          normalizedNodeFile.endsWith(normalizedRuntimeFile)
        ) {
          return true;
        }
      }

      return component.name === node.name;
    }) ?? null
  );
}

export function runtimeHeatColor(component: RoutogramRuntimeComponentMetric): string | null {
  if (component.recentRenders >= 5) {
    return "#fb7185";
  }
  if (component.recentRenders >= 2) {
    return "#f59e0b";
  }
  if (component.recentRenders > 0) {
    return "#34d399";
  }

  return null;
}

export function findRuntimeApiCall(
  node: RoutogramNode | undefined,
  runtime: RoutogramRuntimeSnapshot | null,
): RoutogramRuntimeApiCall | null {
  if (!node?.route || !runtime) {
    return null;
  }

  return (
    [...runtime.apiCalls].reverse().find((call) => pathnameForCall(call.url) === node.route) ?? null
  );
}

export function pathnameForCall(url: string): string {
  try {
    return new URL(url, window.location.origin).pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

export function normalizeFile(file: string): string {
  return file.replaceAll("\\", "/").replace(/^\.\//, "");
}
