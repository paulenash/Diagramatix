/**
 * Coverage guarantee for a GENERATED reference state machine.
 *
 * Conformance (`transitionConformance.ts`) matches the log against the reference
 * by STATE label and by state→state TRANSITION, and flags anything in the log
 * that the reference is missing as an illegal/undocumented transition or unknown
 * state. So a generated reference that drops, merges, or renames states — the AI
 * curation path deliberately tries to (`aiStateMachine.ts`) — makes every case
 * touching the dropped element fail conformance, drowning the report in false
 * illegals.
 *
 * The rule (Paul): *any generated State Machine must show every state and
 * activity that is in the event log.* This module enforces that structurally,
 * in code, after generation: it reconciles a state-machine plan against the
 * variants and adds back any observed state, entry, transition, or terminal the
 * generator left out — labelling each transition with its triggering activity.
 * It is a pure, idempotent no-op on the already-complete deterministic
 * discovery, and a safety net over the AI path.
 */
import type { Variant } from "./types";

const SEP = String.fromCharCode(1);
const INIT = "__init", FINAL = "__final";
const norm = (s: string) => (s ?? "").trim().toLowerCase();

export interface SmPlanElement { id: string; type: string; label: string }
export interface SmPlanConnection { sourceId: string; targetId: string; label: string; type: string; count?: number }
export interface SmCoveragePlan { elements: SmPlanElement[]; connections: SmPlanConnection[] }

/** Add back every log state / entry / transition / terminal the plan is missing
 *  (matched case-insensitively by state label), so conformance against the same
 *  log is clean. Existing states/transitions are never renamed or removed. */
export function reconcileStateMachineCoverage(plan: SmCoveragePlan, variants: Variant[]): SmCoveragePlan {
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  // ── Observed behaviour (keyed by normalised state label) ──
  const displayByNorm = new Map<string, string>();                 // norm → first-seen label casing
  const addState = (s: string) => { const n = norm(s); if (s && !displayByNorm.has(n)) displayByNorm.set(n, s); };
  const trans = new Map<string, { from: string; to: string; events: Map<string, number>; count: number }>();
  const entries = new Map<string, Map<string, number>>();          // norm firstState → event → count
  const terminals = new Set<string>();                             // norm terminal state

  for (const v of variants) {
    const S = v.states, E = v.events;
    if (!S.length) continue;
    for (const s of S) addState(s);
    if (S[0]) { const n = norm(S[0]); bump(entries.get(n) ?? entries.set(n, new Map()).get(n)!, E[0] ?? "", v.count); }
    for (let i = 1; i < S.length; i++) {
      const from = S[i - 1], to = S[i];
      if (!from || !to) continue;
      const k = norm(from) + SEP + norm(to);
      const t = trans.get(k) ?? { from, to, events: new Map<string, number>(), count: 0 };
      bump(t.events, E[i] ?? "", v.count); t.count += v.count; trans.set(k, t);
    }
    const last = S[S.length - 1];
    if (last) terminals.add(norm(last));
  }

  // ── Index the existing plan ──
  const elements = plan.elements.map((e) => ({ ...e }));
  const connections = plan.connections.map((c) => ({ ...c }));
  const usedIds = new Set(elements.map((e) => e.id));
  const idByNorm = new Map<string, string>();
  let initId: string | undefined, finalId: string | undefined;
  for (const e of elements) {
    if (e.type === "state" && e.label) idByNorm.set(norm(e.label), e.id);
    else if (e.type === "initial-state") initId ??= e.id;
    else if (e.type === "final-state") finalId ??= e.id;
  }
  const mkId = (base: string, fallback: string): string => {
    const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || fallback;
    let id = slug, i = 2;
    while (usedIds.has(id)) id = `${slug}-${i++}`;
    usedIds.add(id);
    return id;
  };

  if (!initId) { initId = usedIds.has(INIT) ? mkId("init", "init") : INIT; usedIds.add(initId); elements.push({ id: initId, type: "initial-state", label: "" }); }
  if (!finalId) { finalId = usedIds.has(FINAL) ? mkId("final", "final") : FINAL; usedIds.add(finalId); elements.push({ id: finalId, type: "final-state", label: "" }); }

  // Every observed state must exist as a state node.
  for (const [n, label] of displayByNorm) {
    if (!idByNorm.has(n)) {
      const id = mkId(label, "s");
      elements.push({ id, type: "state", label });
      idByNorm.set(n, id);
    }
  }

  // Existing transition endpoints, keyed by normalised endpoint (states + init/final sentinels).
  const kindById = new Map(elements.map((e) => [e.id, e.type]));
  const normLabelById = new Map<string, string>();
  for (const e of elements) if (e.type === "state") normLabelById.set(e.id, norm(e.label));
  const endpoint = (id: string): string | null => {
    const k = kindById.get(id);
    if (k === "state") return normLabelById.get(id) ?? null;
    if (k === "initial-state") return INIT;
    if (k === "final-state") return FINAL;
    return null;
  };
  const pairs = new Set<string>();
  for (const c of connections) {
    if (c.type !== "transition") continue;
    const s = endpoint(c.sourceId), t = endpoint(c.targetId);
    if (s != null && t != null) pairs.add(s + SEP + t);
  }

  // Add missing entries, transitions, terminals.
  for (const [n, em] of entries) {
    const pk = INIT + SEP + n;
    if (pairs.has(pk)) continue;
    const count = [...em.values()].reduce((a, b) => a + b, 0);
    connections.push({ sourceId: initId, targetId: idByNorm.get(n)!, label: [...em.keys()].filter(Boolean).join(" / "), type: "transition", count });
    pairs.add(pk);
  }
  for (const t of trans.values()) {
    const pk = norm(t.from) + SEP + norm(t.to);
    if (pairs.has(pk)) continue;
    connections.push({ sourceId: idByNorm.get(norm(t.from))!, targetId: idByNorm.get(norm(t.to))!, label: [...t.events.keys()].filter(Boolean).join(" / "), type: "transition", count: t.count });
    pairs.add(pk);
  }
  for (const n of terminals) {
    const pk = n + SEP + FINAL;
    if (pairs.has(pk)) continue;
    connections.push({ sourceId: idByNorm.get(n)!, targetId: finalId, label: "", type: "transition" });
    pairs.add(pk);
  }

  return { elements, connections };
}
