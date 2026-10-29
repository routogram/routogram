import { Search, ShoppingBag } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { CartIndicator } from "@/app/[locale]/_shared/cart-indicator/client";
import { LocaleSwitcher } from "@/app/[locale]/_shared/locale-switcher/server";
import { Input } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { CONSTANTS } from "@/lib/constants";

export async function SiteHeader() {
  const [t, common, locale] = await Promise.all([
    getTranslations("site"),
    getTranslations("common"),
    getLocale(),
  ]);

  return (
    <header className="sticky top-0 z-40 border-b border-(--border) bg-(--background)/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sm font-bold text-sky-300">
            PF
          </span>
          <span className="hidden text-sm font-semibold tracking-tight text-slate-100 sm:block">
            {common("brand")}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          <Link
            href={CONSTANTS.ROUTES.home}
            className="rounded-lg px-3 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            {t("nav.builds")}
          </Link>
          <Link
            href="/products"
            className="rounded-lg px-3 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            {t("nav.components")}
          </Link>
          <Link
            href={CONSTANTS.ROUTES.blackFriday}
            className="rounded-lg px-3 py-2 text-xs text-amber-300/80 transition hover:bg-amber-400/10 hover:text-amber-200"
          >
            {t("nav.deals")}
          </Link>
        </nav>

        <form
          action={`/${locale}/products`}
          className="relative ml-auto hidden max-w-xs flex-1 md:block"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
          <Input
            name="q"
            placeholder={t("searchPlaceholder")}
            className="h-9 rounded-full bg-black/25 pl-9 text-xs"
          />
        </form>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <LocaleSwitcher />
          <CartIndicator />
          <Link
            href={CONSTANTS.ROUTES.console}
            className="hidden items-center gap-2 rounded-full border border-(--border) px-3 py-1.5 text-[10px] text-slate-400 transition hover:bg-white/5 hover:text-white sm:flex"
          >
            <ShoppingBag className="size-3" />
            Console
          </Link>
        </div>
      </div>
    </header>
  );
}
