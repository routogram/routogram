import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
        target: "http://127.0.0.1:4040",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:4040",
        ws: true,
        changeOrigin: true,
        rewriteWsOrigin: true,
      },
    },
  },
}));
