"use client";
/**
 * Client hook: the SuperAdmin ArchiMate icon-layout overrides, fetched once and
 * cached at module scope so every shape shares one request. Renders immediately
 * with no overrides (defaults), then swaps in the saved map.
 */
import { useEffect, useState } from "react";
import type { IconLayoutOverrides } from "./iconLayout";

let cache: IconLayoutOverrides | null = null;
let inflight: Promise<IconLayoutOverrides> | null = null;

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

/** Drop the cache so the next mount refetches (call after an admin save). */
export function invalidateArchimateIconLayoutCache() { cache = null; }

export function useArchimateIconLayout(): IconLayoutOverrides {
  const [ov, setOv] = useState<IconLayoutOverrides>(cache ?? {});
  useEffect(() => {
    let on = true;
    load().then((m) => { if (on) setOv(m); });
    return () => { on = false; };
  }, []);
  return ov;
}
