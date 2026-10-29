import { ArrowUpRight, Star } from "lucide-react";
import Image from "next/image";

import { Badge } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import { formatCurrency } from "@/lib/utils";
import type { FeaturedBuildView } from "../../_handlers";

export type FeaturedBuildsTemplateProps = {
  builds: FeaturedBuildView[];
  locale: string;
  eyebrow: string;
  title: string;
  subtitle: string;
};

export function FeaturedBuildsTemplate({
  builds,
  locale,
  eyebrow,
  title,
  subtitle,
}: FeaturedBuildsTemplateProps) {
  return (
    <section id="featured-builds" className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">{title}</h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">{subtitle}</p>
        </div>
        <Link
          href="/products"
          className="text-[10px] uppercase tracking-wider text-slate-500 transition hover:text-sky-200"
        >
          Browse all builds →
        </Link>
      </div>

      <div className="mt-7 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {builds.map((build) => (
          <article
            key={build.id}
            className="group overflow-hidden rounded-2xl border border-(--border) bg-(--surface)/80 transition hover:border-sky-400/30"
          >
            <Link href={`/products/${build.slug}`} className="block">
              <div className="relative aspect-[4/3] overflow-hidden bg-black/30">
                <Image
                  src={build.image}
                  alt={build.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  className="object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-x-3 top-3 flex items-center justify-between">
                  <Badge>{build.badge}</Badge>
                  <span className="flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[9px] text-amber-200 backdrop-blur">
                    <Star className="size-2.5 fill-current" />
                    {build.rating} · {build.reviews}
                  </span>
                </div>
              </div>
            </Link>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">{build.name}</h3>
                  <p className="mt-1 text-[10px] text-slate-500">{build.tagline}</p>
                </div>
                <ArrowUpRight className="size-4 text-slate-600 transition group-hover:text-sky-300" />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {build.specs.map((spec) => (
                  <span
                    key={spec.label}
                    className="rounded-md border border-white/5 bg-white/[0.025] px-1.5 py-0.5 text-[9px] text-slate-500"
                  >
                    {spec.value}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-end justify-between border-t border-white/5 pt-3">
                <div>
                  {build.oldPrice ? (
                    <p className="text-[10px] text-slate-600 line-through">
                      {formatCurrency(build.oldPrice, locale)}
                    </p>
                  ) : null}
                  <p className="text-sm font-semibold text-sky-200">
                    {formatCurrency(build.price, locale)}
                  </p>
                </div>
                <span className="text-[10px] text-slate-500">Configure →</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
