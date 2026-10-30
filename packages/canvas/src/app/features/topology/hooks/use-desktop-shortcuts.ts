import { useEffect } from "react";

import { isDesktopEnvironment } from "@/lib/desktop/desktop-bridge";

export type DesktopShortcutsOptions = {
  onOpenFolder: () => void;
  onRescanWorkspace: () => void;
};

export function useDesktopShortcuts({
  onOpenFolder,
  onRescanWorkspace,
}: DesktopShortcutsOptions): void {
  useEffect(() => {
    if (!isDesktopEnvironment()) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (!isMod) return;

      const key = event.key.toLowerCase();
      if (key === "o") {
        event.preventDefault();
        onOpenFolder();
        return;
      }

      if (key === "r" && event.shiftKey) {
        event.preventDefault();
        onRescanWorkspace();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenFolder, onRescanWorkspace]);
}
