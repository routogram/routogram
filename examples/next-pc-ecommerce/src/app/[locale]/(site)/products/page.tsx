import { Search } from "lucide-react";
import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ProductCard } from "@/components/product-card";
import { Input } from "@/components/ui";
import { getProducts } from "@/lib/apis/graphql";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Components",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, locale, products] = await Promise.all([searchParams, getLocale(), getProducts()]);
  const query = q?.trim().toLowerCase() ?? "";
  const filtered = query
    ? products.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query),
      )
    : products;

  return (
    <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
            Components
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">
            Parts worth building around.
          </h1>
        </div>
        <form className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search components"
            className="h-9 rounded-full bg-black/25 pl-9 text-xs"
          />
        </form>
      </div>
      {filtered.length === 0 ? (
        <p className="mt-10 rounded-xl border border-(--border) p-8 text-center text-xs text-slate-500">
          No components match “{q}”.
        </p>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      )}
    </section>
  );
}
