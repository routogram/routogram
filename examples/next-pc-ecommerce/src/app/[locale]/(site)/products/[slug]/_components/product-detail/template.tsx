import { Check, Star, Truck } from "lucide-react";
import Image from "next/image";

import { AddToCartButton } from "@/components/add-to-cart-button";
import { ProductCard } from "@/components/product-card";
import { Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import type { ProductDetailView } from "../../../../_handlers";

export type ProductDetailTemplateProps = {
  product: ProductDetailView;
  locale: string;
};

export function ProductDetailTemplate({ product, locale }: ProductDetailTemplateProps) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-(--border) bg-black/30">
          <Image
            src={product.image}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 55vw"
            className="object-cover"
          />
          <div className="absolute left-4 top-4 flex gap-2">
            <Badge>{product.category}</Badge>
            {product.stock > 0 ? (
              <Badge variant="success">In stock</Badge>
            ) : (
              <Badge variant="danger">Out of stock</Badge>
            )}
          </div>
        </div>

        <div className="lg:py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
            PC Forge collection
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50">
            {product.name}
          </h1>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-amber-200">
            <Star className="size-3.5 fill-current" />
            {product.rating} / 5<span className="text-slate-600">·</span>
            <span className="text-slate-500">Verified build rating</span>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-400">{product.description}</p>

          <div className="mt-6 rounded-2xl border border-(--border) bg-(--surface)/70 p-5">
            <div className="flex items-end justify-between">
              <div>
                {product.oldPrice ? (
                  <p className="text-xs text-slate-600 line-through">
                    {formatCurrency(product.oldPrice, locale)}
                  </p>
                ) : null}
                <p className="text-3xl font-semibold text-sky-200">
                  {formatCurrency(product.price, locale)}
                </p>
              </div>
              <span className="text-[10px] text-slate-500">
                {product.stock > 0 ? `${product.stock} available` : "Notify me"}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-500">
              <Truck className="size-3.5 text-sky-300" />
              Free insured shipping · Ships in 3–5 business days
            </div>
            <div className="mt-5">
              <AddToCartButton
                label="Add to cart"
                item={{
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  image: product.image,
                }}
              />
            </div>
          </div>

          <div className="mt-7">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Configuration & specifications
            </h2>
            <dl className="mt-3 divide-y divide-white/5 rounded-xl border border-(--border)">
              {product.specs.map((spec) => (
                <div
                  key={spec.label}
                  className="flex items-center justify-between gap-4 px-4 py-2.5"
                >
                  <dt className="text-[10px] text-slate-500">{spec.label}</dt>
                  <dd className="text-right text-[11px] text-slate-200">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-5 flex flex-wrap gap-4 text-[10px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Check className="size-3 text-emerald-300" />
              48-hour burn-in
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3 text-emerald-300" />
              Two-year warranty
            </span>
          </div>
        </div>
      </div>

      {product.related.length > 0 ? (
        <div className="mt-16">
          <h2 className="text-lg font-semibold text-slate-100">Pairs well with</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {product.related.map((related) => (
              <ProductCard key={related.id} product={related} locale={locale} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
