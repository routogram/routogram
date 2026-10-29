import { Suspense, useState } from "react";

import { AppRouter } from "@/app/router";
import type { AppTab } from "@/layouts/app-shell";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("routing");
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <Suspense
      fallback={
        <div className="grid h-full place-items-center bg-[#09090b] text-xs text-zinc-500">
          Loading architecture console…
        </div>
      }
    >
      <AppRouter
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isChatOpen={isChatOpen}
        onChatOpen={() => setIsChatOpen(true)}
        onChatClose={() => setIsChatOpen(false)}
      />
    </Suspense>
  );
}
