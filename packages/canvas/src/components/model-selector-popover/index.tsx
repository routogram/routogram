import { Check, ChevronRight, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  type EffortLevel,
  type ModelOption,
  useAiSettingsStore,
} from "@/stores/use-ai-settings-store";

type Submenu = "model" | "effort" | null;

const EFFORTS: Array<{ value: EffortLevel; description: string }> = [
  { value: "Low", description: "Fast, economical responses" },
  { value: "Medium", description: "Balanced reasoning depth" },
  { value: "High", description: "Deep AST and architecture reasoning" },
];

export function ModelSelectorPopover({ providers }: { providers: ModelOption[] }) {
  const selectedModel = useAiSettingsStore((state) => state.selectedModel);
  const effort = useAiSettingsStore((state) => state.effort);
  const setModel = useAiSettingsStore((state) => state.setModel);
  const setEffort = useAiSettingsStore((state) => state.setEffort);
  const [open, setOpen] = useState(false);
  const [submenu, setSubmenu] = useState<Submenu>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSubmenu(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setSubmenu(null);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={providers.length === 0}
        onClick={() => {
          setOpen((current) => !current);
          setSubmenu(null);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <span>{selectedModel.name}</span>
        <span className="text-zinc-500">{effort}</span>
        <ChevronUp
          className={`size-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 max-h-[26rem] min-w-[270px] overflow-y-auto rounded-xl border border-white/10 bg-[#1c1c1f] p-1.5 text-xs text-zinc-300 shadow-2xl">
          <button
            type="button"
            onClick={() => setSubmenu((current) => (current === "model" ? null : "model"))}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/5"
          >
            <span className="text-zinc-500">Model</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-zinc-200">{selectedModel.name}</span>
              <ChevronRight
                className={`size-3 text-zinc-600 transition-transform ${
                  submenu === "model" ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>

          {submenu === "model" ? (
            <div className="mb-1 ml-2 space-y-0.5 border-l border-white/10 pl-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => {
                    setModel(provider);
                    if (provider.defaultEffort) {
                      setEffort(provider.defaultEffort);
                    }
                    setSubmenu(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[10px] transition-colors hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1 truncate text-zinc-300">{provider.name}</span>
                  {provider.id === selectedModel.id ? (
                    <Check className="size-3 shrink-0 text-sky-400" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setSubmenu((current) => (current === "effort" ? null : "effort"))}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-white/5"
          >
            <span className="text-zinc-500">Effort</span>
            <span className="flex items-center gap-1.5">
              <span className="text-zinc-200">{effort}</span>
              <ChevronRight
                className={`size-3 text-zinc-600 transition-transform ${
                  submenu === "effort" ? "rotate-90" : ""
                }`}
              />
            </span>
          </button>

          {submenu === "effort" ? (
            <div className="mb-1 ml-2 space-y-0.5 border-l border-white/10 pl-2">
              {EFFORTS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setEffort(option.value);
                    setSubmenu(null);
                  }}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] text-zinc-300">{option.value}</span>
                    <span className="block text-[8px] text-zinc-600">{option.description}</span>
                  </span>
                  {option.value === effort ? (
                    <Check className="mt-0.5 size-3 shrink-0 text-sky-400" />
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
