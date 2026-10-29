import type { CartItem } from "@/lib/apis/models/cart.model";
import { CONSTANTS } from "@/lib/constants";

export const CART_EVENT = "pc-forge-cart-change";

export function readCart(): CartItem[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(CONSTANTS.STORAGE.cart);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function writeCart(items: CartItem[]): void {
  window.localStorage.setItem(CONSTANTS.STORAGE.cart, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_EVENT));
}

export function addCartItem(item: Omit<CartItem, "quantity">): CartItem[] {
  const current = readCart();
  const existing = current.find((entry) => entry.id === item.id);
  const next = existing
    ? current.map((entry) =>
        entry.id === item.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
      )
    : [...current, { ...item, quantity: 1 }];
  writeCart(next);
  return next;
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + item.price * item.quantity, 0);
}
