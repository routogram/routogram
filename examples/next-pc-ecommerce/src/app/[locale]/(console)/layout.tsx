import type { ReactNode } from "react";

import { ConsoleLayout } from "@/layouts/console-layout";

export default function ShopConsoleLayout({ children }: { children: ReactNode }) {
  return <ConsoleLayout>{children}</ConsoleLayout>;
}
