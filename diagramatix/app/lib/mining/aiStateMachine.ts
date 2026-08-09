/**
 * AI-generated reference State Machine for the miner. Instead of the purely
 * deterministic discoverStateMachine (which mirrors the log 1:1), this serialises
 * the mined lifecycle (observed states + transitions with their triggering
 * activities and frequencies) into a prompt and runs it through the SAME AI
 * Generate pipeline the app uses for hand-authored state machines — the
 * `general` + `state-machine` DiagramRules, the `state-machine` prompt template,
 * and the SuperAdmin-configured model — asking Claude to CURATE it into a clean,
 * governable reference (tidy labels, merge near-duplicates, drop noise).
 *
 * Terminates at the same layoutGenericDiagram("state-machine") + transitionEvent
 * handling as discoverStateMachine, so the result is interchangeable downstream.
 */
import type { Variant, MiningStats } from "./types";
import type { DiagramData } from "@/app/lib/diagram/types";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { planGeneric } from "@/app/lib/ai/planGeneric";
import { reconcileStateMachineCoverage } from "./stateMachineCoverage";

const SEP = String.fromCharCode(1);

/** Turn the compressed variants into a human-readable brief of the observed
 *  entity lifecycle for the model to curate. */
export function describeMinedLifecycle(variants: Variant[], stats?: Partial<MiningStats>): string {
  const states = new Set<string>();
  const entries = new Map<string, number>();     // "state\1event" → count (first step)
  const trans = new Map<string, number>();        // "from\1to\1event" → count
  const terminals = new Map<string, number>();    // last state → count
  const bump = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

  let totalCases = 0;
  for (const v of variants) {
    const S = v.states, E = v.events, n = v.count || 1;
    totalCases += n;
    for (const s of S) if (s) states.add(s);
    if (S[0]) bump(entries, `${S[0]}${SEP}${E[0] ?? ""}`, n);
    for (let i = 1; i < S.length; i++) {
      if (!S[i - 1] || !S[i]) continue;
      bump(trans, `${S[i - 1]}${SEP}${S[i]}${SEP}${E[i] ?? ""}`, n);
    }
    const last = S[S.length - 1];
    if (last) bump(terminals, last, n);
  }

  const stateList = stats?.states?.length ? stats.states : [...states].sort();
  const entryLines = [...entries.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => {
    const [state, ev] = k.split(SEP);
    return `  - (start) → ${state}${ev ? `  [${ev}]` : ""}  ×${c}`;
  });
  const transLines = [...trans.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => {
    const [from, to, ev] = k.split(SEP);
    return `  - ${from} → ${to}${ev ? `  [${ev}]` : ""}  ×${c}`;
  });
  const termLines = [...terminals.entries()].sort((a, b) => b[1] - a[1]).map(([s, c]) => `  - ${s}  ×${c}`);

  return [
    `An event log of a business entity's lifecycle was mined from ${totalCases} cases.`,
    `The entity passes through STATES; ACTIVITIES move it between them. Below is the OBSERVED behaviour with frequencies.`,
    ``,
    `States observed: ${stateList.join(", ")}`,
    ``,
    `Entry (first observed state, with the triggering activity):`,
    ...entryLines,
    ``,
    `Observed transitions  (from → to  [triggering activity]  ×cases):`,
    ...transLines,
    ``,
    `Terminal states observed (where cases ended — some may be cases still in flight, not true end states):`,
    ...termLines,
    ``,
    `TASK: Produce the REFERENCE state machine that is the single source of truth for this entity's lifecycle.`,
    `Lay it out cleanly and governably, but it MUST cover the log completely:`,
    `- COMPLETENESS IS MANDATORY: include EVERY state listed above and EVERY observed transition. Do NOT drop,`,
    `  merge, or summarise any state or transition as "noise" — conformance replays the log against this model,`,
    `  so any missing state or transition makes every case that touches it fail as an illegal transition.`,
    `- Use each state's EXACT label as it appears in the log — do NOT rename, expand, or merge labels`,
    `  (conformance matches states by label; a renamed state reads as a brand-new unknown state).`,
    `- Use exactly one initial state and one final state; connect the observed entry state(s) from the initial`,
    `  and the observed terminal state(s) to the final (ignore in-flight cases when deciding what is truly terminal).`,
    `- Label each transition with the activity/event that triggers it.`,
    `You may tidy the LAYOUT and add a short description, but never at the cost of dropping or renaming a state/transition.`,
    `Return ONLY the diagram JSON per the format.`,
  ].join("\n");
}

export interface AiStateMachineInput {
  apiKey: string;
  model: string;
  rules: string;              // green-filtered general + state-machine aiRules
  variants: Variant[];
  stats?: Partial<MiningStats>;
}

/** Mined variants → an AI-curated reference state-machine DiagramData. */
export async function generateStateMachineViaAi(input: AiStateMachineInput): Promise<DiagramData> {
  const prompt = describeMinedLifecycle(input.variants, input.stats);
  const parsed = await planGeneric({
    apiKey: input.apiKey,
    model: input.model,
    diagramType: "state-machine",
    rules: input.rules,
    prompt,
  });
  // Enforce the coverage rule in code: whatever the model curated, add back every
  // observed state/transition it left out (matched by label) so the reference is
  // conformance-complete against the log — the prompt asks for this, this guarantees it.
  const covered = reconcileStateMachineCoverage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { elements: (parsed.elements ?? []) as any, connections: (parsed.connections ?? []) as any },
    input.variants,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = layoutGenericDiagram(covered as any, "state-machine");
  for (const c of data.connectors) {
    if (c.type === "transition" && c.label) { c.labelMode = "formal"; c.transitionEvent = c.label; }
  }
  return data;
}
