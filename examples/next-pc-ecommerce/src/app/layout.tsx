import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PC Forge — Custom PCs and components",
    template: "%s | PC Forge",
  },
  description:
    "Custom PCs, tested configurations, and components for people who care about the details.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
