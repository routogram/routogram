import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/10 bg-[#0c0c0e]/90 shadow-xl shadow-black/20 backdrop-blur",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn("p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: CardProps) {
  return <h3 className={cn("text-sm font-semibold text-slate-100", className)} {...props} />;
}

export function CardDescription({ className, ...props }: CardProps) {
  return <p className={cn("mt-1 text-xs leading-5 text-slate-500", className)} {...props} />;
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn("p-5 pt-2", className)} {...props} />;
}

export function CardFooter({ className, ...props }: CardProps) {
  return <div className={cn("flex items-center gap-3 p-5 pt-0", className)} {...props} />;
}
