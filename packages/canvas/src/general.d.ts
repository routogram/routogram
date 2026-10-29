/// <reference types="vite/client" />

import type { RoutogramTopology } from "@routogram/types";

declare global {
  interface Window {
    __ROUTOGRAM_DATA__?: RoutogramTopology;
    __ROUTOGRAM_DAEMON_URL__?: string;
  }
}

declare module "elkjs/lib/elk-worker.min.js";

export {};
