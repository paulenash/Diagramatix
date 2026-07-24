"use client";
/**
 * Client hook: the SuperAdmin ArchiMate icon-layout overrides, fetched once and
 * cached at module scope so every shape shares one request. Renders immediately
 * with no overrides (defaults), then swaps in the saved map.
 *
 * Live updates: after a save, invalidate…Cache() drops the cache AND notifies
 * every mounted consumer to refetch — in this tab and, via a BroadcastChannel,
 * in any other open tab — so existing diagrams reflect the change without reload.
 */
import { useEffect, useState } from "react";
import type { IconLayoutOverrides } from "./iconLayout";

let cache: IconLayoutOverrides | null = null;
let inflight: Promise<IconLayoutOverrides> | null = null;
const subscribers = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("archimate-icon-layout");
  channel.onmessage = () => { cache = null; inflight = null; subscribers.forEach((f) => f()); };
}

function load(): Promise<IconLayoutOverrides> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/admin/archimate-icons")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = (j?.overrides ?? {}) as IconLayoutOverrides; return cache!; })
      .catch(() => { cache = {}; return cache; });
  }
  return inflight;
}

/** Drop the cache + notify every mounted consumer (this tab and others) to refetch. */
export function invalidateArchimateIconLayoutCache(broadcast = true) {
  cache = null; inflight = null;
  subscribers.forEach((f) => f());
  if (broadcast && channel) channel.postMessage("changed");
}

export function useArchimateIconLayout(): IconLayoutOverrides {
  const [ov, setOv] = useState<IconLayoutOverrides>(cache ?? {});
  useEffect(() => {
    ensureChannel();
    let on = true;
    const refresh = () => { load().then((m) => { if (on) setOv(m); }); };
    subscribers.add(refresh);
    refresh();
    return () => { on = false; subscribers.delete(refresh); };
  }, []);
  return ov;
}
