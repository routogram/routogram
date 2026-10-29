import type { CollabPeer } from "../../hooks/use-collaboration";

type CollaborationStatusProps = {
  peers: CollabPeer[];
  presenterId: string | null;
  isPresenter: boolean;
  connected: boolean;
  onTogglePresenter: () => void;
};

export function CollaborationStatus({
  peers,
  presenterId,
  isPresenter,
  connected,
  onTogglePresenter,
}: CollaborationStatusProps) {
  if (!connected) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        {peers.length + 1} in review
      </span>
      <span className="h-3 w-px bg-white/10" />
      <button
        type="button"
        onClick={onTogglePresenter}
        className={`rounded-full border px-2 py-0.5 transition-colors ${
          isPresenter
            ? "border-sky-400/40 bg-sky-400/15 text-sky-200"
            : "border-white/10 text-slate-400 hover:border-sky-400/20 hover:text-sky-200"
        }`}
      >
        {isPresenter ? "Presenting" : presenterId ? "Follow presenter" : "Present"}
      </button>
    </div>
  );
}
