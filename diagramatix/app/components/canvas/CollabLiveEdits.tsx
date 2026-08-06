"use client";
/**
 * Co-authoring Approach A — LIVE PREVIEW (sender half). Broadcasts the elements
 * this user has changed vs the loaded diagram (moved / renamed / added) into
 * their Liveblocks presence, so every other editor can render them as ghosts in
 * real time. The authoritative document is still each user's own; the real
 * merge happens on save (unchanged). Non-visual — renders nothing.
 */
import { useEffect, useRef } from "react";
import { useUpdateMyPresence } from "@liveblocks/react";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";
import type { LiveEditEl, LiveEditConn } from "@/app/lib/collab/liveblocks";

const MAX_LIVE_EDITS = 80;       // cap the presence payload
const MAX_LIVE_CONNS = 80;
const THROTTLE_MS = 120;
const GHOSTABLE = new Set<string>([
  "task", "subprocess", "subprocess-expanded", "subprocess-collapsed",
  "gateway", "start-event", "intermediate-event", "end-event",
  "data-object", "data-store", "text-annotation", "pool",
  "review-comment", // co-authoring: a new note must ghost to peers, not just its tether (item L)
]); // skip lanes/sub-lanes — they'd be noisy and follow their pool anyway

export function CollabLiveEdits({
  elements,
  connectors,
  baselineElements,
  baselineConnectors,
  broadcast = true,
}: {
  elements: DiagramElement[];
  connectors: Connector[];
  // The last SYNCED (committed) sets — used only to detect DELETIONS (an id that
  // was committed but is gone from my local copy → a red delete ghost).
  baselineElements: DiagramElement[];
  baselineConnectors: Connector[];
  broadcast?: boolean;
}) {
  const updateMyPresence = useUpdateMyPresence();
  const lastSig = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A Viewer session doesn't broadcast its edits — clear any it had and stop.
  useEffect(() => {
    if (!broadcast) { updateMyPresence({ liveEdits: null, liveConns: null, liveDeletes: null, liveConnDeletes: null }); lastSig.current = ""; }
  }, [broadcast, updateMyPresence]);

  useEffect(() => {
    if (!broadcast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Broadcast our FULL ghostable state (not a diff vs our own baseline) — the
      // receiver renders only what differs from THEIR copy, so a ghost persists
      // until the viewer syncs, and doesn't vanish the moment WE sync.
      const full: LiveEditEl[] = [];
      for (const e of elements) {
        if (!GHOSTABLE.has(e.type)) continue;
        full.push({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), label: e.label ?? "", t: e.type });
        if (full.length >= MAX_LIVE_EDITS) break;
      }
      const fullConns: LiveEditConn[] = [];
      for (const c of connectors) {
        // Only the VISIBLE waypoints — strip the invisible leader points that run
        // to each element's centre, so the ghost line looks like the real one
        // (boundary to boundary), not spokes to the middles.
        const wps = c.waypoints ?? [];
        const s = c.sourceInvisibleLeader ? 1 : 0;
        const e = c.targetInvisibleLeader ? Math.max(s + 1, wps.length - 1) : wps.length;
        const vis = wps.slice(s, e);
        fullConns.push({
          id: c.id,
          pts: vis.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
          label: c.label ?? "", t: c.type,
          ...(c.labelOffsetX != null ? { lox: Math.round(c.labelOffsetX) } : {}),
          ...(c.labelOffsetY != null ? { loy: Math.round(c.labelOffsetY) } : {}),
        });
        if (fullConns.length >= MAX_LIVE_CONNS) break;
      }
      // Deletions: in the synced baseline but gone from my local copy.
      const liveIds = new Set(elements.map((e) => e.id));
      const deletes: string[] = [];
      for (const b of baselineElements) {
        if (GHOSTABLE.has(b.type) && !liveIds.has(b.id)) { deletes.push(b.id); if (deletes.length >= MAX_LIVE_EDITS) break; }
      }
      const liveConnIds = new Set(connectors.map((c) => c.id));
      const connDeletes: string[] = [];
      for (const b of baselineConnectors) {
        if (!liveConnIds.has(b.id)) { connDeletes.push(b.id); if (connDeletes.length >= MAX_LIVE_CONNS) break; }
      }
      const sig = JSON.stringify(full) + "#" + JSON.stringify(fullConns) + "#" + deletes.join(",") + "#" + connDeletes.join(",");
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        updateMyPresence({
          liveEdits: full.length ? full : null,
          liveConns: fullConns.length ? fullConns : null,
          liveDeletes: deletes.length ? deletes : null,
          liveConnDeletes: connDeletes.length ? connDeletes : null,
        });
      }
    }, THROTTLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [elements, connectors, baselineElements, baselineConnectors, broadcast, updateMyPresence]);

  // Clear our live edits when we leave.
  useEffect(() => () => { updateMyPresence({ liveEdits: null, liveConns: null, liveDeletes: null, liveConnDeletes: null }); }, [updateMyPresence]);

  return null;
}
