/**
 * AI-generated BPMN process for the miner. Instead of the deterministic
 * discoverProcess (directly-follows graph → BPMN, 1:1 with the log), this
 * serialises the mined behaviour (the distinct activity paths + frequencies)
 * and runs it through the app's existing AI BPMN pipeline — the general + bpmn
 * DiagramRules, the BPMN prompt (planBpmn), and the configured model — asking
 * Claude to CURATE a clean, readable process (gateways at real branches, rework
 * loops, tidy labels, noise dropped).
 *
 * Terminates at the same layoutBpmnDiagram(...) as discoverProcess, so the result
 * is an ordinary editable bpmn diagram, interchangeable downstream.
 */
import type { Variant, MiningStats } from "./types";
import type { DiagramData } from "@/app/lib/diagram/types";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { planBpmn } from "@/app/lib/ai/planBpmn";

const MAX_PATHS = 40; // cap the brief so a very spaghetti log stays within budget

/** Turn the compressed variants into a human-readable brief of the observed
 *  process (activity paths + frequencies) for the model to curate into BPMN. */
export function describeMinedProcess(variants: Variant[], stats?: Partial<MiningStats>): string {
  const byFreq = [...variants].filter((v) => v.events?.length).sort((a, b) => b.count - a.count);
  const totalCases = byFreq.reduce((a, v) => a + (v.count || 1), 0);
  const activities = stats?.activities?.length
    ? stats.activities
    : [...new Set(byFreq.flatMap((v) => v.events).filter(Boolean))].sort();

  const shown = byFreq.slice(0, MAX_PATHS);
  const omitted = byFreq.length - shown.length;
  const pathLines = shown.map((v) => `  - ×${v.count}: ${v.events.join(" → ")}`);

  return [
    `A business process was mined from ${totalCases} cases. Below are the distinct PATHS people actually followed (sequences of activities), most frequent first, with how many cases took each.`,
    ``,
    `Activities observed: ${activities.join(", ")}`,
    ``,
    `Paths  (×cases: activity → activity → …):`,
    ...pathLines,
    ...(omitted > 0 ? [`  (+${omitted} rarer path(s) omitted)`] : []),
    ``,
    `TASK: Produce the BPMN process model implied by these paths. Curate it into a clean, readable model rather than a literal copy:`,
    `- One start event; add end event(s) for the genuine ways cases finish.`,
    `- Insert exclusive gateways where paths diverge and converge.`,
    `- Represent an activity that recurs (a path that loops back to an earlier activity) as a rework loop, not a duplicate task.`,
    `- Give activities clear, business-friendly labels (expand cryptic codes); merge duplicates.`,
    `- Keep the dominant behaviour; omit obvious one-off anomalies and noise.`,
    `Return ONLY the diagram JSON per the format.`,
  ].join("\n");
}

export interface AiProcessInput {
  apiKey: string;
  model: string;
  rules: string;              // green-filtered general + bpmn aiRules
  variants: Variant[];
  stats?: Partial<MiningStats>;
}

/** Mined variants → an AI-curated BPMN process DiagramData. */
export async function generateProcessViaAi(input: AiProcessInput): Promise<DiagramData> {
  const prompt = describeMinedProcess(input.variants, input.stats);
  const res = await planBpmn({ apiKey: input.apiKey, prompt, rules: input.rules, model: input.model });
  if (!res.ok) throw new Error(res.error);
  return layoutBpmnDiagram(res.plan.elements, res.plan.connections, { promptLabel: "Mined process (AI)" });
}
