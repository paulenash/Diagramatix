/**
 * Task Mining — task-specific insights (Phase 0 spike).
 *
 * These are the analyses that make task mining MORE than a finer-grained process
 * map: ping-pong (bouncing between apps), rework (repeating a work step), and a
 * first-cut automation-opportunity signal. All pure; operate on the raw
 * interactions and/or the miner's compressed `variants`.
 *
 * Phase 1 will turn `automationSignal` into the ranked "Automation Opportunities"
 * list + exportable RPA spec; here it's a minimal, honest preview.
 */
import type { Variant } from "../types";
import type { TaskInteraction } from "./schema";
import { taskStepLabel } from "./schema";

const isNav = (activity: string) => activity.startsWith("Switch to ") || activity.startsWith("Open ");

/** Per-case A→B→A application bounces — the classic "ping-pong" between two apps
 *  (e.g. Excel ↔ web form). Returns the total and a per-case breakdown. */
export function detectPingPong(interactions: TaskInteraction[]): { total: number; byCase: Record<string, number> } {
  const byCaseSteps = new Map<string, TaskInteraction[]>();
  for (const i of interactions) (byCaseSteps.get(i.taskCaseId) ?? byCaseSteps.set(i.taskCaseId, []).get(i.taskCaseId)!).push(i);

  const byCase: Record<string, number> = {};
  let total = 0;
  for (const [caseId, steps] of byCaseSteps) {
    const ordered = [...steps].sort((a, b) => (a.timestamp === b.timestamp ? a.seq - b.seq : a.timestamp < b.timestamp ? -1 : 1));
    // Collapse consecutive same-app steps to an app sequence.
    const apps: string[] = [];
    for (const s of ordered) if (apps[apps.length - 1] !== s.application) apps.push(s.application);
    let bounces = 0;
    for (let k = 2; k < apps.length; k++) if (apps[k] === apps[k - 2] && apps[k] !== apps[k - 1]) bounces++;
    if (bounces) { byCase[caseId] = bounces; total += bounces; }
  }
  return { total, byCase };
}

/** Work steps (excluding app switches) that repeat within a single case — the
 *  fingerprint of rework. Weighted by how many cases (variant frequency) show it. */
export function detectReworkActivities(variants: Variant[]): Array<{ activity: string; cases: number }> {
  const cases = new Map<string, number>();
  for (const v of variants) {
    const seen = new Map<string, number>();
    for (const a of v.events) if (a && !isNav(a)) seen.set(a, (seen.get(a) ?? 0) + 1);
    for (const [a, n] of seen) if (n > 1) cases.set(a, (cases.get(a) ?? 0) + v.count);
  }
  return [...cases.entries()].map(([activity, c]) => ({ activity, cases: c })).sort((a, b) => b.cases - a.cases);
}

export interface AutomationSignal {
  score: number;                    // 0..1 automation-opportunity heuristic
  copyPasteRate: number;            // share of steps that are copy/paste
  appSwitchRate: number;            // share of steps that are app switches
  reworkRate: number;               // share of cases showing rework
  determinism: number;              // 1 = one variant; falls with variant diversity
  verdict: "high" | "medium" | "low";
}

/** A first-cut automation-opportunity score for a task. High when the work is
 *  repetitive, copy/paste- and app-switch-heavy, deterministic (few variants),
 *  and shows rework — i.e. a strong RPA candidate. Heuristic, tuned in Phase 1. */
export function automationSignal(interactions: TaskInteraction[], variants: Variant[]): AutomationSignal {
  const steps = interactions.length || 1;
  const copyPaste = interactions.filter((i) => i.actionType === "copy" || i.actionType === "paste").length;
  const switches = interactions.filter((i) => i.actionType === "switchApp").length;
  const cases = new Set(interactions.map((i) => i.taskCaseId)).size || 1;
  const totalCaseCount = variants.reduce((n, v) => n + v.count, 0) || cases;
  const reworkCaseCount = variants.reduce((n, v) => {
    const repeats = v.events.some((a, idx) => a && !isNav(a) && v.events.indexOf(a) !== idx);
    return n + (repeats ? v.count : 0);
  }, 0);

  const copyPasteRate = copyPaste / steps;
  const appSwitchRate = switches / steps;
  const reworkRate = reworkCaseCount / totalCaseCount;
  const determinism = 1 / Math.max(1, variants.length);

  // Weighted blend — copy/paste + app-switching are the strongest RPA tells.
  const score = Math.min(1,
    0.40 * Math.min(1, copyPasteRate * 2.5) +
    0.25 * Math.min(1, appSwitchRate * 3) +
    0.20 * determinism +
    0.15 * reworkRate,
  );
  const verdict = score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low";
  return { score, copyPasteRate, appSwitchRate, reworkRate, determinism, verdict };
}
