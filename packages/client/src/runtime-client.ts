import type {
  RoutogramRuntimeApiCall,
  RoutogramRuntimeComponentMetric,
  RoutogramRuntimeSnapshot,
} from "@routogram/types";
import { createNetworkTracker } from "./network.js";
import { createFiberTracker } from "./react-fiber.js";
import { createTransport } from "./transport.js";
import type { NetworkRecord } from "./types.js";

export type RoutogramRuntimeOptions = {
  enabled?: boolean;
  daemonUrl?: string;
  flushIntervalMs?: number;
};

export type RoutogramRuntimeHandle = {
  flush: () => void;
  getSnapshot: () => RoutogramRuntimeSnapshot;
  stop: () => void;
};

export function initRoutogramRuntime(
  options: RoutogramRuntimeOptions = {},
): RoutogramRuntimeHandle {
  const noop = createNoopHandle();
  if (
    options.enabled === false ||
    typeof window === "undefined" ||
    typeof WebSocket === "undefined"
  ) {
    return noop;
  }

  const startedAt = Date.now();
  const sessionId = crypto.randomUUID();
  const transport = createTransport({
    daemonUrl: options.daemonUrl ?? "http://127.0.0.1:4040",
  });
  const fiber = createFiberTracker();
  const network = createNetworkTracker(() => scheduleFlush());
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  const route = () => window.location.pathname;
  let currentRoute = route();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  fiber.install();
  network.install();

  const snapshot = (): RoutogramRuntimeSnapshot => {
    const now = Date.now();
    const components: RoutogramRuntimeComponentMetric[] = fiber.snapshot().map((component) => ({
      key: component.key,
      name: component.name,
      file: component.file,
      renderCount: component.renderCount,
      rerenderCount: Math.max(0, component.renderCount - 1),
      recentRenders: component.renderTimes.filter((time) => now - time < 3_000).length,
      lastRenderAt: component.lastRenderAt,
    }));
    const apiCalls: RoutogramRuntimeApiCall[] = network.snapshot();

    return {
      sessionId,
      route: currentRoute,
      startedAt,
      updatedAt: Date.now(),
      components,
      apiCalls,
    };
  };

  const flush = (): void => {
    if (stopped) {
      return;
    }
    transport.send({ type: "runtime:snapshot", payload: snapshot() });
  };

  function scheduleFlush(): void {
    if (flushTimer || stopped) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 150);
  }

  const handleRouteChange = (): void => {
    const next = route();
    if (next !== currentRoute) {
      currentRoute = next;
      flush();
    }
  };

  window.history.pushState = function patchedPushState(...args) {
    const result = originalPushState.apply(this, args);
    handleRouteChange();
    return result;
  };
  window.history.replaceState = function patchedReplaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    handleRouteChange();
    return result;
  };
  window.addEventListener("popstate", handleRouteChange);

  const intervalMs = Math.max(options.flushIntervalMs ?? 1_000, 250);
  interval = setInterval(flush, intervalMs);
  flush();

  return {
    flush,
    getSnapshot: snapshot,
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
      }
      if (interval) {
        clearInterval(interval);
      }
      window.removeEventListener("popstate", handleRouteChange);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
      network.stop();
      fiber.stop();
      transport.close();
    },
  };
}

function createNoopHandle(): RoutogramRuntimeHandle {
  return {
    flush: () => {},
    getSnapshot: () => ({
      sessionId: "disabled",
      route: "/",
      startedAt: 0,
      updatedAt: 0,
      components: [],
      apiCalls: [],
    }),
    stop: () => {},
  };
}

export type { NetworkRecord };
