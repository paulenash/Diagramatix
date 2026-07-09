"use client";
/**
 * Client hook: the current APQC PCF level colour scheme, fetched once and cached
 * at module scope so every hierarchy view shares a single request. Renders
 * immediately with the built-in defaults, then swaps in the SuperAdmin scheme.
 */
import { useEffect, useState } from "react";
import { DEFAULT_PCF_LEVEL_COLORS, type PcfLevelColor } from "./levelColors";

let cache: PcfLevelColor[] | null = null;
let inflight: Promise<PcfLevelColor[]> | null = null;

function load(): Promise<PcfLevelColor[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/admin/pcf-colors")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = Array.isArray(j?.colors) && j.colors.length ? j.colors : DEFAULT_PCF_LEVEL_COLORS; return cache!; })
      .catch(() => { cache = DEFAULT_PCF_LEVEL_COLORS; return cache; });
  }
  return inflight;
}

export function usePcfLevelColors(): PcfLevelColor[] {
  const [colors, setColors] = useState<PcfLevelColor[]>(cache ?? DEFAULT_PCF_LEVEL_COLORS);
  useEffect(() => {
    let on = true;
    load().then((c) => { if (on) setColors(c); });
    return () => { on = false; };
  }, []);
  return colors;
}
