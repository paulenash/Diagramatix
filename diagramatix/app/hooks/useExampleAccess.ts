"use client";

import { useEffect, useState } from "react";

/** Mirror of the server's ExampleAccess (app/lib/features/exampleAccess.ts). */
export interface ExampleAccessState { examplesOnly: boolean; allowed: number | null }

const OPEN: ExampleAccessState = { examplesOnly: false, allowed: null };
let cache: ExampleAccessState | null = null;
let inflight: Promise<ExampleAccessState> | null = null;

function load(): Promise<ExampleAccessState> {
  if (cache) return Promise.resolve(cache);
  inflight ??= fetch("/api/example-access")
    .then((r) => (r.ok ? r.json() : OPEN))
    .then((j: ExampleAccessState) => { cache = j; return j; })
    .catch(() => OPEN)             // a failed read must not lock anyone out of the UI; the server still enforces
    .finally(() => { inflight = null; });
  return inflight;
}

/** Pure: may `kind` be entered on a project of this exampleType? */
export function canEnter(access: ExampleAccessState, kind: "simulator" | "processMining", exampleType: string | null | undefined): boolean {
  if (!access.examplesOnly) return true;
  return exampleType === (kind === "simulator" ? "simulation" : "mining");
}

export const EXAMPLES_ONLY_TITLE = "Your plan includes the Simulator and Process Mining on the ready-made examples only — upgrade to use them on your own work";

export function useExampleAccess(): ExampleAccessState {
  const [a, setA] = useState<ExampleAccessState>(cache ?? OPEN);
  useEffect(() => {
    let on = true;
    void load().then((j) => { if (on) setA(j); });
    return () => { on = false; };
  }, []);
  return a;
}
