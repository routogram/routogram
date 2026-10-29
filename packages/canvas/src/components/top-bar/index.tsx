import { Check, Code2, Copy, PanelRightClose, Search, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AppTab } from "@/layouts/app-shell";
import { cn } from "@/lib/utils/cn";

type SearchNode = {
  id: string;
  name: string;
  kind: string;
  file: string;
};

type TopBarProps = {
  activeTab: AppTab;
  nodes: SearchNode[];
  onSelectNode: (nodeId: string) => void;
  onOpenEditor: () => void;
  onCopySnapshot: () => Promise<void>;
  onToggleAi: () => void;
  aiOpen: boolean;
  editorDisabled?: boolean;
  snapshotDisabled?: boolean;
};

const TITLES: Record<AppTab, { eyebrow: string; title: string }> = {
  overview: { eyebrow: "Console / Overview", title: "Overview" },
  routing: { eyebrow: "Console / Route Topology", title: "Route Topology" },
};

export function TopBar({
  activeTab,
  nodes,
  onSelectNode,
  onOpenEditor,
  onCopySnapshot,
  onToggleAi,
  aiOpen,
  editorDisabled = true,
  snapshotDisabled = false,
}: TopBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const meta = TITLES[activeTab];

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? nodes.filter(
          (node) =>
            node.name.toLowerCase().includes(normalized) ||
            node.file.toLowerCase().includes(normalized),
        )
      : nodes;
    return matches.slice(0, 8);
  }, [nodes, query]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((current) => !current);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleCopy(): Promise<void> {
    await onCopySnapshot();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between gap-4 px-1">
      <div className="min-w-0">
        <p className="text-[8px] font-medium uppercase tracking-[0.2em] text-zinc-600">
          {meta.eyebrow}
        </p>
        <h1 className="truncate text-[13px] font-semibold tracking-tight text-zinc-100">
          {meta.title}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSearchOpen((current) => !current)}
          aria-expanded={searchOpen}
          className="flex h-7 items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
        >
          <Search className="size-3" />
          <span className="hidden sm:inline">Quick search</span>
          <kbd className="hidden rounded border border-white/[0.06] px-1 font-mono text-[8px] text-zinc-600 sm:inline">
            ⌘K
          </kbd>
        </button>
        <button
          type="button"
          onClick={onOpenEditor}
          disabled={editorDisabled}
          title={editorDisabled ? "Select a node to open its file" : "Open selected node in editor"}
          className="grid size-7 place-items-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-35"
        >
          <Code2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleAi}
          aria-pressed={aiOpen}
          title={aiOpen ? "Hide Architecture Assistant" : "Open Architecture Assistant"}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[10px] font-medium transition-all ${
            aiOpen
              ? "border-sky-400/50 bg-sky-400/15 text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.2)]"
              : "border-sky-400/35 bg-sky-400/10 text-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.12)] hover:border-sky-300/55 hover:bg-sky-400/15 hover:text-sky-100 hover:shadow-[0_0_20px_rgba(56,189,248,0.22)]"
          }`}
        >
          {aiOpen ? <PanelRightClose className="size-3.5" /> : <Sparkles className="size-3.5" />}
          <span>Ask AI</span>
        </button>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={snapshotDisabled}
          title="Copy topology JSON snapshot"
          className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 text-[10px] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Snapshot"}</span>
        </button>
      </div>

      {searchOpen ? (
        <>
          <button
            type="button"
            aria-label="Close search"
            className="fixed inset-0 z-40 cursor-default bg-black/50 backdrop-blur-[2px]"
            onClick={() => setSearchOpen(false)}
          />
          <div className="absolute right-1 top-11 z-50 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0e] shadow-2xl shadow-black/60">
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3">
              <Search className="size-3.5 text-zinc-600" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search nodes or files…"
                className="h-10 min-w-0 flex-1 bg-transparent text-[11px] text-zinc-200 outline-none placeholder:text-zinc-600"
              />
              <button
                type="button"
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
                className="grid size-6 place-items-center rounded text-zinc-600 hover:bg-white/5 hover:text-zinc-300"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-1.5">
              {results.length === 0 ? (
                <p className="px-3 py-6 text-center text-[10px] text-zinc-600">
                  No matching nodes.
                </p>
              ) : (
                results.map((node) => (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => {
                      onSelectNode(node.id);
                      setSearchOpen(false);
                      setQuery("");
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        node.kind === "route" && "bg-amber-400",
                        node.kind === "component" && "bg-sky-400",
                        node.kind === "layout" && "bg-violet-400",
                        !["route", "component", "layout"].includes(node.kind) && "bg-zinc-500",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] text-zinc-200">{node.name}</span>
                      <span className="block truncate font-mono text-[9px] text-zinc-600">
                        {node.file}
                      </span>
                    </span>
                    <span className="shrink-0 text-[8px] uppercase tracking-wider text-zinc-700">
                      {node.kind}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      ) : null}
    </header>
  );
}
