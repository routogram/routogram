import type { RuntimeTransport } from "./types.js";

type TransportOptions = {
  daemonUrl: string;
};

export function createTransport({ daemonUrl }: TransportOptions): RuntimeTransport {
  if (typeof WebSocket === "undefined") {
    return { send: () => {}, close: () => {} };
  }

  const endpoint = `${daemonUrl.replace(/^http/, "ws").replace(/\/$/, "")}/ws/runtime`;
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let queued: unknown = null;

  const connect = (): void => {
    if (closed) {
      return;
    }

    socket = new WebSocket(endpoint);
    socket.addEventListener("open", () => {
      if (queued !== null) {
        socket?.send(JSON.stringify(queued));
        queued = null;
      }
    });
    socket.addEventListener("close", () => {
      if (closed) {
        return;
      }
      reconnectTimer = setTimeout(connect, 2_000);
    });
    socket.addEventListener("error", () => {
      socket?.close();
    });
  };

  connect();

  return {
    send(payload) {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
      } else {
        queued = payload;
      }
    },
    close() {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      socket?.close();
    },
  };
}
