export type ComponentRecord = {
  key: string;
  name: string;
  file?: string;
  renderCount: number;
  lastRenderAt: number;
  renderTimes: number[];
};

export type NetworkRecord = {
  url: string;
  method: string;
  status?: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  at: number;
};

export type RuntimeTransport = {
  send: (payload: unknown) => void;
  close: () => void;
};
