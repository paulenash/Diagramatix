/**
 * What a Simulator example illustrates, derived from its own package.
 *
 * Mirrors `app/lib/mining/exampleFeatures.ts`, and follows the same rule: the
 * list is COMPUTED from the bundle, never typed beside it, because a
 * hand-maintained feature list goes stale in silence. An example that loses its
 * business-case inputs would still advertise a payback month, and nothing
 * anywhere would go red.
 *
 * Everything here is structural — read off the package and off the diagrams it
 * carries. There is no equivalent of the Miner's "mine the log and quote the
 * figure", because a simulation's numbers do not exist until it is run, and
 * quoting a result the reader has not produced would be inventing one.
 *
 * Pure — no DB, no React.
 */

import type { ExampleFeature, ExampleFeatureGroup } from "../exampleFeature";
import type { ExamplePackage } from "./examplePackage";
import type { DiagramData } from "../diagram/types";

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

/** Every diagram in the bundle, flattened, for the notation scan below. */
function allData(pkg: ExamplePackage): DiagramData[] {
  return (pkg.diagrams ?? []).map((d) => d.data).filter(Boolean);
}

// ── The process being simulated ─────────────────────────────────────────────

function processFeatures(pkg: ExamplePackage): ExampleFeature[] {
  const out: ExampleFeature[] = [];
  const diagrams = pkg.diagrams ?? [];
  const roots = pkg.study?.rootKeys ?? [];
  const companions = pkg.companionKeys ?? [];

  if (roots.length > 1) {
    out.push({
      id: "multi-root",
      label: "Several diagrams assembled into one process",
      detail: `${plural(roots.length, "root diagram")} are run together, so a process spanning more than one model is simulated end to end rather than one page at a time.`,
      where: "Simulator → study roots",
    });
  } else if (diagrams.length > 1) {
    out.push({
      id: "linked-diagrams",
      label: "A process across linked diagrams",
      detail: `${plural(diagrams.length, "diagram")} travel with the example, and the study runs ${roots.length === 1 ? "one of them" : plural(roots.length, "of them")} as its root — the rest are reached from it, or ride along beside it.`,
      where: "Project → diagrams",
    });
  }

  const data = allData(pkg);
  const has = (fn: (d: DiagramData) => boolean) => data.some(fn);

  if (has((d) => (d.connectors ?? []).some((c) => typeof c.branchPercent === "number"))) {
    out.push({
      id: "branch-percent",
      label: "Gateways that split the traffic",
      detail: "Branch percentages on the outgoing flows, so the simulation routes cases the way the real process does instead of splitting them evenly.",
      where: "Properties → a gateway's flows",
    });
  }
  // What SHAPE the durations have, which is the difference between a model
  // that queues like the real process and one that does not.
  const dists = new Set<string>();
  for (const d of data) for (const e of d.elements ?? []) {
    const k = (e.properties as { sim?: { cycleTime?: { kind?: string } } } | undefined)?.sim?.cycleTime?.kind;
    if (k) dists.add(k);
  }
  if (dists.has("lognormal") || dists.has("empirical")) {
    out.push({
      id: "skewed-durations",
      label: "Service times with the shape real work has",
      detail: dists.has("empirical")
        ? "Durations resampled from the observed values — no curve laid over the data at all."
        : "The judgement tasks use a lognormal: most cases routine, a minority far longer. A symmetric distribution cannot produce that tail, and the tail is what makes a queue form.",
      where: "Properties → Simulation → Cycle time",
    });
  }
  if (has((d) => (d.elements ?? []).some((e) => typeof (e.properties as { sim?: { fixedCost?: number } } | undefined)?.sim?.fixedCost === "number"))) {
    out.push({
      id: "activity-cost",
      label: "Costs that do not scale with time",
      detail: "A per-run charge on an activity — a bureau fee, a courier — so a redesign that stops the work being done shows the saving even when it saves no time.",
      where: "Properties → Simulation → Cost per run",
    });
  }
  if (has((d) => (d.elements ?? []).some((e) => !!e.boundaryHostId))) {
    out.push({
      id: "boundary-events",
      label: "Boundary events — timeouts, errors, escalations",
      detail: "Events mounted on the edge of a task, so a case can leave it before it finishes. That is where most of the interesting behaviour in a real process lives.",
      where: "The diagram",
    });
  }
  if (has((d) => (d.elements ?? []).some((e) => e.type === "subprocess" || e.type === "subprocess-expanded"))) {
    out.push({
      id: "subprocess",
      label: "Subprocesses",
      detail: "Work nested inside a step, simulated as its own flow rather than as a single black box with an average duration.",
      where: "The diagram",
    });
  }
  if (has((d) => (d.elements ?? []).some((e) => e.eventType === "compensation"))) {
    out.push({
      id: "compensation",
      label: "Compensation — undoing work already done",
      detail: "A cancelled case walks its completed steps back, which is the part of BPMN most tools draw and almost none actually execute.",
      where: "The diagram",
    });
  }

  if (companions.length > 0) {
    out.push({
      id: "companions",
      label: "A companion model travelling with the process",
      detail: `${plural(companions.length, "diagram")} carried alongside but never run — the operating model a team's skills matrix was filled from, so the fill can be repeated rather than looking hand-typed.`,
      where: "Project → diagrams",
    });
  }

  return out;
}

// ── Who does the work ───────────────────────────────────────────────────────

function resourceFeatures(pkg: ExamplePackage): ExampleFeature[] {
  const out: ExampleFeature[] = [];
  const teams = pkg.teams ?? [];
  if (teams.length === 0) return out;

  out.push({
    id: "teams",
    label: "Teams with finite capacity",
    detail: `${plural(teams.length, "team")} — ${teams.slice(0, 4).map((t) => `${t.name} (${t.capacity})`).join(", ")}${teams.length > 4 ? ", …" : ""}. Work queues when they are busy, which is what makes a simulation different from a spreadsheet.`,
    where: "Simulator → Teams",
  });

  if (teams.some((t) => typeof t.costPerHour === "number" && t.costPerHour !== null)) {
    out.push({
      id: "costs",
      label: "Cost per hour, so a run has a price",
      detail: "Each team carries an hourly cost, so a scenario reports what it costs as well as how long it takes.",
      where: "Simulator → Teams",
    });
  }
  if (teams.some((t) => typeof t.efficiency === "number" && t.efficiency !== 1)) {
    out.push({
      id: "efficiency",
      label: "Teams that are not all equally fast",
      detail: "An efficiency factor per team, so the same task takes longer in one place than another.",
      where: "Simulator → Teams",
    });
  }
  if (teams.some((t) => (t.members ?? []).some((m) => (m.skills ?? []).length > 0))) {
    out.push({
      id: "skills",
      label: "Named people and a skills matrix",
      detail: "The team is individuals with skills rather than a counted pool, so a task that needs a particular skill waits for someone who has it.",
      where: "Simulator → Teams → members",
    });
  }
  if ((pkg.calendars ?? []).length > 0) {
    const names = (pkg.calendars ?? []).map((c) => c.name).slice(0, 3).join(", ");
    out.push({
      id: "calendars",
      label: "Working hours, not a 24-hour day",
      detail: `${plural((pkg.calendars ?? []).length, "working calendar")} (${names}). A case that arrives at 4:55pm waits overnight, which is usually where the elapsed time actually goes.`,
      where: "Simulator → Calendars",
    });
  }

  return out;
}

// ── Asking a question of it ─────────────────────────────────────────────────

function studyFeatures(pkg: ExamplePackage): ExampleFeature[] {
  const out: ExampleFeature[] = [];
  const scenarios = pkg.scenarios ?? [];

  if (scenarios.length > 1) {
    out.push({
      id: "scenarios",
      label: "Several scenarios to compare",
      detail: `${plural(scenarios.length, "scenario")} — ${scenarios.slice(0, 4).map((s) => s.name).join(", ")}${scenarios.length > 4 ? ", …" : ""}. Run them side by side rather than changing one number and losing the previous answer.`,
      where: "Simulator → Scenarios",
    });
  }
  if (scenarios.some((s) => (s.variantRootKeys ?? []).length > 0)) {
    out.push({
      id: "as-is-to-be",
      label: "As-is against to-be",
      detail: "A scenario that runs a DIFFERENT diagram from the baseline, so a redesign is compared with the current process rather than with a tweaked copy of itself.",
      where: "Simulator → Scenarios → variant root",
    });
  }
  if (scenarios.some((s) => s.overrides && Object.keys(s.overrides).length > 0)) {
    out.push({
      id: "overrides",
      label: "What-if without touching the model",
      detail: "Scenario overrides change capacity, durations or arrival rate for one run only, leaving the diagram and the baseline alone.",
      where: "Simulator → Scenarios → overrides",
    });
  }
  if (pkg.study?.businessCase) {
    out.push({
      id: "business-case",
      label: "A business case with a payback month",
      detail: "Implementation cost, annual volume and cost of delay travel with the study, so a comparison produces a payback figure rather than two durations the reader has to price themselves.",
      where: "Simulator → Business case",
    });
  }
  if (scenarios.length > 0) {
    out.push({
      id: "replay",
      label: "Replay — watch the cases move",
      detail: "Any run can be replayed over the diagram, tokens and queues visible, which is the fastest way to see why a bottleneck is where it is.",
      where: "Simulator → Replay",
    });
  }

  return out;
}

/**
 * The whole summary for one Simulator example, grouped so a long list stays
 * readable. Empty groups are dropped rather than rendered as headings with
 * nothing under them.
 */
export function simulatorExampleFeatures(pkg: ExamplePackage): ExampleFeatureGroup[] {
  // A catalog row whose package failed to parse, or an older one that predates
  // a field, must produce an empty summary rather than a 500. The caller says
  // plainly that there is nothing to point at.
  if (!pkg || typeof pkg !== "object") return [];
  const groups: ExampleFeatureGroup[] = [
    { title: "The process being simulated", features: processFeatures(pkg) },
    { title: "Who does the work", features: resourceFeatures(pkg) },
    { title: "Asking a question of it", features: studyFeatures(pkg) },
  ];
  return groups.filter((g) => g.features.length > 0);
}
