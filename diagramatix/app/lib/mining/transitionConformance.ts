/**
 * State-change conformance: replay the mined entity behaviour (variants) over a
 * REFERENCE state machine (a stored `state-machine` diagram = the single source
 * of truth) and report where reality deviates. Mirrors the Violation-style
 * pattern of app/lib/diagram/checks. Pure.
 *
 * The reference is matched by LABEL: state labels ↔ the log's state values,
 * event ↔ the transition's triggering activity. Fitness = the fraction of cases
 * whose whole state sequence replays cleanly (the Signavio conformance headline).
 */
import type { Variant } from "./types";

const SEP = String.fromCharCode(1);
const key = (a: string, b: string) => a + SEP + b;
const unkey = (k: string): [string, string] => { const i = k.indexOf(SEP); return [k.slice(0, i), k.slice(i + 1)]; };

/** The subset of a state-machine DiagramData the checker reads. */
export interface ReferenceSm {
  elements: { id: string; type: string; label?: string }[];
  connectors: { id: string; sourceId: string; targetId: string; type: string; transitionGuard?: string }[];
}

export interface ConformanceViolation {
  rule: "undocumented-transition" | "unknown-state" | "unexpected-entry" | "unexpected-exit" | "dead-transition";
  severity: "error" | "warning";
  message: string;
  cases: number;                 // cases exhibiting it (frequency-weighted)
  ids?: string[];                // reference element/connector ids (for the overlay)
  data?: Record<string, unknown>;
}

export interface TransitionStat { from: string; to: string; observed: number; inReference: boolean; refConnectorId?: string }

export interface ConformanceResult {
  fitness: number;               // 0..1
  totalCases: number;
  conformingCases: number;
  violations: ConformanceViolation[];
  transitionStats: TransitionStat[];
}

export function checkTransitionConformance(variants: Variant[], ref: ReferenceSm): ConformanceResult {
  // ── Parse the reference ──
  const kindById = new Map<string, { label: string; kind: string }>();
  for (const e of ref.elements) {
    if (e.type === "state" || e.type === "initial-state" || e.type === "final-state") {
      kindById.set(e.id, { label: (e.label ?? "").trim(), kind: e.type });
    }
  }
  const refStates = new Set<string>();
  for (const v of kindById.values()) if (v.kind === "state" && v.label) refStates.add(v.label);
  const refEdges = new Map<string, string>();   // "from→to" → connector id
  const guarded = new Set<string>();
  const refEntry = new Set<string>();
  const refExit = new Set<string>();
  for (const c of ref.connectors) {
    if (c.type !== "transition") continue;
    const s = kindById.get(c.sourceId), t = kindById.get(c.targetId);
    if (!s || !t) continue;
    if (s.kind === "initial-state" && t.kind === "state") refEntry.add(t.label);
    else if (t.kind === "final-state" && s.kind === "state") refExit.add(s.label);
    else if (s.kind === "state" && t.kind === "state") {
      const k = key(s.label, t.label);
      refEdges.set(k, c.id);
      if (c.transitionGuard) guarded.add(k);
    }
  }

  // ── Replay each variant ──
  const totalCases = variants.reduce((a, v) => a + v.count, 0);
  let conformingCases = 0;
  const undoc = new Map<string, number>(), unknown = new Map<string, number>();
  const badEntry = new Map<string, number>(), badExit = new Map<string, number>();
  const observed = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  for (const v of variants) {
    const S = v.states;
    const seenUndoc = new Set<string>(), seenUnknown = new Set<string>();
    for (const s of S) if (s && !refStates.has(s)) seenUnknown.add(s);
    for (let i = 1; i < S.length; i++) {
      const from = S[i - 1], to = S[i];
      if (!from || !to) continue;
      const k = key(from, to);
      bump(observed, k, v.count);
      if (!refEdges.has(k)) seenUndoc.add(k);
    }
    const first = S[0], last = S[S.length - 1];
    const entryBad = refEntry.size > 0 && first ? !refEntry.has(first) : false;
    const exitBad = refExit.size > 0 && last ? !refExit.has(last) : false;

    const clean = seenUndoc.size === 0 && seenUnknown.size === 0 && !entryBad && !exitBad;
    if (clean) conformingCases += v.count;
    for (const k of seenUndoc) bump(undoc, k, v.count);
    for (const s of seenUnknown) bump(unknown, s, v.count);
    if (entryBad && first) bump(badEntry, first, v.count);
    if (exitBad && last) bump(badExit, last, v.count);
  }

  // ── Assemble violations ──
  const violations: ConformanceViolation[] = [];
  for (const [k, cases] of undoc) { const [from, to] = unkey(k); violations.push({ rule: "undocumented-transition", severity: "error", message: `Undocumented transition: ${from} → ${to}`, cases, data: { from, to } }); }
  for (const [s, cases] of unknown) violations.push({ rule: "unknown-state", severity: "error", message: `State "${s}" is not in the reference`, cases, data: { state: s } });
  for (const [s, cases] of badEntry) violations.push({ rule: "unexpected-entry", severity: "warning", message: `Cases start in "${s}", not a reference entry state`, cases, data: { state: s } });
  for (const [s, cases] of badExit) violations.push({ rule: "unexpected-exit", severity: "warning", message: `Cases end in "${s}", not a reference final state`, cases, data: { state: s } });
  for (const [k, connId] of refEdges) if (!observed.has(k)) { const [from, to] = unkey(k); violations.push({ rule: "dead-transition", severity: "warning", message: `Reference transition ${from} → ${to} was never observed`, cases: 0, ids: [connId], data: { from, to } }); }
  violations.sort((a, b) => b.cases - a.cases);

  const transitionStats: TransitionStat[] = [...observed].map(([k, o]) => {
    const [from, to] = unkey(k);
    const refId = refEdges.get(k);
    return { from, to, observed: o, inReference: !!refId, ...(refId ? { refConnectorId: refId } : {}) };
  });

  return {
    fitness: totalCases > 0 ? conformingCases / totalCases : 0,
    totalCases, conformingCases, violations, transitionStats,
  };
}
