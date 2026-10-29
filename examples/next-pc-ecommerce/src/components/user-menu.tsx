"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { useRouter } from "@/i18n/navigation";
import type { UserProfile } from "@/lib/apis/models/user.model";
import { CONSTANTS } from "@/lib/constants";

export function UserMenu({ user }: { user: UserProfile }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full border border-(--border) bg-white/[0.03] p-1 pr-3 text-left transition hover:bg-white/[0.06]">
        <Image
          src={user.avatar}
          alt={user.name}
          width={28}
          height={28}
          className="size-7 rounded-full object-cover"
        />
        <span className="hidden text-[11px] text-slate-300 sm:block">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push(CONSTANTS.ROUTES.console)}>
          <UserRound className="size-3.5" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push(CONSTANTS.ROUTES.console)}>
          <Settings className="size-3.5" />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            window.localStorage.removeItem(CONSTANTS.STORAGE.auth);
            router.push(CONSTANTS.ROUTES.login);
          }}
        >
          <LogOut className="size-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
