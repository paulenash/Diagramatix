"use client";
/**
 * Client hook: per-category glyph edge buffers, module-cached + live (broadcasts
 * to other tabs on save), mirroring useArchimateIconLayout. Render surfaces pass
 * the returned map into effectiveIconLayout so category buffers take effect.
 */
import { useEffect, useState } from "react";
import type { CategoryBuffers } from "./iconLayout";

let cache: CategoryBuffers | null = null;
let inflight: Promise<CategoryBuffers> | null = null;
const subscribers = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("archimate-icon-buffer");
  channel.onmessage = () => { cache = null; inflight = null; subscribers.forEach((f) => f()); };
}

function load(): Promise<CategoryBuffers> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/admin/archimate-icon-buffers")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = (j?.buffers ?? {}) as CategoryBuffers; return cache!; })
      .catch(() => { cache = {}; return cache; });
  }
  return inflight;
}

export function invalidateArchimateIconBufferCache(broadcast = true) {
  cache = null; inflight = null;
  subscribers.forEach((f) => f());
  if (broadcast && channel) channel.postMessage("changed");
}

export function useArchimateIconBuffers(): CategoryBuffers {
  const [b, setB] = useState<CategoryBuffers>(cache ?? {});
  useEffect(() => {
    ensureChannel();
    let on = true;
    const refresh = () => { load().then((m) => { if (on) setB(m); }); };
    subscribers.add(refresh);
    refresh();
    return () => { on = false; subscribers.delete(refresh); };
  }, []);
  return b;
}
