<script lang="ts">
  type Toast = {
    id: number;
    message: string;
  };

  let visible = true;
  let toasts: Toast[] = [
    { id: 1, message: "Build compatibility check passed." },
    { id: 2, message: "Free express shipping applied." },
  ];

  function dismiss(id: number) {
    toasts = toasts.filter((toast) => toast.id !== id);
  }
</script>

{#if visible}
  <div class="fixed right-6 bottom-6 z-30 w-80 space-y-2">
    {#each toasts as toast (toast.id)}
      <div
        class="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-[#15151b] p-3 shadow-2xl"
      >
        <div class="flex gap-2">
          <span class="mt-0.5 size-1.5 rounded-full bg-emerald-400"></span>
          <p class="text-[11px] leading-5 text-zinc-300">{toast.message}</p>
        </div>
        <button
          type="button"
          class="text-[10px] text-zinc-500 hover:text-zinc-200"
          onclick={() => dismiss(toast.id)}
        >
          Dismiss
        </button>
      </div>
    {/each}
    <button
      type="button"
      class="w-full rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300"
      onclick={() => (visible = false)}
    >
      Hide notifications
    </button>
  </div>
{/if}
