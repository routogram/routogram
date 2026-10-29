import {
  Boxes,
  ChevronRight,
  LayoutDashboard,
  PackageSearch,
  Settings,
  ShoppingCart,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { UserMenu } from "@/components/user-menu";
import { Link } from "@/i18n/navigation";
import { CONSTANTS } from "@/lib/constants";
import { userProfile } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export type ConsoleLayoutProps = {
  children: ReactNode;
};

const NAV_ITEMS = [
  { href: CONSTANTS.ROUTES.console, label: "overview", icon: LayoutDashboard },
  { href: CONSTANTS.ROUTES.consoleProducts, label: "products", icon: Boxes },
  { href: CONSTANTS.ROUTES.console, label: "orders", icon: ShoppingCart },
  { href: CONSTANTS.ROUTES.console, label: "customers", icon: UsersRound },
  { href: CONSTANTS.ROUTES.console, label: "settings", icon: Settings },
] as const;

export async function ConsoleLayout({ children }: ConsoleLayoutProps) {
  const t = await getTranslations("console");
  const nav = await getTranslations("console.nav");

  return (
    <div className="flex min-h-screen bg-(--background)">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-(--border) bg-(--surface)/70 p-4 lg:flex">
        <Link href="/" className="flex items-center gap-2.5 px-2 py-2">
          <span className="grid size-8 place-items-center rounded-lg border border-sky-400/25 bg-sky-400/10 text-xs font-bold text-sky-300">
            PF
          </span>
          <span className="text-sm font-semibold text-slate-100">PC Forge</span>
        </Link>

        <div className="mt-8 px-2 text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">
          {t("title")}
        </div>
        <nav className="mt-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white",
                item.label === "overview" &&
                  "border border-sky-400/15 bg-sky-400/[0.07] text-sky-200",
              )}
            >
              <item.icon className="size-4" />
              {nav(item.label)}
              <ChevronRight className="ml-auto size-3 opacity-30" />
            </Link>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-white/5 bg-black/20 p-3">
          <p className="text-[10px] font-medium text-slate-300">Demo workspace</p>
          <p className="mt-1 text-[10px] leading-4 text-slate-600">
            GraphQL mock data. No database required.
          </p>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-(--border) bg-(--background)/85 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <PackageSearch className="size-4 text-sky-300" />
            <span>PC Forge</span>
            <span className="text-slate-700">/</span>
            <span className="text-slate-300">{t("title")}</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden rounded-full border border-(--border) px-3 py-1.5 text-[10px] text-slate-400 transition hover:bg-white/5 hover:text-white sm:block"
            >
              View storefront
            </Link>
            <UserMenu user={userProfile} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
