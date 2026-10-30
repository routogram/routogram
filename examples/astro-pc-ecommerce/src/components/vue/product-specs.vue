<script setup lang="ts">
import { computed, ref } from "vue";

type Spec = {
  key: string;
  label: string;
  value: string;
};

const tabs = [
  { id: "performance", label: "Performance" },
  { id: "thermal", label: "Thermals" },
  { id: "connectivity", label: "Connectivity" },
] as const;

const specs: Spec[] = [
  { key: "performance", label: "CPU", value: "Ryzen 9 9950X3D · 16C / 32T" },
  { key: "performance", label: "GPU", value: "RTX 5090 · 32GB GDDR7" },
  { key: "performance", label: "Memory", value: "64GB DDR5-6400 CL30" },
  { key: "thermal", label: "Cooling", value: "360mm liquid AIO · 6 fans" },
  { key: "thermal", label: "Noise", value: "< 32 dBA under load" },
  { key: "connectivity", label: "Network", value: "10GbE + Wi-Fi 7" },
  { key: "connectivity", label: "Ports", value: "Thunderbolt 5 × 2" },
];

const activeTab = ref<(typeof tabs)[number]["id"]>("performance");
const visibleSpecs = computed(() => specs.filter((spec) => spec.key === activeTab.value));
</script>

<template>
  <section class="rounded-xl border border-white/10 bg-white/[0.03] p-5">
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 class="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-200">
        Product specs
      </h2>
      <span class="rounded border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-emerald-300">
        Vue island
      </span>
    </div>

    <div class="mb-4 flex flex-wrap gap-1.5">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="rounded-md border px-2.5 py-1 text-[10px] transition-colors"
        :class="
          activeTab === tab.id
            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200'
            : 'border-white/10 bg-white/[0.02] text-zinc-500 hover:text-zinc-300'
        "
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <dl class="grid gap-2 sm:grid-cols-2">
      <div
        v-for="spec in visibleSpecs"
        :key="spec.label"
        class="rounded-lg border border-white/5 bg-black/20 px-3 py-2"
      >
        <dt class="text-[9px] uppercase tracking-wider text-zinc-600">{{ spec.label }}</dt>
        <dd class="mt-1 font-mono text-[11px] text-zinc-300">{{ spec.value }}</dd>
      </div>
    </dl>
  </section>
</template>
