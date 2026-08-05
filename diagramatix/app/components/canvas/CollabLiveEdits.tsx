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
]); // skip lanes/sub-lanes — they'd be noisy and follow their pool anyway

const connSig = (c: Connector) => `${(c.waypoints ?? []).map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(";")}|${c.label ?? ""}|${c.labelOffsetX ?? ""},${c.labelOffsetY ?? ""}`;

export function CollabLiveEdits({ elements, connectors, broadcast = true }: { elements: DiagramElement[]; connectors: Connector[]; broadcast?: boolean }) {
  const updateMyPresence = useUpdateMyPresence();
  // Baseline = the loaded (saved) state. Snapshotted on the first non-empty
  // render so both users share the same reference and don't ghost the whole
  // diagram on load.
  const baseEls = useRef<Map<string, { x: number; y: number; label: string }> | null>(null);
  const baseConns = useRef<Map<string, string> | null>(null);
  const lastSig = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (baseEls.current === null && elements.length > 0) {
    baseEls.current = new Map(elements.map((e) => [e.id, { x: Math.round(e.x), y: Math.round(e.y), label: e.label ?? "" }]));
    baseConns.current = new Map(connectors.map((c) => [c.id, connSig(c)]));
  }

  // A Viewer session doesn't broadcast its edits — clear any it had and stop.
  useEffect(() => {
    if (!broadcast) { updateMyPresence({ liveEdits: null, liveConns: null }); lastSig.current = ""; }
  }, [broadcast, updateMyPresence]);

  useEffect(() => {
    if (!broadcast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const base = baseEls.current;
      if (!base) return;
      const dirty: LiveEditEl[] = [];
      for (const e of elements) {
        if (!GHOSTABLE.has(e.type)) continue;
        const b = base.get(e.id);
        const x = Math.round(e.x), y = Math.round(e.y), label = e.label ?? "";
        const changed = !b || b.x !== x || b.y !== y || b.label !== label;
        if (changed) {
          dirty.push({ id: e.id, x, y, w: Math.round(e.width), h: Math.round(e.height), label, t: e.type });
          if (dirty.length >= MAX_LIVE_EDITS) break;
        }
      }
      // Connectors changed vs baseline (added / rerouted / relabelled).
      const dirtyConns: LiveEditConn[] = [];
      const cbase = baseConns.current;
      for (const c of connectors) {
        const sig = connSig(c);
        if (!cbase || cbase.get(c.id) !== sig) {
          dirtyConns.push({
            id: c.id,
            pts: (c.waypoints ?? []).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
            label: c.label ?? "", t: c.type,
            ...(c.labelOffsetX != null ? { lox: Math.round(c.labelOffsetX) } : {}),
            ...(c.labelOffsetY != null ? { loy: Math.round(c.labelOffsetY) } : {}),
          });
          if (dirtyConns.length >= MAX_LIVE_CONNS) break;
        }
      }
      const sig = JSON.stringify(dirty) + "#" + JSON.stringify(dirtyConns);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        updateMyPresence({ liveEdits: dirty.length ? dirty : null, liveConns: dirtyConns.length ? dirtyConns : null });
      }
    }, THROTTLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [elements, connectors, updateMyPresence]);

  // Clear our live edits when we leave.
  useEffect(() => () => { updateMyPresence({ liveEdits: null, liveConns: null }); }, [updateMyPresence]);

  return null;
}
