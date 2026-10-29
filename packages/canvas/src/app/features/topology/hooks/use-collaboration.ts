import { useEffect, useRef, useState } from "react";

import { daemonWebSocketUrl } from "@/lib/constants";

export type CollabCursor = { x: number; y: number };
export type CollabViewport = { x: number; y: number; zoom: number };

export type CollabPeer = {
  id: string;
  name: string;
  color: string;
  cursor: CollabCursor | null;
  presenter: boolean;
};

type CollabMessage =
  | { type: "collab:welcome"; selfId: string; peers: CollabPeer[]; presenterId: string | null }
  | { type: "collab:peers"; peers: CollabPeer[]; presenterId: string | null }
  | { type: "collab:cursor"; peer: CollabPeer }
  | { type: "collab:presenter"; presenterId: string | null }
  | { type: "collab:viewport"; peerId: string; viewport: CollabViewport };

const COLORS = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb7185"];

export function useCollaboration(enabled: boolean) {
  const [selfId, setSelfId] = useState<string | null>(null);
  const [peers, setPeers] = useState<CollabPeer[]>([]);
  const [presenterId, setPresenterId] = useState<string | null>(null);
  const [remoteViewport, setRemoteViewport] = useState<CollabViewport | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const selfIdRef = useRef<string | null>(null);
  const presenterRef = useRef<string | null>(null);
  const cursorSentRef = useRef(0);
  const viewportSentRef = useRef(0);
  const identityRef = useRef({
    name: `Guest-${Math.floor(1000 + Math.random() * 9000)}`,
    color: COLORS[Math.floor(Math.random() * COLORS.length)] ?? "#38bdf8",
  });

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (cancelled) {
        return;
      }
      const socket = new WebSocket(daemonWebSocketUrl("/ws/collab"));
      socketRef.current = socket;

      socket.addEventListener("open", () => {
        setConnected(true);
        socket.send(JSON.stringify({ type: "join", ...identityRef.current }));
      });

      socket.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(String(event.data)) as CollabMessage;
          if (message.type === "collab:welcome") {
            selfIdRef.current = message.selfId;
            setSelfId(message.selfId);
            setPeers(message.peers.filter((peer) => peer.id !== message.selfId));
            presenterRef.current = message.presenterId;
            setPresenterId(message.presenterId);
            socket.send(JSON.stringify({ type: "join", ...identityRef.current }));
          } else if (message.type === "collab:peers") {
            const id = selfIdRef.current;
            setPeers(message.peers.filter((peer) => peer.id !== id));
            presenterRef.current = message.presenterId;
            setPresenterId(message.presenterId);
          } else if (message.type === "collab:cursor") {
            setPeers((current) =>
              current.map((peer) => (peer.id === message.peer.id ? message.peer : peer)),
            );
          } else if (message.type === "collab:presenter") {
            presenterRef.current = message.presenterId;
            setPresenterId(message.presenterId);
            setPeers((current) =>
              current.map((peer) => ({
                ...peer,
                presenter: peer.id === message.presenterId,
              })),
            );
          } else if (message.type === "collab:viewport") {
            if (message.peerId !== selfIdRef.current) {
              setRemoteViewport(message.viewport);
            }
          }
        } catch {
          // Ignore malformed collaboration frames.
        }
      });

      socket.addEventListener("close", () => {
        setConnected(false);
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, 2_000);
        }
      });

      socket.addEventListener("error", () => socket.close());
    };

    connect();

    const handlePointerMove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - cursorSentRef.current < 45) {
        return;
      }
      cursorSentRef.current = now;
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) {
        return;
      }
      socket.send(
        JSON.stringify({
          type: "cursor",
          x: event.clientX / Math.max(window.innerWidth, 1),
          y: event.clientY / Math.max(window.innerHeight, 1),
        }),
      );
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      cancelled = true;
      window.removeEventListener("pointermove", handlePointerMove);
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled]);

  const togglePresenter = () => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    const enabledNow = presenterRef.current !== selfIdRef.current;
    socket.send(JSON.stringify({ type: "presenter", enabled: enabledNow }));
  };

  const sendViewport = (viewport: CollabViewport) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN || presenterRef.current !== selfIdRef.current) {
      return;
    }
    const now = performance.now();
    if (now - viewportSentRef.current < 80) {
      return;
    }
    viewportSentRef.current = now;
    socket.send(JSON.stringify({ type: "viewport", ...viewport }));
  };

  return {
    selfId,
    peers,
    presenterId,
    remoteViewport,
    connected,
    isPresenter: presenterId !== null && presenterId === selfId,
    togglePresenter,
    sendViewport,
  };
}
