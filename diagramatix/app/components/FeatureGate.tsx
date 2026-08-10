"use client";

import { useEffect, useState } from "react";

export type FeatureState = "available" | "disabled" | "hidden";
type StateMap = Record<string, FeatureState>;

// Module-cached so many components share one /api/features fetch (like useOrgPolicy).
let cache: StateMap | null = null;
let inflight: Promise<StateMap> | null = null;
const subs = new Set<(m: StateMap) => void>();

function load(): Promise<StateMap> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/features")
      .then((r) => (r.ok ? r.json() : { states: {} }))
      .then((j) => { cache = (j.states ?? {}) as StateMap; subs.forEach((f) => f(cache!)); return cache; })
      .catch(() => { cache = {}; return cache; });
  }
  return inflight;
}

/** The signed-in user's feature-state map. Optimistically empty (everything hidden)
 *  until loaded — so the caller must treat "not yet loaded" carefully; use the
 *  `ready` flag if a flash matters. UX-only; the server re-enforces. */
export function useFeatureStates(): { states: StateMap; ready: boolean } {
  const [states, setStates] = useState<StateMap>(cache ?? {});
  const [ready, setReady] = useState<boolean>(!!cache);
  useEffect(() => {
    let on = true;
    const cb = (m: StateMap) => { if (on) { setStates(m); setReady(true); } };
    subs.add(cb);
    void load().then(cb);
    return () => { subs.delete(cb); on = false; };
  }, []);
  return { states, ready };
}

export function useFeatureState(key: string): FeatureState {
  const { states } = useFeatureStates();
  return states[key] ?? "hidden";
}

/**
 * Gate children on a feature's availability:
 *   available → render normally
 *   disabled  → render greyed + non-interactive (title explains) when mode="disable",
 *               otherwise hidden
 *   hidden    → render nothing
 * Until the state map loads, `pendingVisible` (default true) decides whether to show
 * to avoid a flash of missing menu items for entitled users.
 */
export function FeatureGate({
  feature,
  mode = "hide",
  disabledTitle = "Not available on your subscription",
  pendingVisible = true,
  children,
}: {
  feature: string;
  mode?: "hide" | "disable";
  disabledTitle?: string;
  pendingVisible?: boolean;
  children: React.ReactNode;
}) {
  const { states, ready } = useFeatureStates();
  const state = ready ? (states[feature] ?? "hidden") : (pendingVisible ? "available" : "hidden");

  if (state === "available") return <>{children}</>;
  if (state === "hidden") return null;
  // disabled
  if (mode === "hide") return null;
  return (
    <span title={disabledTitle} aria-disabled className="opacity-40 pointer-events-none select-none">
      {children}
    </span>
  );
}
