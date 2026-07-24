"use client";
/**
 * Client hook: the set of element names that surface a separate icon-only palette
 * entry. Module-cached + live (broadcasts to other tabs on save). Renders with the
 * default set until loaded, so the Symbols Panel is never briefly wrong.
 */
import { useEffect, useState } from "react";
import { DEFAULT_SEPARATE_ICONS } from "./paletteRows";

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;
const subscribers = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function ensureChannel() {
  if (channel || typeof BroadcastChannel === "undefined") return;
  channel = new BroadcastChannel("archimate-separate-icon");
  channel.onmessage = () => { cache = null; inflight = null; subscribers.forEach((f) => f()); };
}

function load(): Promise<Set<string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/admin/archimate-separate-icons")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = new Set<string>(Array.isArray(j?.names) ? j.names : DEFAULT_SEPARATE_ICONS); return cache!; })
      .catch(() => { cache = new Set(DEFAULT_SEPARATE_ICONS); return cache; });
  }
  return inflight;
}

export function invalidateArchimateSeparateIconCache(broadcast = true) {
  cache = null; inflight = null;
  subscribers.forEach((f) => f());
  if (broadcast && channel) channel.postMessage("changed");
}

export function useArchimateSeparateIcons(): Set<string> {
  const [names, setNames] = useState<Set<string>>(cache ?? new Set(DEFAULT_SEPARATE_ICONS));
  useEffect(() => {
    ensureChannel();
    let on = true;
    const refresh = () => { load().then((s) => { if (on) setNames(new Set(s)); }); };
    subscribers.add(refresh);
    refresh();
    return () => { on = false; subscribers.delete(refresh); };
  }, []);
  return names;
}
