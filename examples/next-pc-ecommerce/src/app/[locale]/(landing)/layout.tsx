import type { ReactNode } from "react";

export default function CampaignLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#0a0705]">{children}</div>;
}
