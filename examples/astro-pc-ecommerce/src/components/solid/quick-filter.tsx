/** @jsxImportSource solid-js */
import { createSignal, For } from "solid-js";

const filters = ["All", "Gaming", "Creative", "AI / ML"] as const;
type Filter = (typeof filters)[number];

export default function QuickFilter() {
  const [active, setActive] = createSignal<Filter>("All");

  return (
    <section class="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-200">
          Quick filter
        </h2>
        <span class="rounded border border-orange-400/20 bg-orange-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-orange-300">
          Solid island
        </span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <For each={filters}>
          {(filter) => (
            <button
              type="button"
              onClick={() => setActive(filter)}
              class={`rounded-md border px-2.5 py-1 text-[10px] transition-colors ${
                active() === filter
                  ? "border-orange-400/40 bg-orange-400/10 text-orange-200"
                  : "border-white/10 bg-white/[0.02] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {filter}
            </button>
          )}
        </For>
      </div>
      <p class="mt-3 text-[10px] text-zinc-500">
        Showing <span class="text-zinc-300">{active()}</span> workstation presets.
      </p>
    </section>
  );
}
