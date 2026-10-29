import type { ReactNode } from "react";

import { EntryLayout } from "@/layouts/entry-layout";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <EntryLayout>{children}</EntryLayout>;
}
