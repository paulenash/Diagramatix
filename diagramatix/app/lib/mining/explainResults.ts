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

/**
 * Deterministic "poor-man's" alternative to the AI explanation — a plain-English
 * summary templated from the same computed metrics (paths, conformance, timing).
 * Used as the fallback when AI is turned off for the org (ENT-05). Pure.
 */
export function summariseMiningResults(input: Omit<ExplainInput, "apiKey" | "model">): string {
  const s = input.stats;
  const span = s.from && s.to ? `${Math.round((s.to - s.from) / 86_400_000)} days` : "an unknown span";
  const top = [...input.variants].sort((a, b) => b.count - a.count);
  const total = s.cases || top.reduce((m, v) => m + v.count, 0) || 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  const out: string[] = [];

  out.push(`This log holds ${s.cases} cases and ${s.events} events across ${s.variants} distinct paths, over ~${span}.`);
  if (top[0]) out.push(`- Most common path (${pct(top[0].count)}% of cases): ${top[0].events.join(" → ")}.`);
  if (top[1]) out.push(`- Next most common (${pct(top[1].count)}%): ${top[1].events.join(" → ")}.`);
  out.push(`- ${s.variants} distinct paths — ${s.variants > 20 ? "high variability" : s.variants > 5 ? "moderate variability" : "fairly standardised"}.`);

  if (input.conformance) {
    const c = input.conformance;
    out.push(`Conformance vs the reference${input.referenceName ? ` "${input.referenceName}"` : ""}: ${(c.fitness * 100).toFixed(1)}% fit — ${c.conformingCases} of ${c.totalCases} cases replay cleanly.`);
    if (c.violations.length) {
      out.push(`Top deviations:`);
      for (const v of c.violations.slice(0, 5)) out.push(`  - ${v.message} (${v.cases} case${v.cases === 1 ? "" : "s"}).`);
    } else out.push(`- No deviations — every case conforms.`);
  }

  if (input.performance) {
    const p = input.performance;
    const durs = Object.entries(p.activityDurations ?? {})
      .map(([a, xs]) => ({ a, mean: xs.length ? xs.reduce((m, n) => m + n, 0) / xs.length : 0 }))
      .filter((d) => d.mean > 0).sort((x, y) => y.mean - x.mean);
    if (durs[0]) out.push(`Slowest step on average: ${durs[0].a} (~${durs[0].mean.toFixed(1)} ${p.clockUnit}).`);
    const rc = Object.entries(p.resourceConcurrency ?? {});
    if (rc.length) { const b = rc.sort((a, z) => z[1] - a[1])[0]; out.push(`Busiest resource: ${b[0]} (peak concurrency ${b[1]}).`); }
  }

  const arte = [input.hasBpmn && "a BPMN process", input.hasStateMachine && "a state-machine lifecycle", input.hasTwin && "a simulation digital twin"].filter(Boolean);
  if (arte.length) out.push(`Produced: ${arte.join(", ")}.`);
  out.push(``, `(Summary generated deterministically — enable AI for a narrated explanation.)`);
  return out.join("\n");
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
