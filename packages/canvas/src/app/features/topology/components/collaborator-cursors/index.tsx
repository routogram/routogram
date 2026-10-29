import type { CollabPeer } from "../../hooks/use-collaboration";

type CollaboratorCursorsProps = {
  peers: CollabPeer[];
  connected: boolean;
};

export function CollaboratorCursors({ peers, connected }: CollaboratorCursorsProps) {
  if (!connected) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {peers.map((peer) =>
        peer.cursor ? (
          <div
            key={peer.id}
            className="absolute transition-[left,top] duration-75 ease-linear"
            style={{
              left: `${peer.cursor.x * 100}%`,
              top: `${peer.cursor.y * 100}%`,
              transform: "translate(-2px, -2px)",
            }}
          >
            <svg
              width="18"
              height="22"
              viewBox="0 0 18 22"
              fill="none"
              aria-hidden="true"
              style={{ filter: "drop-shadow(0 2px 4px rgb(0 0 0 / 0.45))" }}
            >
              <path
                d="M2 2L15.5 11.2L9.2 12.4L6.3 19L2 2Z"
                fill={peer.color}
                stroke="#0b1020"
                strokeWidth="1.4"
              />
            </svg>
            <span
              className="ml-2 inline-block max-w-32 truncate rounded px-1.5 py-0.5 text-[9px] font-medium text-slate-950"
              style={{ background: peer.color }}
            >
              {peer.name}
            </span>
          </div>
        ) : null,
      )}
    </div>
  );
}
