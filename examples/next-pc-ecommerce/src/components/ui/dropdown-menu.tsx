"use client";

import { Menu } from "@base-ui/react/menu";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export type DropdownMenuContentProps = ComponentProps<typeof Menu.Popup> & {
  align?: "start" | "center" | "end";
  sideOffset?: number;
};

export function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: DropdownMenuContentProps) {
  return (
    <Menu.Portal>
      <Menu.Positioner align={align} sideOffset={sideOffset} className="z-50">
        <Menu.Popup
          className={cn(
            "min-w-40 overflow-hidden rounded-xl border border-(--border) bg-(--surface) p-1 text-slate-200 shadow-2xl outline-none",
            className,
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export type DropdownMenuItemProps = ComponentProps<typeof Menu.Item> & {
  onSelect?: () => void;
};

type MenuItemClickEvent = Parameters<NonNullable<ComponentProps<typeof Menu.Item>["onClick"]>>[0];

export function DropdownMenuItem({
  className,
  onClick,
  onSelect,
  ...props
}: DropdownMenuItemProps) {
  function handleClick(event: MenuItemClickEvent) {
    onClick?.(event);
    onSelect?.();
  }

  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs outline-none transition-colors focus:bg-white/5 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      onClick={handleClick}
      {...props}
    />
  );
}

export type DropdownMenuLabelProps = ComponentProps<"div">;

export function DropdownMenuLabel({ className, ...props }: DropdownMenuLabelProps) {
  return (
    <div
      className={cn("px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-slate-500", className)}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return <Menu.Separator className={cn("-mx-1 my-1 h-px bg-white/10", className)} {...props} />;
}
