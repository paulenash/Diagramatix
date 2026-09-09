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
  /** WHICH variants exhibit it — the bridge from "14 cases did this" to
   *  "here they are". Joined against `analytics.cases[].variantIdx` to name
   *  the actual cases. Absent on a run whose conformance predates this;
   *  callers must treat that as unknown, not as none. */
  variantIdxs?: number[];
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
  // State matching is CASE-INSENSITIVE (+ trimmed): a discovered "placed" must
  // conform to a reference "Placed". Original labels are kept for the messages.
  // Collapse internal whitespace too (not just trim) so a reference label wrapped
  // across lines — "Level 1 In\nProgress" — still matches the log's "Level 1 In Progress".
  const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const refStates = new Set<string>();
  for (const v of kindById.values()) if (v.kind === "state" && v.label) refStates.add(norm(v.label));
  const refEdges = new Map<string, { id: string; from: string; to: string }>();   // norm "from→to" → { connId, original labels }
  const refEntry = new Set<string>();
  const refExit = new Set<string>();
  for (const c of ref.connectors) {
    if (c.type !== "transition") continue;
    const s = kindById.get(c.sourceId), t = kindById.get(c.targetId);
    if (!s || !t) continue;
    if (s.kind === "initial-state" && t.kind === "state") refEntry.add(norm(t.label));
    else if (t.kind === "final-state" && s.kind === "state") refExit.add(norm(s.label));
    else if (s.kind === "state" && t.kind === "state") refEdges.set(key(norm(s.label), norm(t.label)), { id: c.id, from: s.label, to: t.label });
  }

  // ── Replay each variant ──
  const totalCases = variants.reduce((a, v) => a + v.count, 0);
  let conformingCases = 0;
  const observed = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  // Each violation now carries both its case count AND the variants that
  // exhibit it. The count alone is a metric; the variants are what turn it
  // into evidence somebody can go and look at.
  type Hits = { cases: number; idxs: number[] };
  const undoc = new Map<string, Hits>(), unknown = new Map<string, Hits>();
  const badEntry = new Map<string, Hits>(), badExit = new Map<string, Hits>();
  const hit = (m: Map<string, Hits>, k: string, n: number, vi: number) => {
    const h = m.get(k) ?? { cases: 0, idxs: [] };
    h.cases += n; h.idxs.push(vi);
    m.set(k, h);
  };

  variants.forEach((v, vi) => {
    const S = v.states;
    const seenUndoc = new Set<string>(), seenUnknown = new Set<string>();
    for (const s of S) if (s && !refStates.has(norm(s))) seenUnknown.add(s);
    for (let i = 1; i < S.length; i++) {
      const from = S[i - 1], to = S[i];
      if (!from || !to) continue;
      bump(observed, key(from, to), v.count);                  // raw key: display + illegal-flagging
      if (!refEdges.has(key(norm(from), norm(to)))) seenUndoc.add(key(from, to));
    }
    const first = S[0], last = S[S.length - 1];
    const entryBad = refEntry.size > 0 && first ? !refEntry.has(norm(first)) : false;
    const exitBad = refExit.size > 0 && last ? !refExit.has(norm(last)) : false;

    const clean = seenUndoc.size === 0 && seenUnknown.size === 0 && !entryBad && !exitBad;
    if (clean) conformingCases += v.count;
    for (const k of seenUndoc) hit(undoc, k, v.count, vi);
    for (const s of seenUnknown) hit(unknown, s, v.count, vi);
    if (entryBad && first) hit(badEntry, first, v.count, vi);
    if (exitBad && last) hit(badExit, last, v.count, vi);
  });

  // ── Assemble violations ──
  const violations: ConformanceViolation[] = [];
  for (const [k, h] of undoc) { const [from, to] = unkey(k); violations.push({ rule: "undocumented-transition", severity: "error", message: `Undocumented transition: ${from} → ${to}`, cases: h.cases, variantIdxs: h.idxs, data: { from, to } }); }
  for (const [s, h] of unknown) violations.push({ rule: "unknown-state", severity: "error", message: `State "${s}" is not in the reference`, cases: h.cases, variantIdxs: h.idxs, data: { state: s } });
  for (const [s, h] of badEntry) violations.push({ rule: "unexpected-entry", severity: "warning", message: `Cases start in "${s}", not a reference entry state`, cases: h.cases, variantIdxs: h.idxs, data: { state: s } });
  for (const [s, h] of badExit) violations.push({ rule: "unexpected-exit", severity: "warning", message: `Cases end in "${s}", not a reference final state`, cases: h.cases, variantIdxs: h.idxs, data: { state: s } });
  const observedNorm = new Set([...observed.keys()].map((k) => { const [f, t] = unkey(k); return key(norm(f), norm(t)); }));
  for (const [k, e] of refEdges) if (!observedNorm.has(k)) violations.push({ rule: "dead-transition", severity: "warning", message: `Reference transition ${e.from} → ${e.to} was never observed`, cases: 0, variantIdxs: [], ids: [e.id], data: { from: e.from, to: e.to } });
  violations.sort((a, b) => b.cases - a.cases);

  const transitionStats: TransitionStat[] = [...observed].map(([k, o]) => {
    const [from, to] = unkey(k);
    const e = refEdges.get(key(norm(from), norm(to)));
    return { from, to, observed: o, inReference: !!e, ...(e ? { refConnectorId: e.id } : {}) };
  });

  return {
    fitness: totalCases > 0 ? conformingCases / totalCases : 0,
    totalCases, conformingCases, violations, transitionStats,
  };
}
