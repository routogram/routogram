import { lazy } from "react";

import type { AppTab } from "@/layouts/app-shell";

const TopologyShell = lazy(() => import("@/app/features/topology/shell"));

export type AppRouterProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  isChatOpen: boolean;
  onChatOpen: () => void;
  onChatClose: () => void;
};

export function AppRouter({
  activeTab,
  onTabChange,
  isChatOpen,
  onChatOpen,
  onChatClose,
}: AppRouterProps) {
  return (
    <TopologyShell
      activeTab={activeTab}
      onTabChange={onTabChange}
      isChatOpen={isChatOpen}
      onChatOpen={onChatOpen}
      onChatClose={onChatClose}
    />
  );
}
