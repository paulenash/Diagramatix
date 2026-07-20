"use client";
/**
 * Client hook: the current Feature Colours scheme, fetched once and cached at
 * module scope so every menu / tile / editor shares a single request. Renders
 * immediately with the built-in defaults, then swaps in the SuperAdmin scheme.
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_FEATURE_SCHEME, resolveFeatureScheme, type FeatureColorScheme,
} from "@/app/lib/theme/featureColors";

let cache: FeatureColorScheme | null = null;
let inflight: Promise<FeatureColorScheme> | null = null;

function load(): Promise<FeatureColorScheme> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/admin/feature-colors")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { cache = resolveFeatureScheme(j?.scheme); return cache!; })
      .catch(() => { cache = DEFAULT_FEATURE_SCHEME; return cache; });
  }
  return inflight;
}

export function useFeatureColors(): FeatureColorScheme {
  const [scheme, setScheme] = useState<FeatureColorScheme>(cache ?? DEFAULT_FEATURE_SCHEME);
  useEffect(() => {
    let on = true;
    load().then((s) => { if (on) setScheme(s); });
    return () => { on = false; };
  }, []);
  return scheme;
}
