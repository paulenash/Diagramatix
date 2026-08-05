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
import type { DiagramElement } from "@/app/lib/diagram/types";
import type { LiveEditEl } from "@/app/lib/collab/liveblocks";

const MAX_LIVE_EDITS = 80;       // cap the presence payload
const THROTTLE_MS = 120;
const GHOSTABLE = new Set<string>([
  "task", "subprocess", "subprocess-expanded", "subprocess-collapsed",
  "gateway", "start-event", "intermediate-event", "end-event",
  "data-object", "data-store", "text-annotation", "pool",
]); // skip lanes/sub-lanes — they'd be noisy and follow their pool anyway

export function CollabLiveEdits({ elements }: { elements: DiagramElement[] }) {
  const updateMyPresence = useUpdateMyPresence();
  // Baseline = the loaded (saved) state. Snapshotted on the first non-empty
  // render so both users share the same reference and don't ghost the whole
  // diagram on load.
  const baseline = useRef<Map<string, { x: number; y: number; label: string }> | null>(null);
  const lastSig = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (baseline.current === null && elements.length > 0) {
    baseline.current = new Map(elements.map((e) => [e.id, { x: Math.round(e.x), y: Math.round(e.y), label: e.label ?? "" }]));
  }

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const base = baseline.current;
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
      const sig = JSON.stringify(dirty);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        updateMyPresence({ liveEdits: dirty.length ? dirty : null });
      }
    }, THROTTLE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [elements, updateMyPresence]);

  // Clear our live edits when we leave.
  useEffect(() => () => { updateMyPresence({ liveEdits: null }); }, [updateMyPresence]);

  return null;
}
