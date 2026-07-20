/**
 * AI "Explain results" — a plain-language summary of what a mining run revealed:
 * the real process shape + main paths, conformance vs the reference (fitness +
 * notable deviations and what they mean), timing/resource insight, and — if a
 * digital twin was calibrated — what it enables. Text output (not a diagram), so
 * it calls Claude directly with the configured model. Layered ON TOP of the
 * deterministic mining; the numbers come from the run, the model just narrates.
 */
import { makeAnthropic } from "@/app/lib/ai/anthropicClient";
import type { Variant, MiningStats, Performance } from "./types";
import type { ConformanceResult } from "./transitionConformance";

export interface ExplainInput {
  apiKey: string;
  model: string;
  runName: string;
  stats: MiningStats;
  variants: Variant[];
  conformance?: ConformanceResult | null;
  performance?: Performance | null;
  hasBpmn: boolean;
  hasStateMachine: boolean;
  hasTwin: boolean;
  referenceName?: string;
}

const SYSTEM =
  "You are a process-mining analyst briefing a business owner. Given the results of mining an event log, explain — in clear, plain business English — WHAT WAS DISCOVERED. Cover, only where the data supports it: the shape of the real process and its main paths; how well reality conforms to the reference lifecycle (the fitness %, and the notable deviations and what they most likely mean operationally); any timing or resource insight; and, if a digital twin was built, what it now enables. Be specific to the actual numbers, concise, and practical. Do NOT restate raw JSON or list every variant. Output plain text: short paragraphs and simple '- ' bullet lines only — no markdown headings, no bold/asterisks.";

export function buildExplainPrompt(input: ExplainInput): string {
  const s = input.stats;
  const span = s.from && s.to ? `${Math.round((s.to - s.from) / 86_400_000)} days` : "unknown span";
  const topPaths = [...input.variants].sort((a, b) => b.count - a.count).slice(0, 8)
    .map((v) => `  - x${v.count}: ${v.events.join(" → ")}`);
  const lines: string[] = [
    `Mining run: "${input.runName}".`,
    `Log: ${s.cases} cases, ${s.events} events, ${s.activities?.length ?? 0} activities, ${s.states?.length ?? 0} states, ${s.variants} distinct variants, over ~${span}.`,
    s.states?.length ? `States: ${s.states.join(", ")}.` : "",
    s.unmappedRows ? `(${s.unmappedRows} rows were dropped on import.)` : "",
    ``,
    `Most frequent paths (activity sequences):`,
    ...topPaths,
    ``,
    `Artefacts produced: ${[input.hasBpmn && "a discovered BPMN process", input.hasStateMachine && "a discovered state-machine lifecycle", input.hasTwin && "a calibrated simulation digital twin"].filter(Boolean).join(", ") || "none yet"}.`,
  ];

  if (input.conformance) {
    const c = input.conformance;
    lines.push(
      ``,
      `Conformance against the reference lifecycle${input.referenceName ? ` "${input.referenceName}"` : ""}:`,
      `  fitness ${(c.fitness * 100).toFixed(1)}% — ${c.conformingCases} of ${c.totalCases} cases replay cleanly.`,
      `  deviations:`,
      ...(c.violations.length
        ? c.violations.map((v) => `    - ${v.rule}: ${v.message} (${v.cases} case${v.cases === 1 ? "" : "s"})`)
        : ["    - none"]),
    );
  }

  if (input.performance) {
    const p = input.performance;
    const durs = Object.entries(p.activityDurations ?? {}).slice(0, 8)
      .map(([a, xs]) => `${a}: ~${xs.length ? (xs.reduce((m, n) => m + n, 0) / xs.length).toFixed(1) : "?"}${p.clockUnit[0]}`);
    lines.push(
      ``,
      `Timing (clock unit: ${p.clockUnit}): mean activity durations — ${durs.join("; ") || "n/a"}.`,
      p.interArrival?.length ? `Case inter-arrival gaps sampled: ${p.interArrival.length}.` : "",
      Object.keys(p.resourceConcurrency ?? {}).length ? `Resources + peak concurrency: ${Object.entries(p.resourceConcurrency).map(([r, n]) => `${r}(${n})`).join(", ")}.` : "",
    );
  }

  lines.push(``, `Explain what this reveals to the business owner.`);
  return lines.filter((l) => l !== "").join("\n");
}

export async function explainMiningResults(input: ExplainInput): Promise<string> {
  const client = makeAnthropic(input.apiKey);
  const message = await client.messages.create({
    model: input.model,
    max_tokens: 1400,
    system: SYSTEM,
    messages: [{ role: "user", content: buildExplainPrompt(input) }],
  });
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No AI response");
  return block.text.trim();
}
