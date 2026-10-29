import { API, apiUrl } from "@/lib/constants";

export type AgentPhase =
  | "planning"
  | "querying"
  | "simulating"
  | "previewing"
  | "awaiting-approval"
  | "patching"
  | "validating"
  | "complete"
  | "rejected"
  | "error";

export type AgentEvent = {
  type: "agent:event";
  missionId: string;
  phase: AgentPhase;
  message: string;
  at: string;
  tool?: string;
  data?: unknown;
};

export type AgentMission = {
  id: string;
  goal: string;
  targetNodeId?: string;
  status: AgentPhase;
  createdAt: string;
  events: AgentEvent[];
  pending: {
    title: string;
    diff: string;
    files: string[];
    warnings: string[];
  } | null;
};

export async function fetchMissions(): Promise<AgentMission[]> {
  const response = await fetch(apiUrl(API.agentMissions));
  if (!response.ok) {
    return [];
  }
  const payload: unknown = await response.json();
  return isMissions(payload) ? payload.missions : [];
}

export async function startMission(goal: string, targetNodeId?: string): Promise<AgentMission> {
  return request(API.agentMissions, "POST", {
    goal,
    ...(targetNodeId ? { targetNodeId } : {}),
  });
}

export async function approveMission(id: string): Promise<AgentMission> {
  return request(`${API.agentMissions}/${encodeURIComponent(id)}/approve`, "POST", {});
}

export async function rejectMission(id: string): Promise<AgentMission> {
  return request(`${API.agentMissions}/${encodeURIComponent(id)}/reject`, "POST", {});
}

async function request(endpoint: string, method: string, body: unknown): Promise<AgentMission> {
  const response = await fetch(apiUrl(endpoint), {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Agent request failed with ${response.status}`,
    );
  }
  if (!isMission(payload)) {
    throw new Error("The daemon returned an invalid agent mission.");
  }
  return payload;
}

function isMissions(value: unknown): value is { missions: AgentMission[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { missions?: unknown }).missions)
  );
}

function isMission(value: unknown): value is AgentMission {
  return (
    typeof value === "object" && value !== null && typeof (value as AgentMission).id === "string"
  );
}
