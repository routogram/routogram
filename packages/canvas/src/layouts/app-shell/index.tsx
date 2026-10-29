import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";

export type AppTab = "overview" | "routing";

export type AppShellProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
  projectName: string;
  statusLabel: string;
  statusDot: string;
  version: string;
  topbar: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
};

export function AppShell({
  activeTab,
  onTabChange,
  projectName,
  statusLabel,
  statusDot,
  version,
  topbar,
  rightSidebar,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0c0c0e] font-sans text-[#fafafa] antialiased">
      <Sidebar
        activeTab={activeTab}
        onTabChange={onTabChange}
        projectName={projectName}
        statusLabel={statusLabel}
        statusDot={statusDot}
        version={version}
      />
      <main className="flex min-w-0 flex-1 overflow-hidden p-3">
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          {topbar}
          <section className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e] shadow-2xl shadow-black/40">
            {children}
          </section>
        </div>
        {rightSidebar}
      </main>
    </div>
  );
}
