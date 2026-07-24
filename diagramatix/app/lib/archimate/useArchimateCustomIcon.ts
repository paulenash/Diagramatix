"use client";
/**
 * Client hook: the custom-icon assignment bundle { assignments, iconsById },
 * fetched once and cached at module scope so every ArchiMate shape shares one
 * request. Renders immediately with an empty bundle (built-in drawers), then
 * swaps in the saved assignments.
 */
import { useEffect, useState } from "react";
import type { CustomIconAssignments, CustomIconsById } from "./customIcon";

export interface CustomIconBundle { assignments: CustomIconAssignments; iconsById: CustomIconsById; }

const EMPTY: CustomIconBundle = { assignments: {}, iconsById: {} };
let cache: CustomIconBundle | null = null;
let inflight: Promise<CustomIconBundle> | null = null;

function load(): Promise<CustomIconBundle> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/admin/archimate-icons-custom")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = { assignments: j?.assignments ?? {}, iconsById: j?.icons ?? {} }; return cache!; })
      .catch(() => { cache = EMPTY; return cache; });
  }
  return inflight;
}

/** Drop the cache so the next mount refetches (call after an admin save). */
export function invalidateArchimateCustomIconCache() { cache = null; }

export function useArchimateCustomIcon(): CustomIconBundle {
  const [bundle, setBundle] = useState<CustomIconBundle>(cache ?? EMPTY);
  useEffect(() => {
    let on = true;
    load().then((b) => { if (on) setBundle(b); });
    return () => { on = false; };
  }, []);
  return bundle;
}
