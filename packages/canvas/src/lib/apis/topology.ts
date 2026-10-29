import {
  isRoutogramTimeline,
  isRoutogramTopology,
  type RoutogramTimeline,
  type RoutogramTopology,
} from "@routogram/types";

import { API, apiUrl } from "@/lib/constants";

// Daemon topology is validated before it reaches feature state.
// Topology từ daemon được validate trước khi vào state của feature.
export async function fetchTopology(): Promise<RoutogramTopology> {
  const response = await fetch(apiUrl(API.topology));

  if (!response.ok) {
    throw new Error(`Topology request failed with ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!isRoutogramTopology(payload)) {
    throw new Error("Daemon returned an invalid topology payload");
  }

  return payload;
}

export async function fetchTimeline(limit = 12, revision = 0): Promise<RoutogramTimeline> {
  const response = await fetch(`${apiUrl(API.timeline)}?limit=${limit}&revision=${revision}`);

  if (!response.ok) {
    throw new Error(`Timeline request failed with ${response.status}`);
  }

  const payload: unknown = await response.json();

  if (!isRoutogramTimeline(payload)) {
    throw new Error("Daemon returned an invalid git timeline.");
  }

  return payload;
}
