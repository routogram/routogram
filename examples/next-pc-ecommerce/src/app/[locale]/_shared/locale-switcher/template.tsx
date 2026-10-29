import { Globe2 } from "lucide-react";
import type { ReactNode } from "react";

export type LocaleSwitcherTemplateProps = {
  children: ReactNode;
};

export function LocaleSwitcherTemplate({ children }: LocaleSwitcherTemplateProps) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-(--border) bg-white/[0.03] p-0.5">
      <Globe2 className="ml-1.5 size-3 text-slate-600" />
      {children}
    </div>
  );
}
