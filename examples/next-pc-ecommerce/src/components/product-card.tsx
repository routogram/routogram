import { ArrowUpRight } from "lucide-react";
import Image from "next/image";

import { Badge, buttonVariants } from "@/components/ui";
import { Link } from "@/i18n/navigation";
import type { Product } from "@/lib/apis/models/product.model";
import { formatCurrency } from "@/lib/utils";

export function ProductCard({ product, locale }: { product: Product; locale: string }) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-(--border) bg-(--surface)/80 transition hover:border-sky-400/30">
      <div className="relative aspect-[4/3] overflow-hidden bg-black/30">
        <Image
          src={product.image}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        <div className="absolute left-3 top-3">
          <Badge variant={product.stock === 0 ? "danger" : "outline"}>{product.category}</Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-slate-100">{product.name}</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
            </p>
          </div>
          <p className="shrink-0 text-xs font-semibold text-sky-200">
            {formatCurrency(product.price, locale)}
          </p>
        </div>
        <Link
          href={`/products/${product.slug}`}
          className={buttonVariants({ variant: "outline", size: "sm", className: "mt-4 w-full" })}
        >
          View details
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </article>
  );
}
