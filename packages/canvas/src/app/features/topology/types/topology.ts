export type ConnectionStatus = "connecting" | "online" | "offline" | "static";

export type FocusRequest = {
  nodeIds: string[];
  nonce: number;
};
