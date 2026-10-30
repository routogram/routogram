export type DesktopRuntimeInfo = {
  isDesktop: boolean;
  daemonUrl: string;
  platform: string;
};

type TauriGlobal = {
  core?: {
    invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
};

function getTauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as { __TAURI__?: TauriGlobal };
  return win.__TAURI__ ?? null;
}

export function isDesktopEnvironment(): boolean {
  return getTauri() !== null;
}

let cachedRuntimeInfo: DesktopRuntimeInfo | null = null;
let runtimeInfoRequest: Promise<DesktopRuntimeInfo | null> | null = null;

export async function getDesktopRuntimeInfo(): Promise<DesktopRuntimeInfo | null> {
  if (!isDesktopEnvironment()) return null;
  if (cachedRuntimeInfo) return cachedRuntimeInfo;
  if (runtimeInfoRequest) return runtimeInfoRequest;

  runtimeInfoRequest = (async () => {
    const tauri = getTauri();
    if (!tauri?.core?.invoke) return null;
    try {
      const info = await tauri.core.invoke<DesktopRuntimeInfo>("desktop_runtime_info");
      cachedRuntimeInfo = info;
      if (info.daemonUrl) {
        window.__ROUTOGRAM_DAEMON_URL__ = info.daemonUrl;
      }
      return info;
    } catch {
      return null;
    } finally {
      runtimeInfoRequest = null;
    }
  })();

  return runtimeInfoRequest;
}

export async function invokeDesktopRuntimeInfo(): Promise<DesktopRuntimeInfo | null> {
  return getDesktopRuntimeInfo();
}

export async function invokeDesktopPickDirectory(): Promise<string | null> {
  const tauri = getTauri();
  if (!tauri?.core?.invoke) return null;
  try {
    return await tauri.core.invoke<string | null>("desktop_pick_directory");
  } catch {
    return null;
  }
}

export async function restartDesktopDaemon(): Promise<boolean> {
  const tauri = getTauri();
  if (!tauri?.core?.invoke) return false;
  try {
    const restarted = await tauri.core.invoke<boolean>("desktop_restart_daemon");
    if (restarted) {
      cachedRuntimeInfo = null;
      await getDesktopRuntimeInfo();
    }
    return restarted;
  } catch {
    return false;
  }
}

export async function initializeDesktopRuntime(): Promise<void> {
  if (!isDesktopEnvironment()) return;
  await getDesktopRuntimeInfo();
}

if (isDesktopEnvironment()) {
  window.__ROUTOGRAM_DAEMON_URL__ ??= "http://127.0.0.1:4040";
  void initializeDesktopRuntime();
}
