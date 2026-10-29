import { LocaleSwitcherTemplate } from "./template";

export function LocaleSwitcherSkeleton() {
  return (
    <LocaleSwitcherTemplate>
      <span className="h-5 w-8 animate-pulse rounded-full bg-white/10" />
      <span className="h-5 w-8 animate-pulse rounded-full bg-white/10" />
    </LocaleSwitcherTemplate>
  );
}
