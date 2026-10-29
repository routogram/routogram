import type { FederatedApp } from "@/lib/apis";

type FederatedSwitcherProps = {
  apps: FederatedApp[];
  activeApp: string | null;
  conflictCount: number;
  onChange: (appId: string | null) => void;
};

export function FederatedSwitcher({
  apps,
  activeApp,
  conflictCount,
  onChange,
}: FederatedSwitcherProps) {
  if (apps.length < 2) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/[0.06] px-2 py-1">
      <span className="text-[9px] uppercase tracking-wider text-violet-300/80">Federation</span>
      <select
        value={activeApp ?? "__current"}
        onChange={(event) =>
          onChange(event.target.value === "__current" ? null : event.target.value)
        }
        className="max-w-36 truncate bg-transparent text-[10px] text-slate-300 outline-none"
        aria-label="Federated application"
      >
        <option value="__current">Current workspace</option>
        {apps.map((app) => (
          <option key={app.id} value={app.id}>
            {app.name} ({app.nodeCount})
          </option>
        ))}
      </select>
      {conflictCount > 0 ? (
        <span className="rounded-full bg-rose-400/15 px-1.5 py-0.5 text-[8px] text-rose-300">
          {conflictCount} conflicts
        </span>
      ) : null}
    </div>
  );
}
