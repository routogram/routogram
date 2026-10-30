import {
  applyTopologyPatch,
  type DiagnosticsUpdatedPayload,
  isRoutogramRuntimeSnapshot,
  isRoutogramTopology,
  type RoutogramDriftFinding,
  type RoutogramRuntimeSnapshot,
  type RoutogramServerEvent,
  type RoutogramTopology,
} from "@routogram/types";
import { useEffect, useRef, useState } from "react";

import { cacheDiagnostics, fetchTopology } from "@/lib/apis";
import { API, daemonWebSocketUrl } from "@/lib/constants";
import type { ConnectionStatus, FocusRequest } from "../types/topology";

export function useTopology(workspaceId: string | null = null) {
  const embedded =
    typeof window.__ROUTOGRAM_DATA__ !== "undefined" &&
    isRoutogramTopology(window.__ROUTOGRAM_DATA__)
      ? window.__ROUTOGRAM_DATA__
      : undefined;
  const isStatic = embedded !== undefined;
  const [topology, setTopology] = useState<RoutogramTopology | null>(embedded ?? null);
  const [status, setStatus] = useState<ConnectionStatus>(isStatic ? "static" : "connecting");
  const focusNonceRef = useRef(0);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<RoutogramRuntimeSnapshot | null>(null);
  const [driftFindings, setDriftFindings] = useState<RoutogramDriftFinding[]>([]);
  const [codeHealth, setCodeHealth] = useState<DiagnosticsUpdatedPayload["nodes"] | null>(null);

  useEffect(() => {
    if (isStatic) {
      return;
    }
    if (!workspaceId) {
      setTopology(null);
      setStatus("empty");
      return;
    }
    setRuntimeSnapshot(null);
    setDriftFindings([]);
    setCodeHealth(null);

    let cancelled = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const applyTopology = (next: RoutogramTopology) => {
      if (cancelled) {
        return;
      }

      setTopology(next);
      setStatus("online");
    };

    async function refresh(): Promise<void> {
      try {
        applyTopology(await fetchTopology());
      } catch {
        if (!cancelled) {
          setStatus("offline");
        }
      }
    }

    // Snapshots and invalidations keep the canvas aligned with the CLI daemon.
    // Snapshot và invalidation giữ canvas đồng bộ với daemon CLI.
    function connect(): void {
      if (cancelled) {
        return;
      }

      socket = new WebSocket(daemonWebSocketUrl(API.websocket));

      socket.addEventListener("open", () => {
        void refresh();
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as RoutogramServerEvent;
          if (message.workspaceId && message.workspaceId !== workspaceId) {
            return;
          }

          if (message.type === "topology:snapshot") {
            applyTopology(message.topology);
          } else if (message.type === "PATCH_TOPOLOGY") {
            setTopology((current) =>
              current ? applyTopologyPatch(current, message.payload) : current,
            );
            setStatus("online");
          } else if (message.type === "RUNTIME_UPDATE") {
            if (isRoutogramRuntimeSnapshot(message.payload)) {
              setRuntimeSnapshot(message.payload);
              setStatus("online");
            }
          } else if (message.type === "FOCUS_NODE") {
            focusNonceRef.current += 1;
            setFocusRequest({
              nodeIds: message.payload.nodeIds,
              nonce: focusNonceRef.current,
            });
            setStatus("online");
          } else if (message.type === "diagnostics_updated") {
            setCodeHealth((current) => ({ ...(current ?? {}), ...message.nodes }));
            cacheDiagnostics(message.nodes);
            window.dispatchEvent(
              new CustomEvent("routogram:diagnostics-updated", { detail: message }),
            );
          } else if (message.type === "CRITICAL_DRIFT_DETECTED") {
            setDriftFindings(message.payload.findings);
          } else if (message.type === "topology:invalidate") {
            void refresh();
          }
        } catch (error) {
          console.warn("[routogram] Ignoring malformed WebSocket event", error);
        }
      });

      socket.addEventListener("close", () => {
        if (cancelled) {
          return;
        }

        setStatus("offline");
        reconnectTimer = setTimeout(connect, 2_000);
      });

      socket.addEventListener("error", () => {
        socket?.close();
      });
    }

    const handleRefactorApplied = () => {
      void refresh();
    };
    window.addEventListener("routogram:refactor-applied", handleRefactorApplied);

    void refresh();
    connect();

    return () => {
      cancelled = true;
      socket?.close();
      window.removeEventListener("routogram:refactor-applied", handleRefactorApplied);

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
    };
  }, [isStatic, workspaceId]);

  return {
    topology,
    status,
    isStatic,
    focusRequest,
    runtimeSnapshot,
    driftFindings,
    codeHealth,
    clearDrift: () => setDriftFindings([]),
  };
}
