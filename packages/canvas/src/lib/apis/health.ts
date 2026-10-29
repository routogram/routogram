import type { NodeHealthData } from "@routogram/plugin-core";
import { API, apiUrl } from "@/lib/constants";

export type CodeHealthReport = {
  generatedAt: string;
  nodes: Record<string, NodeHealthData>;
};

export async function fetchCodeHealth(): Promise<CodeHealthReport> {
  const response = await fetch(apiUrl(API.codeHealth), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Code health unavailable (HTTP ${response.status}).`);
  }
  return (await response.json()) as CodeHealthReport;
}
