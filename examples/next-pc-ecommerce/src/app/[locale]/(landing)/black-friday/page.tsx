import { ArrowRight, Flame, Snowflake, TimerReset } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";

import { Badge, buttonVariants } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { getFeaturedPcs } from "@/lib/apis/graphql";
import { formatCurrency } from "@/lib/utils";
import { FlashSaleCountdown } from "../_components/flash-sale-countdown/client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Black Friday water-cooling sale",
  description: "Limited water-cooled PC builds and component deals.",
};

export default async function BlackFridayPage() {
  const [builds, locale, t] = await Promise.all([
    getFeaturedPcs(),
    getLocale(),
    getTranslations("landing"),
  ]);
  const deals = builds.map((build, index) => ({
    ...build,
    salePrice: Math.round(build.price * (index === 0 ? 0.82 : 0.88)),
  }));

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(251,146,60,0.16),transparent_32rem),radial-gradient(circle_at_85%_20%,rgba(56,189,248,0.1),transparent_28rem)]" />
      <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <nav className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl border border-amber-400/25 bg-amber-400/10 text-sm font-bold text-amber-300">
              PF
            </span>
            <span className="text-sm font-semibold text-slate-100">PC Forge</span>
          </Link>
          <Link
            href="/products"
            className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 transition hover:text-amber-200"
          >
            Shop all
            <ArrowRight className="size-3" />
          </Link>
        </nav>

        <section className="mt-14 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <Badge variant="warning" className="gap-1.5 normal-case tracking-normal">
              <Snowflake className="size-3" />
              {t("badge")}
            </Badge>
            <h1 className="mt-5 max-w-2xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight text-amber-50 sm:text-6xl">
              {t("title")}
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400">{t("subtitle")}</p>
            <div className="mt-8">
              <FlashSaleCountdown />
            </div>
            <div className="mt-8 flex flex-wrap gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1.5">
                <Flame className="size-3.5 text-orange-400" />
                Limited stock
              </span>
              <span className="flex items-center gap-1.5">
                <TimerReset className="size-3.5 text-amber-300" />
                Prices return after the timer
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-full bg-orange-500/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-amber-400/20 bg-black/30 p-2">
              <Image
                src={builds[0]?.image ?? ""}
                alt="Water-cooled Black Friday PC"
                width={1100}
                height={900}
                priority
                className="aspect-[5/4] w-full rounded-[1.55rem] object-cover"
              />
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between rounded-xl border border-white/10 bg-black/65 p-3 backdrop-blur">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-amber-300">Doorbuster</p>
                  <p className="mt-1 text-sm font-semibold text-white">{builds[0]?.name}</p>
                </div>
                <p className="text-lg font-semibold text-amber-200">-18%</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-20">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-xl font-semibold tracking-tight text-amber-50">{t("deals")}</h2>
            <span className="text-[10px] uppercase tracking-wider text-slate-600">
              Ends 28 Nov · 23:59 UTC
            </span>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {deals.map((deal) => (
              <article
                key={deal.id}
                className="group overflow-hidden rounded-2xl border border-amber-400/15 bg-black/25 transition hover:border-amber-400/35"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={deal.image}
                    alt={deal.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                  <div className="absolute left-3 top-3">
                    <Badge variant="warning">{deal.badge}</Badge>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="text-sm font-semibold text-amber-50">{deal.name}</h3>
                  <p className="mt-1 text-[10px] text-slate-500">{deal.tagline}</p>
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-[10px] text-slate-600 line-through">
                        {formatCurrency(deal.price, locale)}
                      </p>
                      <p className="text-lg font-semibold text-amber-200">
                        {formatCurrency(deal.salePrice, locale)}
                      </p>
                    </div>
                    <Link
                      href={`/products/${deal.slug}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      {t("claim")}
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 py-6 text-[9px] uppercase tracking-wider text-slate-700">
          <span>PC Forge · Black Friday 2026</span>
          <span>Demo campaign · Mock inventory</span>
        </footer>
      </div>
    </div>
  );
}
