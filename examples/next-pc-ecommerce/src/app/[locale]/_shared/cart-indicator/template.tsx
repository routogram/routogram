import { ShoppingCart, X } from "lucide-react";
import Image from "next/image";

import type { CartItem } from "@/lib/apis/models/cart.model";
import { formatCurrency } from "@/lib/utils";

export type CartIndicatorTemplateProps = {
  count: number;
  items: CartItem[];
  open: boolean;
  locale: string;
  onToggle: () => void;
};

export function CartIndicatorTemplate({
  count,
  items,
  open,
  locale,
  onToggle,
}: CartIndicatorTemplateProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="Open cart"
        className="relative grid size-9 place-items-center rounded-full border border-(--border) bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
      >
        <ShoppingCart className="size-3.5" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-sky-400 px-1 text-[8px] font-bold text-slate-950">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-(--border) bg-(--surface) p-3 shadow-2xl">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Your cart
            </p>
            <button
              type="button"
              onClick={onToggle}
              aria-label="Close cart"
              className="text-slate-600 hover:text-slate-200"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {items.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">Your cart is empty.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5">
                  <Image
                    src={item.image}
                    alt={item.name}
                    width={40}
                    height={40}
                    className="size-10 rounded-lg object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-slate-200">{item.name}</p>
                    <p className="text-[10px] text-slate-500">×{item.quantity}</p>
                  </div>
                  <p className="text-[10px] text-slate-300">
                    {formatCurrency(item.price * item.quantity, locale)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
