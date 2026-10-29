import type { NetworkRecord } from "./types.js";

type NetworkTracker = {
  install: () => void;
  snapshot: () => NetworkRecord[];
  stop: () => void;
};

type RequestInitWithBody = RequestInit & {
  body?: BodyInit | null;
};

const MAX_CALLS = 200;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

export function createNetworkTracker(onRecord: (record: NetworkRecord) => void): NetworkTracker {
  const records: NetworkRecord[] = [];
  const recent = new Map<string, number>();
  let installed = false;
  let stopped = false;
  let originalFetch: typeof fetch | null = null;
  let observer: PerformanceObserver | null = null;
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  const record = (entry: NetworkRecord): void => {
    recent.set(entry.url, entry.at);
    records.unshift(entry);
    if (records.length > MAX_CALLS) {
      records.length = MAX_CALLS;
    }
    onRecord(entry);
  };

  const install = (): void => {
    if (installed || typeof window === "undefined") {
      return;
    }
    installed = true;

    const fetchImpl = window.fetch.bind(window);
    originalFetch = fetchImpl;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const start = performance.now();
      const request = input instanceof Request ? input : null;
      const url = request?.url ?? String(input);
      const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
      const requestBytes = requestBytesFor((init as RequestInitWithBody | undefined)?.body);
      const response = await fetchImpl(input, init);
      const durationMs = performance.now() - start;

      void response
        .clone()
        .text()
        .then((text) => {
          const headerSize = Number(response.headers.get("content-length") ?? "0");
          const responseBytes =
            Number.isFinite(headerSize) && headerSize > 0
              ? headerSize
              : Math.min(byteLength(text), MAX_BODY_BYTES);

          record({
            url,
            method,
            status: response.status,
            durationMs,
            requestBytes,
            responseBytes,
            at: Date.now(),
          });
        })
        .catch(() => {
          record({
            url,
            method,
            status: response.status,
            durationMs,
            requestBytes,
            responseBytes: 0,
            at: Date.now(),
          });
        });

      return response;
    };

    XMLHttpRequest.prototype.open = function patchedOpen(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ) {
      const xhr = this as XMLHttpRequest & {
        __routogram?: { method: string; url: string; start: number };
      };
      xhr.__routogram = {
        method: method.toUpperCase(),
        url: String(url),
        start: performance.now(),
      };
      return originalXhrOpen.call(this, method, url, async ?? true, username, password);
    };

    XMLHttpRequest.prototype.send = function patchedSend(
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      const xhr = this as XMLHttpRequest & {
        __routogram?: { method: string; url: string; start: number };
      };
      const requestBytes = requestBytesFor(body);

      if (xhr.__routogram) {
        xhr.addEventListener("loadend", () => {
          const info = xhr.__routogram;
          if (!info) {
            return;
          }
          record({
            url: info.url,
            method: info.method,
            status: xhr.status,
            durationMs: performance.now() - info.start,
            requestBytes,
            responseBytes: byteLength(xhr.responseText ?? ""),
            at: Date.now(),
          });
        });
      }

      return originalXhrSend.call(this, body ?? null);
    };

    if (typeof PerformanceObserver !== "undefined") {
      try {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const resource = entry as PerformanceResourceTiming;
            if (!["fetch", "xmlhttprequest"].includes(resource.initiatorType)) {
              continue;
            }

            const last = recent.get(resource.name);
            if (last && Date.now() - last < 1_000) {
              continue;
            }

            record({
              url: resource.name,
              method: "GET",
              durationMs: resource.duration,
              requestBytes: resource.transferSize ?? 0,
              responseBytes: resource.encodedBodySize ?? 0,
              at: Date.now(),
            });
          }
        });
        observer.observe({ type: "resource", buffered: true });
      } catch {
        // Resource timing can be unavailable in sandboxed browsers.
        // Resource timing có thể không khả dụng trong trình duyệt bị sandbox.
      }
    }
  };

  return {
    install,
    snapshot() {
      return records.map((entry) => ({ ...entry }));
    },
    stop() {
      stopped = true;
      observer?.disconnect();
      if (originalFetch) {
        window.fetch = originalFetch;
      }
      if (!stopped) {
        return;
      }
      XMLHttpRequest.prototype.open = originalXhrOpen;
      XMLHttpRequest.prototype.send = originalXhrSend;
    },
  };
}

function requestBytesFor(body: BodyInit | Document | null | undefined): number {
  if (body === null || body === undefined) {
    return 0;
  }
  if (typeof body === "string") {
    return byteLength(body);
  }
  if (body instanceof URLSearchParams) {
    return byteLength(body.toString());
  }
  if (body instanceof Blob) {
    return body.size;
  }
  return 0;
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
