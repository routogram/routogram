"use client";

import { useTransition } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { LocaleSwitcherTemplate } from "./template";

const LABELS: Record<string, string> = {
  en: "EN",
  vi: "VI",
};

export function LocaleSwitcherClient({ current }: { current: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <LocaleSwitcherTemplate>
      {routing.locales.map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={isPending || locale === current}
          onClick={() =>
            startTransition(() => {
              router.replace(pathname, { locale });
            })
          }
          className={cn(
            "rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition disabled:cursor-default",
            locale === current
              ? "bg-sky-400/15 text-sky-200"
              : "text-slate-500 hover:text-slate-200",
          )}
        >
          {LABELS[locale] ?? locale}
        </button>
      ))}
    </LocaleSwitcherTemplate>
  );
}
