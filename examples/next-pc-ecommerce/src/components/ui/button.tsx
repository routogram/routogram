import { Button as BaseButton } from "@base-ui/react/button";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "default" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: "bg-sky-400 text-slate-950 hover:bg-sky-300 focus-visible:ring-sky-300/60",
  secondary: "bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:ring-slate-400/50",
  outline:
    "border border-(--border) bg-transparent text-slate-100 hover:bg-white/5 focus-visible:ring-sky-300/50",
  ghost:
    "bg-transparent text-slate-300 hover:bg-white/5 hover:text-white focus-visible:ring-slate-400/40",
  danger: "bg-rose-500 text-white hover:bg-rose-400 focus-visible:ring-rose-300/60",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-3 text-xs",
  md: "h-10 rounded-xl px-4 text-sm",
  lg: "h-12 rounded-xl px-6 text-sm",
  icon: "size-9 rounded-lg",
};

export function buttonVariants({
  variant = "default",
  size = "md",
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
}

export type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className"> & {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  className,
  variant = "default",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <BaseButton type={type} className={buttonVariants({ variant, size, className })} {...props} />
  );
}
