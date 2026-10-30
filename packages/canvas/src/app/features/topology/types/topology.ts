export type ConnectionStatus = "connecting" | "online" | "offline" | "static" | "empty";

export type FocusRequest = {
  nodeIds: string[];
  nonce: number;
};
