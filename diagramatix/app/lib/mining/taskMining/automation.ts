/**
 * Task Mining — Automation Opportunities (Phase 1 marquee output).
 *
 * Ranks a task's routine variants as RPA candidates and emits an exportable
 * automation spec (the "recipe" a UiPath/Power Automate build would follow).
 * Operates on the miner's compressed `variants` (the stored form of a run) —
 * every UI step, including app switches and copy/paste, is an activity in the
 * log, so no raw-interaction store is needed. Pure.
 */
import type { Variant } from "../types";

const isNav = (a: string) => a.startsWith("Switch to ") || a.startsWith("Open ");
const isCopyPaste = (a: string) => /:\s*(Copy|Paste)\b/.test(a);
const isTyping = (a: string) => /:\s*(Type|Select|Paste)\b/.test(a);

export interface AutomationOpportunity {
  /** The distinct routine (variant) this candidate is. */
  variantIndex: number;
  /** Ordered step labels (the RPA recipe). */
  steps: string[];
  cases: number;             // cases that follow this exact routine
  share: number;             // cases / total cases
  actionSteps: number;       // steps excluding app switches
  copyPasteSteps: number;    // copy/paste steps (the strongest RPA tell)
  appSwitches: number;
  score: number;             // 0..1 automation-opportunity heuristic
  verdict: "high" | "medium" | "low";
  reason: string;
}

/** Score + rank each variant as an automation candidate (most-followed first). */
export function automationOpportunities(variants: Variant[]): AutomationOpportunity[] {
  const total = variants.reduce((n, v) => n + v.count, 0) || 1;
  const variantCount = Math.max(1, variants.length);
  const determinism = 1 / variantCount;

  const opps: AutomationOpportunity[] = variants.map((v, i): AutomationOpportunity => {
    const steps = v.events.filter(Boolean);
    const actionSteps = steps.filter((a) => !isNav(a)).length || 1;
    const copyPasteSteps = steps.filter(isCopyPaste).length;
    const appSwitches = steps.filter((a) => a.startsWith("Switch to ")).length;
    const share = v.count / total;
    const copyPasteRate = copyPasteSteps / actionSteps;
    const switchRate = appSwitches / steps.length;

    const score = Math.min(1,
      0.42 * Math.min(1, copyPasteRate * 2.2) +
      0.23 * Math.min(1, switchRate * 3) +
      0.20 * share +
      0.15 * determinism,
    );
    const verdict = score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low";
    const reason = [
      copyPasteSteps ? `${copyPasteSteps} copy/paste steps` : null,
      appSwitches ? `${appSwitches} app switches` : null,
      `${Math.round(share * 100)}% of cases`,
    ].filter(Boolean).join(", ");

    return { variantIndex: i, steps, cases: v.count, share, actionSteps, copyPasteSteps, appSwitches, score, verdict, reason };
  });

  return opps.sort((a, b) => b.cases - a.cases || b.score - a.score);
}

/** A single headline score for the whole task (its dominant routine's score,
 *  nudged up when copy/paste is heavy across all variants). */
export function taskAutomationScore(variants: Variant[]): { score: number; verdict: "high" | "medium" | "low" } {
  const opps = automationOpportunities(variants);
  if (!opps.length) return { score: 0, verdict: "low" };
  const top = opps[0].score;
  const score = Math.min(1, top);
  return { score, verdict: score >= 0.6 ? "high" : score >= 0.35 ? "medium" : "low" };
}

export interface AutomationRoi {
  cases: number;                 // total cases mined
  secondsPerStep: number;        // assumption used
  currentHours: number;          // observed human handling time across the cases
  automatedHours: number;        // residual human time after automating the candidates
  savedHours: number;
  savedPct: number;              // 0..1 share of handling time automatable
  automatableCases: number;      // cases on high/medium routines
}

/** Estimate the ROI of automating this task: current human handling time vs the
 *  residual after botting the high/medium routines (a `residual` of oversight is
 *  kept so it never claims 100%). Uses a per-step time assumption when no mined
 *  duration is supplied — transparent and volume-scalable. Pure. */
export function automationRoi(variants: Variant[], opts?: { secondsPerStep?: number; residual?: number }): AutomationRoi {
  const secPerStep = opts?.secondsPerStep ?? 6;
  const residual = opts?.residual ?? 0.15; // human oversight kept on automated routines
  const opps = automationOpportunities(variants);
  let currentSec = 0, automatedSec = 0, automatableCases = 0;
  for (const o of opps) {
    const perCase = o.steps.length * secPerStep;
    currentSec += perCase * o.cases;
    const automatable = o.verdict === "high" || o.verdict === "medium";
    automatedSec += perCase * o.cases * (automatable ? residual : 1);
    if (automatable) automatableCases += o.cases;
  }
  const savedSec = Math.max(0, currentSec - automatedSec);
  const cases = variants.reduce((n, v) => n + v.count, 0);
  return {
    cases,
    secondsPerStep: secPerStep,
    currentHours: currentSec / 3600,
    automatedHours: automatedSec / 3600,
    savedHours: savedSec / 3600,
    savedPct: currentSec > 0 ? savedSec / currentSec : 0,
    automatableCases,
  };
}

/** A Markdown automation spec for the top opportunity — the RPA "recipe" +
 *  a rough saving estimate. `avgHandleSeconds` (from mined performance) refines
 *  the estimate; without it we fall back to a per-step assumption. */
export function buildAutomationSpec(
  variants: Variant[],
  taskName: string,
  opts?: { avgHandleSeconds?: number; secondsPerStep?: number },
): string {
  const opps = automationOpportunities(variants);
  if (!opps.length) return `# ${taskName}\n\nNo routine variants to analyse.`;
  const top = opps[0];
  const secPerStep = opts?.secondsPerStep ?? 6;
  const perCaseSec = opts?.avgHandleSeconds ?? top.steps.length * secPerStep;
  const totalCases = variants.reduce((n, v) => n + v.count, 0);
  const savedHours = ((perCaseSec * top.cases) / 3600).toFixed(1);

  const lines: string[] = [];
  lines.push(`# Automation opportunity — ${taskName}`);
  lines.push("");
  lines.push(`**Candidate routine:** ${top.cases}/${totalCases} cases (${Math.round(top.share * 100)}%) · **score ${(top.score * 100).toFixed(0)}% (${top.verdict})**`);
  lines.push(`**Signals:** ${top.reason}.`);
  lines.push(`**Est. effort observed:** ~${Math.round(perCaseSec)}s/case → ~${savedHours}h across the ${top.cases} cases mined.`);
  lines.push("");
  lines.push("## Steps to automate (RPA recipe)");
  top.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  if (opps.length > 1) {
    lines.push("");
    lines.push("## Other observed routines");
    for (const o of opps.slice(1)) lines.push(`- ${o.cases} case(s) · score ${(o.score * 100).toFixed(0)}% — ${o.reason}`);
  }
  return lines.join("\n");
}
