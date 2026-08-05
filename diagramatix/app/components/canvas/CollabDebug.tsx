"use client";
/**
 * SuperAdmin-only diagnostic: a small fixed panel listing every OTHER Liveblocks
 * connection in the room and what it's broadcasting — heartbeat age, live edit /
 * connector counts, and how many of its connector ids the viewer does NOT have
 * locally (i.e. how many would render as ghosts). Lets us see the source of a
 * stale/lingering ghost directly instead of guessing.
 */
import { useOthers } from "@liveblocks/react";
import type { Connector } from "@/app/lib/diagram/types";

export function CollabDebug({ localConnectors }: { localConnectors: Connector[] }) {
  const others = useOthers();
  const localIds = new Set(localConnectors.map((c) => c.id));
  const now = Date.now();
  return (
    <div style={{ position: "fixed", left: 8, bottom: 8, zIndex: 9999, maxWidth: 360, pointerEvents: "none" }}
      className="rounded border border-fuchsia-400 bg-white/95 p-2 text-[10px] leading-tight font-mono shadow">
      <div className="font-bold text-fuchsia-700 mb-1">Collab debug — {others.length} other connection(s) · I have {localConnectors.length} connectors</div>
      {others.length === 0 && <div className="text-gray-400">none</div>}
      {others.map(({ connectionId, presence, info }) => {
        const age = presence.t ? Math.round((now - presence.t) / 1000) : null;
        const conns = presence.liveConns ?? [];
        const notMine = conns.filter((c) => !localIds.has(c.id)).length;
        const stale = !presence.t || now - presence.t > 15000;
        return (
          <div key={connectionId} className={stale ? "text-red-500" : "text-gray-700"}>
            #{connectionId} {info?.name ?? "?"} · hb {age == null ? "—" : `${age}s`}{stale ? " STALE" : ""} ·
            {" "}edits {presence.liveEdits?.length ?? 0} · conns {conns.length} (ghost {notMine}) · del {presence.liveDeletes?.length ?? 0}/{presence.liveConnDeletes?.length ?? 0}
          </div>
        );
      })}
    </div>
  );
}
