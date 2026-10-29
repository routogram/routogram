import { ArrowRight, Cpu, Sparkles } from "lucide-react";
import Image from "next/image";

import { Badge, buttonVariants } from "@/components/ui";
import { Link } from "@/i18n/navigation";

export type HeroBannerTemplateProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryCta: string;
  secondaryCta: string;
};

export function HeroBannerTemplate({
  eyebrow,
  title,
  subtitle,
  primaryCta,
  secondaryCta,
}: HeroBannerTemplateProps) {
  return (
    <section className="relative overflow-hidden border-b border-(--border)">
      <div className="absolute inset-0 pc-grid opacity-60" />
      <div className="absolute -left-24 top-1/3 size-72 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <Badge variant="outline" className="gap-1.5 normal-case tracking-normal">
            <Sparkles className="size-3 text-sky-300" />
            {eyebrow}
          </Badge>
          <h1 className="mt-5 max-w-2xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-slate-50 sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-6 text-slate-400">{subtitle}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/#featured-builds"
              className={buttonVariants({ size: "lg", className: "gap-2" })}
            >
              {primaryCta}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/#pc-builder"
              className={buttonVariants({ variant: "outline", size: "lg", className: "gap-2" })}
            >
              <Cpu className="size-4" />
              {secondaryCta}
            </Link>
          </div>
          <div className="mt-10 grid max-w-lg grid-cols-3 gap-3">
            {[
              ["2 yr", "warranty"],
              ["48 hr", "burn-in test"],
              ["4.9/5", "owner rating"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-white/5 bg-black/20 p-3">
                <p className="text-sm font-semibold text-slate-100">{value}</p>
                <p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 rounded-[2rem] bg-sky-400/5 blur-2xl" />
          <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/30 p-2 shadow-2xl">
            <Image
              src="https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=1400&q=90"
              alt="Custom gaming PC with glass side panel"
              width={1200}
              height={900}
              priority
              className="aspect-[4/3] w-full rounded-[1.1rem] object-cover"
            />
            <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between rounded-xl border border-white/10 bg-black/60 p-3 backdrop-blur">
              <div>
                <p className="text-[9px] uppercase tracking-wider text-sky-300">
                  Build of the week
                </p>
                <p className="mt-1 text-sm font-semibold text-white">Aurora RTX 4070</p>
              </div>
              <p className="text-sm font-semibold text-sky-200">$1,849</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
