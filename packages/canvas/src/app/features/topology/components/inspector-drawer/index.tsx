import type { Diagnostic } from "@routogram/plugin-core";
import type {
  ComponentPropMeta,
  DiagnosticSource,
  ExternalDiagnostic,
  NodeDataFlowMeta,
  RoutogramNode,
} from "@routogram/types";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy as CopyIcon,
  Info,
  ShieldAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getCachedDiagnostics } from "@/lib/apis";
import {
  buildAiContextMarkdown,
  buildTargetedAiContextMarkdown,
  computeNodeBlastRadius,
  getBlastRadiusGraph,
  type NodeBlastRadius,
  type RiskLevel,
} from "@/lib/utils/blast-radius";
import { formatComponentName } from "@/lib/utils/format-name";

type InspectorDrawerProps = {
  node: RoutogramNode | null;
  diagnostics: Diagnostic[];
  onClose: () => void;
};

const SEVERITY_META = {
  danger: {
    label: "Danger",
    icon: ShieldAlert,
    badge: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    badge: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
  },
  tidy: {
    label: "Tidy",
    icon: Info,
    badge: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-400",
  },
} as const;

const SOURCE_BADGE: Record<DiagnosticSource, string> = {
  core: "border-sky-400/20 bg-sky-400/10 text-sky-300",
  security: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  biome: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  eslint: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  oxlint: "border-orange-400/20 bg-orange-400/10 text-orange-300",
  plugin: "border-zinc-600 bg-zinc-800 text-zinc-300",
};

const BLAST_META: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "LOW", className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" },
  medium: { label: "MEDIUM", className: "border-sky-400/25 bg-sky-400/10 text-sky-300" },
  high: { label: "HIGH", className: "border-amber-400/25 bg-amber-400/10 text-amber-300" },
  critical: { label: "CRITICAL", className: "border-rose-400/25 bg-rose-400/10 text-rose-300" },
};

type DisplayDiagnostic = {
  id: string;
  ruleId: string;
  source: DiagnosticSource;
  severity: "danger" | "warning" | "tidy";
  message: string;
  file: string;
  line?: number;
  column?: number;
  suggestion?: string;
};

function BlastRadiusInfo({ blast }: { blast: NodeBlastRadius | null }) {
  if (!blast) return null;
  const meta = BLAST_META[blast.riskLevel];

  return (
    <section className="mb-4 rounded-lg border border-zinc-800 bg-[#0e0e11]/90 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Blast Radius
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${meta.className}`}
        >
          {meta.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-zinc-500">Impact surface</span>
        <span className="font-mono text-zinc-200">
          {blast.totalAffected} upstream dependents · {blast.affectedRoutes.length} routes impacted
        </span>
      </div>
    </section>
  );
}

function PropsInfo({ props }: { props: ComponentPropMeta[] | undefined }) {
  if (!props?.length) {
    return null;
  }

  return (
    <section className="mb-4 rounded-lg border border-zinc-800 bg-[#0e0e11]/90 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Props
        </span>
        <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
          {props.length}
        </span>
      </div>

      <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
        {props.map((prop) => (
          <div
            key={prop.name}
            className="flex items-center justify-between gap-2 font-mono text-xs"
          >
            <span className="text-zinc-200">
              {prop.name}
              {prop.optional ? <span className="text-amber-400/80">?</span> : null}
            </span>
            <span
              className="max-w-[180px] truncate rounded border border-zinc-700/40 bg-zinc-800/50 px-1.5 py-0.5 text-[11px] text-zinc-400"
              title={prop.type ?? "any"}
            >
              {prop.type || "any"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DataFlowInfo({ dataFlow }: { dataFlow: NodeDataFlowMeta | undefined }) {
  if (!dataFlow) {
    return null;
  }

  const fetcher = dataFlow.dataRole === "fetcher";
  const dataRoleLabel = fetcher
    ? `Self-fetching (${dataFlow.fetchSignals[0] ?? "API"})`
    : "Props-driven";
  const dataRoleTooltip = fetcher
    ? "Component chủ động fetch dữ liệu qua API hoặc query hooks."
    : "Component thuần hiển thị, không trực tiếp fetch dữ liệu; dữ liệu được nhận qua props từ component cha.";
  const fetchTooltip = dataFlow.fetchSignals.length
    ? `Tự gọi dữ liệu thông qua: ${dataFlow.fetchSignals.join(", ")}`
    : undefined;

  return (
    <section className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          Info
        </span>

        <div className="group relative cursor-help" title={dataRoleTooltip}>
          <span
            className={`rounded border px-2 py-0.5 text-[10px] font-medium tracking-wide ${
              fetcher
                ? "border-purple-800/60 bg-purple-950/60 text-purple-300"
                : "border-zinc-700/80 bg-zinc-800/80 text-zinc-300"
            }`}
          >
            {dataRoleLabel}
          </span>
          {fetchTooltip ? <span className="sr-only">{fetchTooltip}</span> : null}
        </div>
      </div>

      {dataFlow.providers.length > 0 ? (
        <div className="mb-3">
          <p
            className="cursor-help text-[9px] uppercase tracking-wider text-zinc-600"
            title="Các Provider/Context được bọc bên trong component này."
          >
            Providers
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {dataFlow.providers.map((provider) => (
              <span
                key={provider}
                className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300"
              >
                {provider}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {dataFlow.sideEffects?.length ? (
        <div className="mb-3">
          <p
            className="cursor-help text-[9px] uppercase tracking-wider text-zinc-600"
            title="Các lifecycle hoặc side-effect hooks được tìm thấy trong node."
          >
            Side Effects
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {dataFlow.sideEffects.map((effect) => (
              <span
                key={effect}
                className="rounded border border-amber-800/40 bg-amber-950/30 px-1.5 py-0.5 font-mono text-[9px] text-amber-300"
              >
                {effect}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {dataFlow.stateManagement?.length ? (
        <div className="mb-3">
          <p
            className="cursor-help text-[9px] uppercase tracking-wider text-zinc-600"
            title="Store hoặc state primitive được nhận diện trong node."
          >
            State Management
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {dataFlow.stateManagement.map((state) => (
              <span
                key={state}
                className="rounded border border-indigo-800/40 bg-indigo-950/30 px-1.5 py-0.5 font-mono text-[9px] text-indigo-300"
              >
                {state}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-2 text-xs">
        <div
          className="flex cursor-help items-center gap-1 text-zinc-400"
          title="Số lượng component con trực tiếp và gián tiếp ở nhánh hạ lưu sẽ bị re-render khi component này cập nhật state hoặc props."
        >
          <span className="text-[11px] uppercase tracking-wider">Re-render Scope</span>
          <Info className="size-3 text-zinc-500" />
        </div>
        <span className="font-mono text-xs text-zinc-200">
          {dataFlow.reRenderSurfaceCount} downstream components
        </span>
      </div>
    </section>
  );
}

export function InspectorDrawer({ node, diagnostics, onClose }: InspectorDrawerProps) {
  const [externalDiagnostics, setExternalDiagnostics] = useState<ExternalDiagnostic[]>([]);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const nodeId = node?.id ?? null;

  useEffect(() => {
    if (!nodeId) {
      setExternalDiagnostics([]);
      return;
    }
    setExternalDiagnostics(getCachedDiagnostics(nodeId));

    const handleDiagnosticsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (
        typeof detail !== "object" ||
        detail === null ||
        !("nodes" in detail) ||
        typeof (detail as { nodes?: unknown }).nodes !== "object"
      ) {
        return;
      }
      const nodes = (detail as { nodes: Record<string, { diagnostics?: ExternalDiagnostic[] }> })
        .nodes;
      setExternalDiagnostics(nodes[nodeId]?.diagnostics ?? []);
    };

    window.addEventListener("routogram:diagnostics-updated", handleDiagnosticsUpdated);
    return () =>
      window.removeEventListener("routogram:diagnostics-updated", handleDiagnosticsUpdated);
  }, [nodeId]);

  const displayDiagnostics = useMemo<DisplayDiagnostic[]>(() => {
    if (!node) return [];
    const isStyleNode = node.kind === "style" || /\.(css|scss|sass|less|pcss)$/i.test(node.file);
    if (isStyleNode) return [];

    const core: DisplayDiagnostic[] = diagnostics.map((diagnostic) => ({
      id: diagnostic.id,
      ruleId: diagnostic.pluginId,
      source: "core",
      severity: diagnostic.severity,
      message: diagnostic.message,
      file: diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
    }));
    const external: DisplayDiagnostic[] = externalDiagnostics.map((diagnostic) => ({
      id: diagnostic.id,
      ruleId: diagnostic.ruleId,
      source: diagnostic.source,
      severity:
        diagnostic.severity === "error"
          ? "danger"
          : diagnostic.severity === "warning"
            ? "warning"
            : "tidy",
      message: diagnostic.message,
      file: diagnostic.filePath,
      line: diagnostic.line,
      column: diagnostic.column,
      suggestion: diagnostic.suggestion,
    }));
    return [...core, ...external];
  }, [diagnostics, externalDiagnostics, node]);

  const blastGraph = getBlastRadiusGraph();
  const blast = useMemo(
    () => (node ? computeNodeBlastRadius(node.id, blastGraph.nodes, blastGraph.edges) : null),
    [blastGraph.edges, blastGraph.nodes, node],
  );

  const copyAiContext = async () => {
    if (!node || !blast) return;
    const contextDiagnostics: ExternalDiagnostic[] = displayDiagnostics.map((diagnostic) => ({
      id: diagnostic.id,
      ruleId: diagnostic.ruleId,
      source: diagnostic.source,
      severity:
        diagnostic.severity === "danger"
          ? "error"
          : diagnostic.severity === "warning"
            ? "warning"
            : "info",
      message: diagnostic.message,
      filePath: diagnostic.file,
      line: diagnostic.line,
      column: diagnostic.column,
      suggestion: diagnostic.suggestion,
    }));
    try {
      await navigator.clipboard.writeText(
        buildAiContextMarkdown(node, blast, blastGraph.nodes, contextDiagnostics),
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  const copyTargetedContext = async () => {
    if (!node) return;
    try {
      await navigator.clipboard.writeText(
        buildTargetedAiContextMarkdown(node, blastGraph.nodes, blastGraph.edges),
      );
      setNotice("Copied targeted context (reduced 90% tokens)");
      window.setTimeout(() => setNotice(null), 2_400);
    } catch {
      setNotice("Could not copy targeted context.");
      window.setTimeout(() => setNotice(null), 2_400);
    }
  };

  const isStylesheet =
    node?.kind === "style" || Boolean(node?.file.match(/\.(css|scss|sass|less|pcss)$/i));

  const health = displayDiagnostics.some((diagnostic) => diagnostic.severity === "danger")
    ? "danger"
    : displayDiagnostics.some((diagnostic) => diagnostic.severity === "warning")
      ? "warning"
      : displayDiagnostics.some((diagnostic) => diagnostic.severity === "tidy")
        ? "tidy"
        : "safe";
  const healthDot =
    health === "danger"
      ? "bg-rose-400"
      : health === "warning"
        ? "bg-amber-400"
        : health === "tidy"
          ? "bg-sky-400"
          : "bg-emerald-400";

  return (
    <aside
      role="dialog"
      aria-label="Inspector"
      aria-hidden={!node}
      className={`absolute right-0 top-0 z-40 flex h-full w-[420px] max-w-full flex-col border-l border-(--rg-border) bg-[#0c0c0e] shadow-2xl transition-transform duration-300 ease-out ${
        node ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {node ? (
        <>
          <header className="shrink-0 border-b border-(--rg-border) p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`size-2 shrink-0 rounded-full ${healthDot}`}
                    title={`Health: ${health}`}
                  />
                  <h2
                    className="truncate text-base font-semibold tracking-tight text-zinc-100"
                    title={node.name}
                  >
                    {formatComponentName(node.name)}
                  </h2>
                </div>
                <p className="mt-1 truncate font-mono text-xs text-zinc-500" title={node.file}>
                  {node.file}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void copyAiContext()}
                  className="flex items-center gap-1 rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2 py-1 text-[9px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
                  title="Copy compact architecture context for an AI agent"
                >
                  {copied ? <Check className="size-3" /> : <CopyIcon className="size-3" />}
                  {copied ? "Copied!" : "Copy AI Context"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close inspector"
                  className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copyTargetedContext()}
                className="flex items-center gap-1.5 rounded-md border border-zinc-700/70 bg-zinc-900/70 px-2.5 py-1.5 text-[9px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
              >
                <CopyIcon className="size-3" />
                Copy Targeted AI Context
              </button>
            </div>
            <BlastRadiusInfo blast={blast} />
            <DataFlowInfo dataFlow={node.meta?.dataFlow} />
            <PropsInfo props={node.meta?.props} />

            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Diagnostics
              </h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                {displayDiagnostics.length} {displayDiagnostics.length === 1 ? "issue" : "issues"}
              </span>
            </div>

            {displayDiagnostics.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] px-4 py-10 text-center">
                <CheckCircle2 className="size-5 text-emerald-400" />
                <p className="mt-2 text-[11px] leading-5 text-zinc-400">
                  {isStylesheet
                    ? "No issues detected for stylesheet."
                    : "No issues detected for this component."}
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {displayDiagnostics.map((diagnostic) => {
                  const meta = SEVERITY_META[diagnostic.severity];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={diagnostic.id}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider ${meta.badge}`}
                        >
                          <Icon className="size-2.5" />
                          {meta.label}
                        </span>
                        <span
                          className={`rounded border px-1.5 py-0.5 font-mono text-[8px] lowercase ${SOURCE_BADGE[diagnostic.source]}`}
                        >
                          {diagnostic.source}
                        </span>
                        <span className="truncate font-mono text-[8px] text-zinc-500">
                          {diagnostic.ruleId}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-zinc-300">
                        {diagnostic.message}
                      </p>
                      <p
                        className="mt-1.5 truncate font-mono text-[9px] text-zinc-600"
                        title={`${diagnostic.file}:${diagnostic.line ?? 1}:${diagnostic.column ?? 1}`}
                      >
                        {diagnostic.file}
                        {diagnostic.line ? `:${diagnostic.line}` : ""}
                        {diagnostic.column ? `:${diagnostic.column}` : ""}
                      </p>
                      {diagnostic.suggestion ? (
                        <p className="mt-1.5 text-[10px] leading-4 text-zinc-500">
                          {diagnostic.suggestion}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {notice ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 z-50 rounded-lg border border-emerald-400/30 bg-emerald-950/95 px-3 py-2 text-[10px] text-emerald-200 shadow-xl">
              {notice}
            </div>
          ) : null}
        </>
      ) : null}
    </aside>
  );
}
