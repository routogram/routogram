import { Cpu, Gamepad2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export type EntryLayoutProps = {
  children: ReactNode;
};

export function EntryLayout({ children }: EntryLayoutProps) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="relative hidden overflow-hidden border-r border-(--border) bg-(--surface) p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 pc-grid opacity-70" />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl border border-sky-400/25 bg-sky-400/10 text-sm font-bold text-sky-300">
              PF
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-100">PC Forge</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-600">
                Custom systems
              </p>
            </div>
          </div>
          <h2 className="mt-16 max-w-md text-4xl font-semibold leading-tight tracking-tight text-balance text-slate-100">
            Every build starts with the right parts.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-slate-500">
            Track orders, save configurations, and talk to the people who assemble your machine.
          </p>
        </div>
        <div className="relative grid gap-3">
          {[
            { icon: Cpu, label: "Tested configurations" },
            { icon: ShieldCheck, label: "Two-year warranty" },
            { icon: Gamepad2, label: "Built for real play" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5 text-xs text-slate-400"
            >
              <item.icon className="size-4 text-sky-300" />
              {item.label}
            </div>
          ))}
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
