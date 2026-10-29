"use client";

import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui";
import type { CartItem } from "@/lib/apis/models/cart.model";
import { addCartItem } from "@/lib/utils/cart";

export function AddToCartButton({
  item,
  label,
}: {
  item: Omit<CartItem, "quantity">;
  label: string;
}) {
  const [added, setAdded] = useState(false);

  return (
    <Button
      onClick={() => {
        addCartItem(item);
        setAdded(true);
        window.setTimeout(() => setAdded(false), 1400);
      }}
      className="w-full sm:w-auto"
    >
      {added ? <Check className="size-4" /> : <ShoppingCart className="size-4" />}
      {added ? "Added" : label}
    </Button>
  );
}
