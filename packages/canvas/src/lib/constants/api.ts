export const API = {
  topology: "/api/topology",
  config: "/api/config",
  codeHealth: "/api/health/code",
  ideOpen: "/api/ide/open",
  aiAudit: "/api/ai/audit",
  aiQuery: "/api/ai/query",
  aiChat: "/api/ai/chat",
  aiProviders: "/api/config/ai",
  timeline: "/api/git/timeline",
  runtime: "/api/runtime",
  refactor: "/api/refactor/apply",
  annotations: "/api/annotations",
  simulationFork: "/api/simulation/fork",
  simulationMutate: "/api/simulation/mutate",
  simulationReset: "/api/simulation/reset",
  simulationSocket: "/ws/simulation",
  migrationScan: "/api/migration/scan",
  driftHeal: "/api/drift/heal",
  agentMissions: "/api/agent/missions",
  agentSocket: "/ws/agent",
  websocket: "/ws",
} as const;

export type ApiEndpoint = (typeof API)[keyof typeof API];

export function daemonBaseUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  return window.__ROUTOGRAM_DAEMON_URL__ ?? "";
}

export function apiUrl(path: string): string {
  return `${daemonBaseUrl()}${path}`;
}

export function daemonWebSocketUrl(path: string): string {
  const base = daemonBaseUrl();

  if (base) {
    const url = new URL(base);
    return `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}${path}`;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}${path}`;
}
