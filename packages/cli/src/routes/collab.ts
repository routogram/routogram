import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocket, WebSocketServer } from "ws";

type Cursor = { x: number; y: number };
type Viewport = { x: number; y: number; zoom: number };

type Peer = {
  id: string;
  name: string;
  color: string;
  cursor: Cursor | null;
  viewport: Viewport | null;
  presenter: boolean;
};

type JoinMessage = {
  type: "join";
  name?: unknown;
  color?: unknown;
};

type CursorMessage = {
  type: "cursor";
  x?: unknown;
  y?: unknown;
};

type ViewportMessage = {
  type: "viewport";
  x?: unknown;
  y?: unknown;
  zoom?: unknown;
};

type PresenterMessage = {
  type: "presenter";
  enabled?: unknown;
};

type CollabMessage = JoinMessage | CursorMessage | ViewportMessage | PresenterMessage;

export type CollabServer = {
  wss: WebSocketServer;
  upgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  close: () => void;
};

const COLORS = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb7185"];

export function createCollabServer(): CollabServer {
  const wss = new WebSocketServer({ noServer: true });
  const peers = new Map<WebSocket, Peer>();
  let presenterId: string | null = null;

  function broadcast(message: unknown, except?: WebSocket): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client !== except && client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  function peerList(): Peer[] {
    return [...peers.values()];
  }

  function broadcastPeers(): void {
    broadcast({ type: "collab:peers", peers: peerList(), presenterId });
  }

  wss.on("connection", (socket) => {
    const peer: Peer = {
      id: `peer_${randomUUID().slice(0, 8)}`,
      name: `Guest-${randomUUID().slice(0, 4)}`,
      color: COLORS[peers.size % COLORS.length] ?? "#38bdf8",
      cursor: null,
      viewport: null,
      presenter: false,
    };
    peers.set(socket, peer);

    socket.send(
      JSON.stringify({
        type: "collab:welcome",
        selfId: peer.id,
        peers: peerList(),
        presenterId,
      }),
    );
    broadcastPeers();

    socket.on("message", (raw) => {
      let message: CollabMessage;
      try {
        const parsed: unknown = JSON.parse(raw.toString());
        if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
          return;
        }
        message = parsed as CollabMessage;
      } catch {
        return;
      }

      if (message.type === "join") {
        if (typeof message.name === "string" && message.name.trim()) {
          peer.name = message.name.trim().slice(0, 32);
        }
        if (typeof message.color === "string" && /^#[0-9a-f]{6}$/i.test(message.color)) {
          peer.color = message.color;
        }
        broadcastPeers();
        return;
      }

      if (message.type === "cursor" && isCursor(message)) {
        peer.cursor = { x: clamp01(message.x), y: clamp01(message.y) };
        broadcast({ type: "collab:cursor", peer: { ...peer } }, socket);
        return;
      }

      if (message.type === "viewport" && isViewport(message)) {
        peer.viewport = { x: message.x, y: message.y, zoom: message.zoom };
        if (peer.presenter) {
          presenterId = peer.id;
          broadcast({ type: "collab:viewport", peerId: peer.id, viewport: peer.viewport }, socket);
        }
        return;
      }

      if (message.type === "presenter") {
        const enabled = message.enabled === true;

        if (enabled) {
          presenterId = peer.id;
          for (const other of peers.values()) {
            other.presenter = other === peer;
          }
        } else if (peer.presenter) {
          presenterId = null;
          peer.presenter = false;
        }

        broadcast({ type: "collab:presenter", presenterId });
        broadcastPeers();
      }
    });

    socket.on("close", () => {
      peers.delete(socket);
      if (presenterId === peer.id) {
        presenterId = null;
      }
      broadcast({ type: "collab:presenter", presenterId });
      broadcastPeers();
    });

    socket.on("error", () => {
      peers.delete(socket);
    });
  });

  return {
    wss,
    upgrade(request, socket, head) {
      wss.handleUpgrade(request, socket, head, (client) => {
        wss.emit("connection", client, request);
      });
    },
    close() {
      for (const client of wss.clients) {
        client.terminate();
      }
      wss.close();
    },
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function isCursor(message: CursorMessage): message is CursorMessage & { x: number; y: number } {
  return typeof message.x === "number" && typeof message.y === "number";
}

function isViewport(
  message: ViewportMessage,
): message is ViewportMessage & { x: number; y: number; zoom: number } {
  return (
    typeof message.x === "number" &&
    typeof message.y === "number" &&
    typeof message.zoom === "number"
  );
}
