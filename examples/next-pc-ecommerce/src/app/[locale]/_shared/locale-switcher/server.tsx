import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { LocaleSwitcherTemplate } from "./template";

const LABELS: Record<string, string> = {
  en: "EN",
  vi: "VI",
};

export async function LocaleSwitcher() {
  const current = await getLocale();

  return (
    <LocaleSwitcherTemplate>
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href="/"
          locale={locale}
          className={cn(
            "rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition",
            locale === current
              ? "bg-sky-400/15 text-sky-200"
              : "text-slate-500 hover:text-slate-200",
          )}
        >
          {LABELS[locale] ?? locale}
        </Link>
      ))}
    </LocaleSwitcherTemplate>
  );
}
