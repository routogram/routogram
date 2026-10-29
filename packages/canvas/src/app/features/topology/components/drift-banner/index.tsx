import type { RoutogramDriftFinding } from "@routogram/types";
import { useState } from "react";

import { healDrift } from "@/lib/apis";

type DriftBannerProps = {
  findings: RoutogramDriftFinding[];
  onDismiss: () => void;
};

export function DriftBanner({ findings, onDismiss }: DriftBannerProps) {
  const [healing, setHealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (findings.length === 0) {
    return null;
  }
  const files = [...new Set(findings.flatMap((finding) => finding.files))];
  const first = findings[0];

  return (
    <div className="absolute inset-x-4 top-16 z-40 mx-auto max-w-3xl rounded-xl border border-rose-400/40 bg-[#21090d]/95 p-3 shadow-[0_0_30px_rgb(244_63_94/0.2)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-rose-300">
            Critical architecture drift
          </p>
          <p className="mt-1 text-xs text-rose-100">{first?.message}</p>
          {findings.length > 1 ? (
            <p className="mt-1 text-[10px] text-rose-300/70">
              +{findings.length - 1} more finding(s)
            </p>
          ) : null}
          {first?.suggestedFix ? (
            <p className="mt-1 text-[10px] text-slate-400">{first.suggestedFix}</p>
          ) : null}
          {error ? <p className="mt-1 text-[10px] text-rose-300">{error}</p> : null}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss drift alert"
          className="grid size-6 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-white/5 hover:text-slate-200"
        >
          ×
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={healing || files.length === 0}
          onClick={() => {
            setHealing(true);
            setError(null);
            void healDrift(files)
              .then(() => {
                window.dispatchEvent(new Event("routogram:refactor-applied"));
                onDismiss();
              })
              .catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason));
              })
              .finally(() => setHealing(false));
          }}
          className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[10px] text-rose-200 disabled:opacity-50"
        >
          {healing ? "Reverting…" : "Revert affected files"}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-[10px] text-slate-400"
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}
