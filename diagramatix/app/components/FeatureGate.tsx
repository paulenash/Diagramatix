"use client";

import { useEffect, useState } from "react";
import { current, load, refresh, refreshIfStale, subscribe } from "@/app/lib/features/featureStateStore";

export type FeatureState = "available" | "disabled" | "hidden";
type StateMap = Record<string, FeatureState>;

/** Re-read the feature states now — after an upgrade, a comp grant, impersonation or an admin edit. */
export function refreshFeatureStates(): Promise<unknown> { return refresh(); }

const RETRY_MS = 5000;
const MAX_RETRIES = 3;

/** The signed-in user's feature-state map. `ready` is false until a fetch has SUCCEEDED
 *  (a failure is retried, never kept as "everything hidden"). Refreshes when the tab
 *  regains focus after a minute. UX-only; the server re-enforces. */
export function useFeatureStates(): { states: StateMap; ready: boolean } {
  const [states, setStates] = useState<StateMap>(current() ?? {});
  const [ready, setReady] = useState<boolean>(!!current());
  useEffect(() => {
    let on = true;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cb = (m: StateMap) => { if (on) { setStates(m); setReady(true); } };
    const unsub = subscribe(cb);
    const attempt = () => {
      void load().then((m) => {
        if (!on) return;
        if (m) cb(m);
        else if (retries++ < MAX_RETRIES) timer = setTimeout(attempt, RETRY_MS);
      });
    };
    attempt();
    const onWake = () => { if (typeof document === "undefined" || document.visibilityState === "visible") refreshIfStale(); };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      on = false; unsub();
      if (timer) clearTimeout(timer);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
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
