import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  default: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  success: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  danger: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  outline: "border-white/10 bg-transparent text-slate-400",
};

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
