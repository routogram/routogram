import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function configureProxy(proxy: {
  on: (event: "error", listener: (error: NodeJS.ErrnoException) => void) => void;
}): void {
  proxy.on("error", (error) => {
    if (error.code === "EPIPE" || error.code === "ECONNRESET") {
      return;
    }
    console.error("[vite proxy error]", error);
  });
}

const daemonPort = process.env.ROUTOGRAM_PORT ?? "4040";
const daemonTarget = `http://127.0.0.1:${daemonPort}`;
const daemonWebSocketTarget = `ws://127.0.0.1:${daemonPort}`;

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  build:
    mode === "static"
      ? {
          rollupOptions: {
            output: {
              codeSplitting: false,
            },
          },
        }
      : undefined,
  server: {
    host: "127.0.0.1",
    port: 6060,
    strictPort: true,
    proxy: {
      "/api": {
        target: daemonTarget,
        changeOrigin: true,
        configure: configureProxy,
      },
      "/ws": {
        target: daemonWebSocketTarget,
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
        configure: configureProxy,
      },
    },
  },
}));
