# @routogram/client

Development-only runtime bridge for Routogram. It installs a React Fiber commit
observer, fetch/XHR payload metrics, and a WebSocket transport to
`ws://127.0.0.1:4040/ws/runtime`.

```ts
import { initRoutogramRuntime } from "@routogram/client";

if (import.meta.env.DEV) {
  initRoutogramRuntime({ daemonUrl: "http://127.0.0.1:4040" });
}
```

Call this before `createRoot` so the DevTools hook is visible to React. Do not
import it in production bundles.
