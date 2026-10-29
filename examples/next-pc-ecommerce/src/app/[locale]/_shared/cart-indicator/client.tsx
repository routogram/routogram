"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

import { CART_EVENT, cartCount, readCart } from "@/lib/utils/cart";
import { useCartUiStore } from "@/stores/cart-ui-store";
import { CartIndicatorTemplate } from "./template";

export function CartIndicator() {
  const locale = useLocale();
  const [items, setItems] = useState(() => readCart());
  const open = useCartUiStore((state) => state.open);
  const setOpen = useCartUiStore((state) => state.setOpen);

  useEffect(() => {
    const refresh = () => setItems(readCart());
    window.addEventListener(CART_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CART_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <CartIndicatorTemplate
      count={cartCount(items)}
      items={items}
      open={open}
      locale={locale}
      onToggle={() => setOpen(!open)}
    />
  );
}
