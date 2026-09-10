/**
 * What a DiagramatixMINER example illustrates, derived from its own package.
 *
 * See `app/lib/exampleFeature.ts` for why these are derived rather than typed.
 * The short version: a hand-written feature list is a claim that goes stale in
 * silence — an example whose log stops carrying a resource column would still
 * advertise team hand-offs, and nothing would go red.
 *
 * Two kinds of entry, deliberately distinguished:
 *
 *   STRUCTURAL — read straight off the bundle. Does it carry a reference model,
 *   several periods, a live-source demo, an SLA. Cheap and certain.
 *
 *   MEASURED — computed by running the example's own sample log through the
 *   same functions the workbench uses, so the figure quoted here is the figure
 *   the reader will see. That costs a mine, which is why this is called from a
 *   per-example endpoint and NOT from the gallery list: the list stays light,
 *   and only an opened summary pays.
 *
 * Where a measurement comes back empty the feature is OMITTED rather than
 * listed with a zero. "Rework: 0 activities" is not a thing this example
 * teaches; it is a thing it does not have.
 *
 * Pure — no DB, no React.
 */

import type { ExampleFeature, ExampleFeatureGroup } from "../exampleFeature";
import type { MiningExamplePackage, MiningExampleSampleLog } from "./examplePackage";
import { buildEventLog } from "./parseEventLog";
import { computeAnalytics, formatDuration, pickClockUnit, type RunAnalytics } from "./analytics";
import { computeTeamFlow, reworkFrom } from "./teamFlow";
import { transitionRows } from "./handover";
import { isTaskRun } from "./taskMining/insights";
import type { Variant } from "./types";

const dur = (ms: number) => formatDuration(Math.abs(ms), pickClockUnit(Math.abs(ms)));
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/**
 * FLOORS, and why there are any.
 *
 * Every detector below returns something on almost every log, and a summary
 * that lists everything it found lists mostly noise. On the Accounts Payable
 * log two clerks pass 7 cases of 200 back and forth; on the Service Desk log
 * "Investigate" runs 1.1× per case. Both are true. Neither is a thing that
 * example teaches, and advertising them as features means the reader who opens
 * it looking for rework finds a rounding error and stops trusting the list.
 *
 * So a pattern earns a line only when it is big enough to be the reason
 * somebody would open this example rather than another one.
 */
/** A bounce pattern is worth naming when it touches this share of the cases. */
const PING_PONG_SHARE = 0.1;
/** Rework is worth naming at this many runs per case — below it, a few retries. */
const REWORK_RATE = 1.3;

/** The example's own log, mined exactly as the console would mine it. */
function mine(sample: MiningExampleSampleLog | undefined, pkg: MiningExamplePackage):
  { analytics: RunAnalytics | null; variants: Variant[] } {
  if (sample && sample.headers?.length && sample.rows?.length) {
    const log = buildEventLog(sample.headers, sample.rows, sample.mapping);
    return { analytics: computeAnalytics(log), variants: log.variants };
  }
  // A pre-created run (the live demo, an OCEL study) carries its analytics
  // already; there is no staged log to mine.
  return { analytics: pkg.run?.analytics ?? null, variants: pkg.run?.variants ?? [] };
}

// ── Getting the log in ──────────────────────────────────────────────────────

function inputFeatures(pkg: MiningExamplePackage): ExampleFeature[] {
  const out: ExampleFeature[] = [];
  const mapping = pkg.sampleLog?.mapping ?? pkg.run?.mapping;
  if (!mapping) return out;

  const scenarios = pkg.sampleLogs?.length ?? 0;
  if (scenarios > 1) {
    const names = pkg.sampleLogs!.map((s) => s.scenario).filter(Boolean).join(", ");
    out.push({
      id: "scenario-picker",
      label: "Several periods to choose between",
      detail: `${plural(scenarios, "log")} of the same process — ${names}. Import one, then another, and they can be compared.`,
      where: "Import panel, on entry",
    });
  }

  if (!mapping.state && mapping.activityState && Object.keys(mapping.activityState).length > 0) {
    out.push({
      id: "activity-only",
      label: "An activity-only log, with no state column",
      detail: "The smallest useful export — case, activity, timestamp, who. The Activity → State table supplies the lifecycle that discovery, conformance and the generated State Machine all need.",
      where: "Import panel → Activity → State",
    });
  }

  if (mapping.controlId || mapping.riskId || mapping.policyId) {
    out.push({
      id: "governance-ids",
      label: "Control, risk and policy ids on the events",
      detail: "Mines control operating-effectiveness — how often a control was actually exercised, and in how many cases it was bypassed.",
      where: "Risk-Control Matrix",
    });
  }

  return out;
}

// ── Reading it ──────────────────────────────────────────────────────────────

function analysisFeatures(pkg: MiningExamplePackage, analytics: RunAnalytics | null, variants: Variant[]): ExampleFeature[] {
  const out: ExampleFeature[] = [];
  if (!analytics) return out;

  // Slicing — named dimensions, with their actual values, because "supports
  // filtering" is a manual and "slice by Region: APAC, EMEA, Americas" is an
  // instruction.
  const attrs = (analytics.attributes ?? []).filter((a) => a.filterable);
  if (attrs.length > 0) {
    const dims = attrs
      .map((a) => {
        const vals = a.values ?? [];
        // A high-cardinality column is filterable but not listable — printing
        // the first four of two hundred customer names would read as if those
        // were the choices.
        const shown = vals.length > 0 ? ` (${vals.slice(0, 4).join(", ")}${vals.length > 4 ? ", …" : ""})` : "";
        return a.name + shown;
      })
      .join(" · ");
    out.push({
      id: "slicing",
      label: "Slice the run by a column you kept",
      detail: `${dims}. Every figure then says whether it is filtered, estimated, or could not be narrowed at all — never averaged into a plausible-looking number.`,
      where: "Insights → filter bar",
    });
  }

  // Where the elapsed time goes — the single biggest wait, measured.
  const rows = transitionRows(analytics.edges).rows;
  if (rows.length > 0) {
    const top = rows[0];
    // `medianMs` is null on an edge seen too few times to have one — the
    // honest floor the Between-steps tab itself applies. Quote the figure only
    // when there is one, rather than printing a zero that reads as "instant".
    const measured = top.medianMs !== null ? `, a median wait of ${dur(top.medianMs)}` : "";
    out.push({
      id: "between-steps",
      label: "Where the elapsed time actually goes",
      detail: `The transitions ranked by the elapsed time they account for — because most of the delay in a process is between the steps, not inside them. The largest here is ${top.from} → ${top.to}${measured}.`,
      where: "Insights → Between steps",
    });
  }

  const totalCases = variants.reduce((n, v) => n + v.count, 0);
  const flow = computeTeamFlow(analytics, variants);
  if (flow.basis !== "none" && flow.handovers.length > 0) {
    const top = flow.handovers[0];
    // Named by the COLUMN, not called "teams". Half these logs record individual
    // people and half record functions; calling Alice Chen a team is the kind of
    // small lie that makes a reader stop believing the rest of the list.
    const col = pkg.sampleLog?.mapping?.resource ?? pkg.run?.mapping?.resource ?? "Resource";
    out.push({
      id: "handovers",
      label: "Who hands work to whom",
      detail: `The hand-off map across the ${plural(flow.loads.length, "distinct value")} of “${col}”, and what each join costs. The largest here is ${top.from} → ${top.to}.`
        + (flow.basis === "approximate" ? " (Approximate on this run — it has no per-event resources, and it says so on the screen.)" : ""),
      where: "Insights → Teams",
    });
  }
  const pp = flow.pingPong[0];
  if (pp && totalCases > 0 && pp.cases / totalCases >= PING_PONG_SHARE) {
    out.push({
      id: "ping-pong",
      label: "Two teams passing a case back and forth",
      detail: `${pp.a} ↔ ${pp.b} — ${plural(pp.bounces, "bounce")} across ${plural(pp.cases, "case")} of ${totalCases}.`,
      where: "Insights → Teams",
    });
  }

  const rework = reworkFrom(variants)[0];
  if (rework && rework.perCase >= REWORK_RATE) {
    out.push({
      id: "rework",
      label: "The same step, done more than once",
      detail: `${rework.activity} runs ${rework.perCase.toFixed(1)}× per case, in ${plural(rework.cases, "case")}.`,
      where: "Insights → Teams",
    });
  }

  if (isTaskRun(variants)) {
    out.push({
      id: "task-mining",
      label: "Desktop task mining, not process mining",
      detail: "A recording of what someone actually did at the screen — app switches, copy/paste, re-keying. Scored for automation, with an RPA specification and a payback figure.",
      where: "Insights → 🤖 Automation",
    });
  }

  return out;
}

// ── Checking it against what was written down ───────────────────────────────

function conformanceFeatures(pkg: MiningExamplePackage): ExampleFeature[] {
  const out: ExampleFeature[] = [];
  const refs = (pkg.diagrams ?? []).filter((d) => d.type === "state-machine");
  if (pkg.run?.referenceSmKey && refs.length > 0) {
    out.push({
      id: "conformance",
      label: "Conformance against a reference lifecycle",
      detail: refs.length > 1
        ? `${plural(refs.length, "reference model")} ship with this example — ${refs.map((r) => r.name).join(" and ")} — so the same log can be judged against a permissive rule set and a strict one.`
        : `A reference model ships with it (${refs[0].name}), so the log can be judged against the process as written down.`,
      where: "Run detail → Conformance",
    });
    out.push({
      id: "deviation-evidence",
      label: "The cases behind a deviation",
      detail: "Every deviation resolves to actual case ids, each with its own timeline — and it states how many of the affected cases it can name rather than showing a quietly short list.",
      where: "Insights → Deviations",
    });
  }
  if (pkg.run?.kpiConfig) {
    out.push({
      id: "sla",
      label: "An SLA, so cases can be late",
      detail: "A target ships with the example, so the on-time/late split is real out of the box — and the late rate becomes something a watcher can alarm on.",
      where: "Insights → Outcomes",
    });
  }
  return out;
}

// ── Watching it, and turning it into a twin ─────────────────────────────────

function beyondFeatures(pkg: MiningExamplePackage): ExampleFeature[] {
  const out: ExampleFeature[] = [];

  if ((pkg.sampleLogs?.length ?? 0) > 1) {
    out.push({
      id: "compare",
      label: "Comparing two periods",
      detail: "Import two of the periods and put them side by side: cases, cycle times, variants, conformance, which steps got slower, and which deviations appeared or went away.",
      where: "Insights → Compare",
    });
    out.push({
      id: "alerts",
      label: "What a watcher would raise",
      detail: "The same rules the schedule uses, asked on demand — and the list of what is NOT being watched, by name, because silence reads as a clean bill of health.",
      where: "Insights → Compare",
    });
  }

  if (pkg.liveDemo) {
    out.push({
      id: "live-source",
      label: "A live source, polled in real time",
      detail: `${plural(pkg.liveDemo.batches?.length ?? 0, "poll batch", "poll batches")} ingested one at a time through the real endpoint — watch the discovered process, its variants and its bottlenecks grow as the data streams in.`,
      where: "Live-source demo panel",
    });
  }

  if (pkg.run?.twin) {
    out.push({
      id: "twin",
      label: "A calibrated digital twin",
      detail: "The mined process arrives already calibrated into a simulation — teams, durations and arrival pattern taken from the log rather than guessed.",
      where: "Calibrate & simulate",
    });
  }

  if ((pkg.runs?.length ?? 0) > 1 || pkg.domainDiagramKey) {
    out.push({
      id: "ocel",
      label: "An object-centric (OCEL) study",
      detail: `One lifecycle per object type — ${plural(pkg.runs?.length ?? 0, "run")} — tied together by a Domain Diagram of the object model.`,
      where: "Run list → study",
    });
  }

  return out;
}

/**
 * The whole summary for one Miner example, grouped so a long list stays
 * readable. Empty groups are dropped rather than rendered as headings with
 * nothing under them.
 */
export function minerExampleFeatures(pkg: MiningExamplePackage): ExampleFeatureGroup[] {
  // A catalog row whose package failed to parse must produce an empty summary
  // rather than a 500. The caller says plainly that there is nothing to show.
  if (!pkg || typeof pkg !== "object") return [];
  const { analytics, variants } = mine(pkg.sampleLog, pkg);
  const groups: ExampleFeatureGroup[] = [
    { title: "Getting the log in", features: inputFeatures(pkg) },
    { title: "Reading it", features: analysisFeatures(pkg, analytics, variants) },
    { title: "Checking it against what was written down", features: conformanceFeatures(pkg) },
    { title: "Beyond a single study", features: beyondFeatures(pkg) },
  ];
  return groups.filter((g) => g.features.length > 0);
}
