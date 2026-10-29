import { Input as BaseInput } from "@base-ui/react/input";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type InputProps = ComponentProps<typeof BaseInput>;

export function Input({ className, type = "text", ...props }: InputProps) {
  return (
    <BaseInput
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-(--border) bg-black/20 px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
