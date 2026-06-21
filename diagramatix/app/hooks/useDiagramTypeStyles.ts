"use client";

/**
 * Client hook that resolves a diagram-type style, layering SuperAdmin
 * overrides (from /api/diagram-type-styles) over the static defaults.
 *
 * The fetch is cached at module scope so it runs once per session no
 * matter how many badges are mounted. Until it resolves (and on failure)
 * the static defaults are used, so first paint always shows the correct
 * codes/colours — overrides just hydrate on top if an admin changed them.
 */

import { useEffect, useState } from "react";
import {
  resolveDiagramTypeStyle,
  type DiagramTypeStyle,
  type DiagramTypeStyleOverrides,
} from "@/app/lib/diagram/diagramTypeStyles";

let cache: DiagramTypeStyleOverrides | null = null;
let inflight: Promise<DiagramTypeStyleOverrides> | null = null;

function fetchOverrides(): Promise<DiagramTypeStyleOverrides> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch("/api/diagram-type-styles")
    .then((r) => (r.ok ? r.json() : { styles: [] }))
    .then((data: { styles?: DiagramTypeStyle[] }) => {
      const ov: DiagramTypeStyleOverrides = {};
      for (const s of data.styles ?? []) {
        ov[s.typeKey] = { code: s.code, bgColor: s.bgColor, textColor: s.textColor, sortOrder: s.sortOrder };
      }
      cache = ov;
      return ov;
    })
    .catch(() => ({} as DiagramTypeStyleOverrides))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Drop the cache so the next mount refetches (call after an admin save). */
export function invalidateDiagramTypeStyleCache() {
  cache = null;
}

/**
 * Returns a resolver `(typeKey) => DiagramTypeStyle`. Stable enough to call
 * inline during render.
 */
export function useDiagramTypeStyles(): (type: string | null | undefined) => DiagramTypeStyle {
  const [overrides, setOverrides] = useState<DiagramTypeStyleOverrides>(cache ?? {});
  useEffect(() => {
    let active = true;
    fetchOverrides().then((ov) => {
      if (active) setOverrides(ov);
    });
    return () => {
      active = false;
    };
  }, []);
  return (type) => resolveDiagramTypeStyle(type, overrides);
}
