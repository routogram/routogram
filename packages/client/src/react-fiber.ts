import type { ComponentRecord } from "./types.js";

type DebugSource = {
  fileName?: string;
};

type Fiber = {
  type?: unknown;
  child?: Fiber | null;
  sibling?: Fiber | null;
  _debugSource?: DebugSource;
  _debugInfo?: DebugSource | DebugSource[];
};

type ReactDevToolsHook = {
  isDisabled?: boolean;
  supportsFiber?: boolean;
  renderers?: Map<unknown, unknown>;
  inject?: (...args: unknown[]) => unknown;
  onCommitFiberRoot?: (...args: unknown[]) => unknown;
  onCommitFiberUnmount?: (...args: unknown[]) => unknown;
  onScheduleFiberRoot?: (...args: unknown[]) => unknown;
  __routogramWrapped?: boolean;
};

type FiberTracker = {
  install: () => void;
  snapshot: () => ComponentRecord[];
  stop: () => void;
};

const GLOBAL_HOOK = "__REACT_DEVTOOLS_GLOBAL_HOOK__";

export function createFiberTracker(): FiberTracker {
  const components = new Map<string, ComponentRecord>();
  const originalHooks = new Map<string, unknown>();
  let stopped = false;

  const install = (): void => {
    if (typeof window === "undefined") {
      return;
    }

    const existing = (window as unknown as Record<string, unknown>)[GLOBAL_HOOK] as
      | ReactDevToolsHook
      | undefined;
    const hook = existing ?? installMinimalHook();

    if (hook.__routogramWrapped) {
      return;
    }

    hook.__routogramWrapped = true;
    originalHooks.set("onCommitFiberRoot", hook.onCommitFiberRoot);
    const original = hook.onCommitFiberRoot;

    hook.onCommitFiberRoot = (...args: unknown[]) => {
      const result = original?.apply(hook, args);
      if (!stopped) {
        recordCommit(args[1]);
      }
      return result;
    };
  };

  const recordCommit = (root: unknown): void => {
    if (!isFiberRoot(root)) {
      return;
    }

    const now = Date.now();
    const seen = new Set<Fiber>();
    const stack: Fiber[] = [root.current];

    while (stack.length > 0 && seen.size < 20_000) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) {
        continue;
      }
      seen.add(fiber);

      const name = componentName(fiber.type);
      if (name) {
        const file = sourceFile(fiber);
        const key = `${file ?? ""}:${name}`;
        const current = components.get(key) ?? {
          key,
          name,
          file,
          renderCount: 0,
          lastRenderAt: 0,
          renderTimes: [],
        };

        current.renderCount += 1;
        current.lastRenderAt = now;
        current.renderTimes.push(now);
        current.renderTimes = current.renderTimes.filter((time) => now - time < 10_000);
        components.set(key, current);
      }

      if (fiber.sibling) {
        stack.push(fiber.sibling);
      }
      if (fiber.child) {
        stack.push(fiber.child);
      }
    }
  };

  const snapshot = (): ComponentRecord[] => {
    const now = Date.now();
    return Array.from(components.values())
      .map((component) => {
        const renderTimes = component.renderTimes.filter((time) => now - time < 3_000);
        return { ...component, renderTimes };
      })
      .sort((left, right) => right.renderTimes.length - left.renderTimes.length);
  };

  return {
    install,
    snapshot,
    stop() {
      stopped = true;
      const hook = (window as unknown as Record<string, unknown>)[GLOBAL_HOOK] as
        | ReactDevToolsHook
        | undefined;
      if (hook) {
        const original = originalHooks.get("onCommitFiberRoot");
        if (typeof original === "function") {
          hook.onCommitFiberRoot = original as (...args: unknown[]) => unknown;
        }
      }
    },
  };
}

function installMinimalHook(): ReactDevToolsHook {
  const hook: ReactDevToolsHook = {
    isDisabled: false,
    supportsFiber: true,
    renderers: new Map(),
    inject(...args: unknown[]) {
      const id = args[0];
      const renderer = args[1];
      hook.renderers?.set(id, renderer);
      return id;
    },
    onCommitFiberRoot() {},
    onCommitFiberUnmount() {},
    onScheduleFiberRoot() {},
  };

  Object.defineProperty(window, GLOBAL_HOOK, {
    configurable: true,
    enumerable: false,
    writable: true,
    value: hook,
  });

  return hook;
}

function componentName(type: unknown): string | null {
  if (typeof type === "function") {
    const name =
      (type as { displayName?: string; name?: string }).displayName ??
      (type as { name?: string }).name;
    return name && name !== "Anonymous" ? name : null;
  }

  if (type && typeof type === "object") {
    const record = type as {
      displayName?: string;
      type?: unknown;
      render?: { displayName?: string; name?: string };
    };
    if (typeof record.displayName === "string") {
      return record.displayName;
    }
    if (typeof record.render?.displayName === "string") {
      return record.render.displayName;
    }
    if (typeof record.render?.name === "string") {
      return record.render.name;
    }
    return componentName(record.type);
  }

  return null;
}

function sourceFile(fiber: Fiber): string | undefined {
  if (typeof fiber._debugSource?.fileName === "string") {
    return fiber._debugSource.fileName;
  }

  const debugInfo = Array.isArray(fiber._debugInfo) ? fiber._debugInfo[0] : fiber._debugInfo;
  return typeof debugInfo?.fileName === "string" ? debugInfo.fileName : undefined;
}

function isFiberRoot(value: unknown): value is { current: Fiber } {
  return (
    typeof value === "object" &&
    value !== null &&
    "current" in value &&
    typeof (value as { current?: unknown }).current === "object"
  );
}
