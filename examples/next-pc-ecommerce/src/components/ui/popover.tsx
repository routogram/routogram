"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverTitle = PopoverPrimitive.Title;
export const PopoverDescription = PopoverPrimitive.Description;

export type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Popup> & {
  align?: "start" | "center" | "end";
  sideOffset?: number;
};

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner align={align} sideOffset={sideOffset} className="z-50">
        <PopoverPrimitive.Popup
          className={cn(
            "rounded-xl border border-white/10 bg-[#1c1c1f] p-3 text-xs text-zinc-300 shadow-2xl outline-none",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
