import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number, locale: string = "en"): string {
  const isVietnamese = locale === "vi";
  return new Intl.NumberFormat(isVietnamese ? "vi-VN" : "en-US", {
    style: "currency",
    currency: isVietnamese ? "VND" : "USD",
    maximumFractionDigits: 0,
  }).format(isVietnamese ? value * 25_000 : value);
}

export function formatCompactNumber(value: number, locale: string = "en"): string {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(value: string, locale: string = "en"): string {
  return new Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
