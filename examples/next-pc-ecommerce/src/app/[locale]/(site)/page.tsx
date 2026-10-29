import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { FeaturedBuilds } from "./_components/featured-builds/server";
import { HeroBanner } from "./_components/hero-banner/server";
import { PcBuilderTeaser } from "./_components/pc-builder-teaser/client";
import { getHomePageView } from "./_handlers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Custom gaming PCs and components",
  description:
    "Explore tested gaming PC builds, configure a quick estimate, and shop PC components.",
};

export default async function StorefrontHomePage() {
  const [locale, data] = await Promise.all([getLocale(), getHomePageView()]);

  return (
    <>
      <HeroBanner />
      <FeaturedBuilds builds={data.builds} />
      <PcBuilderTeaser options={data.builderOptions} />
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-4 rounded-2xl border border-(--border) bg-(--surface)/50 p-6 md:grid-cols-3">
          {[
            ["Assembled by hand", "Every cable routed and every fan curve checked in-house."],
            ["Benchmarked before shipping", "48 hours of burn-in and game testing on every build."],
            ["Real support", "Talk directly to the builders when you need a hand."],
          ].map(([title, copy]) => (
            <div key={title}>
              <p className="text-xs font-semibold text-slate-200">{title}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{copy}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-[9px] uppercase tracking-[0.2em] text-slate-700">
          Shipping from {locale === "vi" ? "Da Nang" : "Portland"} · Demo storefront
        </p>
      </section>
    </>
  );
}
