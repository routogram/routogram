import { API, apiUrl } from "@/lib/constants";

export async function healDrift(files: string[]): Promise<void> {
  const response = await fetch(apiUrl(API.driftHeal), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "revert", files }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" &&
        payload !== null &&
        typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Drift heal failed with ${response.status}`,
    );
  }
}
