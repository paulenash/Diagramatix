"use client";
/**
 * Client hook: the custom-icon assignment bundle { assignments, iconsById },
 * fetched once and cached at module scope so every ArchiMate shape shares one
 * request. Renders immediately with an empty bundle (built-in drawers), then
 * swaps in the saved assignments.
 *
 * Live updates: after a SuperAdmin saves an assignment, invalidate…Cache() drops
 * the cache AND notifies every mounted consumer (canvas shapes + palette preview)
 * to refetch — in this tab and, via a BroadcastChannel, in any other open tab —
 * so existing diagrams reflect the change without a reload.
 */
import { useEffect, useState } from "react";
import type { CustomIconAssignments, CustomIconsById } from "./customIcon";

export interface CustomIconBundle { assignments: CustomIconAssignments; iconsById: CustomIconsById; }

const EMPTY: CustomIconBundle = { assignments: {}, iconsById: {} };
let cache: CustomIconBundle | null = null;
let inflight: Promise<CustomIconBundle> | null = null;
const subscribers = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("archimate-custom-icon");
  channel.onmessage = () => { cache = null; inflight = null; subscribers.forEach((f) => f()); };
}

function fetchBundle(): Promise<CustomIconBundle> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/admin/archimate-icons-custom")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = { assignments: j?.assignments ?? {}, iconsById: j?.icons ?? {} }; return cache!; })
      .catch(() => { cache = EMPTY; return cache; });
  }
  return inflight;
}

/** Drop the cache + notify every mounted consumer (this tab and others) to refetch. */
export function invalidateArchimateCustomIconCache(broadcast = true) {
  cache = null; inflight = null;
  subscribers.forEach((f) => f());
  if (broadcast && channel) channel.postMessage("changed");
}

export function useArchimateCustomIcon(): CustomIconBundle {
  const [bundle, setBundle] = useState<CustomIconBundle>(cache ?? EMPTY);
  useEffect(() => {
    ensureChannel();
    let on = true;
    const refresh = () => { fetchBundle().then((b) => { if (on) setBundle(b); }); };
    subscribers.add(refresh);
    refresh();
    return () => { on = false; subscribers.delete(refresh); };
  }, []);
  return bundle;
}
