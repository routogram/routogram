import { useMemo } from "react";

import type { RefactorResult } from "@/lib/apis";

type DiffModalProps = {
  preview: RefactorResult;
  applying: boolean;
  error: string | null;
  onApply: () => void;
  onClose: () => void;
};

export function DiffModal({ preview, applying, error, onApply, onClose }: DiffModalProps) {
  const lines = useMemo(() => {
    let offset = 0;
    return preview.diff.split("\n").map((line) => {
      const key = `${offset}:${line.slice(0, 24)}`;
      offset += line.length + 1;
      return { key, line };
    });
  }, [preview.diff]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={preview.title}
    >
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b1020] shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-sky-300/70">
              Auto-Fix Preview
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">{preview.title}</h2>
            <p className="mt-1 text-xs text-slate-400">{preview.summary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close diff preview"
            className="grid size-7 shrink-0 place-items-center rounded-md text-lg leading-none text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="shrink-0 border-b border-white/10 px-5 py-3 lg:w-56 lg:border-r lg:border-b-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Files</p>
            <ul className="mt-2 space-y-1.5">
              {preview.files.map((file) => (
                <li key={file.path} className="flex items-center gap-2 font-mono text-[10px]">
                  <span
                    className={`rounded px-1 py-0.5 text-[8px] uppercase ${
                      file.isNew
                        ? "bg-emerald-400/15 text-emerald-300"
                        : "bg-amber-400/15 text-amber-300"
                    }`}
                  >
                    {file.isNew ? "new" : "edit"}
                  </span>
                  <span className="truncate text-slate-300" title={file.path}>
                    {file.path}
                  </span>
                </li>
              ))}
            </ul>
          </aside>

          <div className="min-h-0 flex-1 overflow-auto bg-[#080c18] px-4 py-3 font-mono text-[11px] leading-5">
            {lines.map(({ key, line }) => {
              const className =
                line.startsWith("+++") || line.startsWith("---")
                  ? "text-slate-500"
                  : line.startsWith("@@")
                    ? "text-sky-300"
                    : line.startsWith("+")
                      ? "bg-emerald-400/10 text-emerald-300"
                      : line.startsWith("-")
                        ? "bg-rose-400/10 text-rose-300"
                        : "text-slate-400";
              return (
                <pre key={key} className={`whitespace-pre-wrap break-all px-2 ${className}`}>
                  {line || " "}
                </pre>
              );
            })}
          </div>
        </div>

        {preview.warnings.length > 0 ? (
          <div className="shrink-0 border-t border-amber-400/10 bg-amber-400/[0.04] px-5 py-2 text-[10px] leading-4 text-amber-300/80">
            {preview.warnings.join(" ")}
          </div>
        ) : null}

        {error ? (
          <p className="shrink-0 border-t border-rose-400/15 bg-rose-400/[0.05] px-5 py-2 text-[11px] text-rose-300">
            {error}
          </p>
        ) : null}

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <p className="text-[10px] text-slate-500">
            Nothing is written until you confirm. Files are re-checked before commit.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApply}
              disabled={applying || !preview.changed}
              className="rounded-lg border border-emerald-400/30 bg-emerald-400/15 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applying ? "Applying…" : "Apply Fix"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
