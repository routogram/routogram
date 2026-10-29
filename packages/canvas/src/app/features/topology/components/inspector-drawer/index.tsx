import type { Diagnostic } from "@routogram/plugin-core";
import type { ComponentPropMeta, NodeDataFlowMeta, RoutogramNode } from "@routogram/types";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from "lucide-react";

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
  const isStylesheet =
    node?.kind === "style" || Boolean(node?.file.match(/\.(css|scss|sass|less|pcss)$/i));

  const health = diagnostics.some((diagnostic) => diagnostic.severity === "danger")
    ? "danger"
    : diagnostics.some((diagnostic) => diagnostic.severity === "warning")
      ? "warning"
      : diagnostics.some((diagnostic) => diagnostic.severity === "tidy")
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
              <button
                type="button"
                onClick={onClose}
                aria-label="Close inspector"
                className="grid size-7 shrink-0 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200"
              >
                <X className="size-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <DataFlowInfo dataFlow={node.meta?.dataFlow} />
            <PropsInfo props={node.meta?.props} />

            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Diagnostics
              </h3>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[9px] text-zinc-400">
                {diagnostics.length} {diagnostics.length === 1 ? "issue" : "issues"}
              </span>
            </div>

            {diagnostics.length === 0 ? (
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
                {diagnostics.map((diagnostic) => {
                  const meta = SEVERITY_META[diagnostic.severity];
                  const Icon = meta.icon;
                  return (
                    <li
                      key={diagnostic.id}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wider ${meta.badge}`}
                        >
                          <Icon className="size-2.5" />
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-5 text-zinc-300">
                        {diagnostic.message}
                      </p>
                      <p
                        className="mt-1.5 truncate font-mono text-[9px] text-zinc-600"
                        title={`${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`}
                      >
                        {diagnostic.file}:{diagnostic.line}:{diagnostic.column}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </aside>
  );
}
