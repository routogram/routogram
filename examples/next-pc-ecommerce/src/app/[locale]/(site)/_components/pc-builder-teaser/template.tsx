import { Cpu, HardDrive, MemoryStick } from "lucide-react";

import type { BuilderOption } from "@/lib/apis/models/product.model";
import { formatCurrency } from "@/lib/utils";

type OptionKey = "cpu" | "gpu" | "memory";

export type PcBuilderTeaserTemplateProps = {
  options: Record<OptionKey, BuilderOption[]>;
  selected: Record<OptionKey, string>;
  total: number;
  locale: string;
  labels: {
    eyebrow: string;
    title: string;
    cpu: string;
    gpu: string;
    memory: string;
    estimated: string;
    calculate: string;
  };
  onSelect: (key: OptionKey, value: string) => void;
  onCalculate: () => void;
};

export function PcBuilderTeaserTemplate({
  options,
  selected,
  total,
  locale,
  labels,
  onSelect,
  onCalculate,
}: PcBuilderTeaserTemplateProps) {
  return (
    <section id="pc-builder" className="border-y border-(--border) bg-(--surface)/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-300">
            {labels.eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-100">
            {labels.title}
          </h2>
          <p className="mt-3 max-w-md text-xs leading-5 text-slate-500">
            Pick the parts that matter most. We will check compatibility, power headroom, and
            clearance before the build enters the queue.
          </p>
          <div className="mt-6 flex items-center gap-2 text-[10px] text-slate-500">
            <Cpu className="size-3.5 text-sky-300" />
            Live estimate
            <span className="text-slate-700">·</span>
            No account required
          </div>
        </div>

        <div className="rounded-2xl border border-(--border) bg-(--surface) p-4 shadow-2xl">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["cpu", labels.cpu, Cpu],
                ["gpu", labels.gpu, HardDrive],
                ["memory", labels.memory, MemoryStick],
              ] as const
            ).map(([key, label, Icon]) => (
              <label key={key} className="block">
                <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-slate-500">
                  <Icon className="size-3" />
                  {label}
                </span>
                <select
                  value={selected[key]}
                  onChange={(event) => onSelect(key, event.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-(--border) bg-black/25 px-2 py-2 text-[10px] text-slate-300 outline-none focus:border-sky-400/50"
                >
                  {options[key].map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 flex items-end justify-between border-t border-white/5 pt-4">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-600">
                {labels.estimated}
              </p>
              <p className="text-xl font-semibold text-sky-200">{formatCurrency(total, locale)}</p>
            </div>
            <button
              type="button"
              onClick={onCalculate}
              className="rounded-xl bg-sky-400 px-4 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-sky-300"
            >
              {labels.calculate}
            </button>
          </div>
          <p className="mt-3 text-[9px] text-slate-600">
            Demo pricing. Final invoice includes assembly, Windows, and a two-year warranty.
          </p>
        </div>
      </div>
    </section>
  );
}
