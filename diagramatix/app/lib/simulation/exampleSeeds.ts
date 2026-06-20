/**
 * Starter example simulations — the fully-operational seed set for the catalog
 * (Phase 6). Each package is built here (not hardcoded in the DB) so it can be
 * unit-tested for operability: every diagram assembles + runs and produces real
 * metrics. The seed script just upserts these; admins then edit / duplicate /
 * extend them, and can author entirely new ones by capturing a project.
 *
 * Each example isolates one concept a simulation master demos:
 *   1. Single bottleneck — one saturated pool; baseline vs +1 staff.
 *   2. Shared team across two processes — cross-process contention; baseline
 *      vs hiring.
 *   3. Surge intervention — a planned timed capacity surge vs the baseline.
 */

import type { DiagramData, DiagramElement, Connector, SymbolType } from "../diagram/types";
import type { ScenarioRunConfig, SimDist } from "./types";
import type { ExamplePackage, ExampleScenario } from "./examplePackage";

interface Step { id: string; label: string; cycle: SimDist; team?: string }

/** Build a left-to-right linear BPMN process: start → steps… → end, annotated
 *  with arrival + per-task cycle time + team. Element/connector ids are stable
 *  so scenario overrides + interventions survive adopt. */
function linearProcess(_name: string, arrival: SimDist, steps: Step[]): DiagramData {
  const el = (id: string, type: SymbolType, x: number, label: string, sim?: object): DiagramElement => ({
    id, type, x, y: 140, width: type.endsWith("event") ? 48 : 120, height: type.endsWith("event") ? 48 : 64,
    label, properties: sim ? { sim } : {},
  });
  // A fully-formed BPMN sequence flow — the editor/canvas needs every field
  // (notably `waypoints`, which the reducer maps over on load); a bare
  // {id,source,target} renders fine for the engine but crashes the editor.
  const mkConn = (id: string, s: string, t: string): Connector => ({
    id, sourceId: s, targetId: t,
    sourceSide: "right", targetSide: "left",
    type: "sequence",
    directionType: "directed",
    routingType: "rectilinear",
    sourceInvisibleLeader: false,
    targetInvisibleLeader: false,
    waypoints: [],
  });

  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];
  let x = 60;
  elements.push(el("start", "start-event", x, "Work arrives", { arrival, maxArrivals: undefined }));
  let prev = "start";
  x += 140;
  for (const s of steps) {
    elements.push(el(s.id, "task", x, s.label, { cycleTime: s.cycle, ...(s.team ? { teamId: s.team } : {}) }));
    connectors.push(mkConn(`c_${prev}_${s.id}`, prev, s.id));
    prev = s.id; x += 200;
  }
  elements.push(el("end", "end-event", x, "Done"));
  connectors.push(mkConn(`c_${prev}_end`, prev, "end"));
  return { viewport: { x: 0, y: 0, zoom: 1 }, elements, connectors } as DiagramData;
}

const exp = (mean: number): SimDist => ({ kind: "exponential", mean });
const tri = (min: number, mode: number, max: number): SimDist => ({ kind: "triangular", min, mode, max });

const cfg = (over: Partial<ScenarioRunConfig> = {}): ScenarioRunConfig =>
  ({ clockUnit: "minute", horizon: 2000, warmUp: 200, replications: 12, seed: 1, collectQueues: true, ...over });

export interface StarterExample {
  slug: string;
  title: string;
  concept: string;
  description: string;
  difficulty: "intro" | "core" | "advanced";
  package: ExamplePackage;
}

// ── 1. Single bottleneck ────────────────────────────────────────────────────
const bottleneck: StarterExample = {
  slug: "single-bottleneck",
  title: "Single bottleneck",
  concept: "One team can't keep up — watch the queue build, then add a person.",
  difficulty: "intro",
  description: [
    "A claims team handles one task. Work arrives faster than one person can clear it,",
    "so a queue forms and wait time climbs.",
    "",
    "**Demo:** Run the *Baseline* — Analysts sit near 100% utilisation with a growing queue.",
    "Then compare with *Add an analyst* (capacity 2) to see the wait collapse. Launch the",
    "Replay to watch tokens stack at the task, or the Heatmap to see it glow.",
  ].join("\n"),
  package: {
    version: 1,
    teams: [{ name: "Analysts", capacity: 1 }],
    diagrams: [{ key: "claims", name: "Claims handling", type: "bpmn", data: linearProcess("Claims handling", exp(10), [
      { id: "assess", label: "Assess claim", cycle: exp(8), team: "Analysts" },
    ]) }],
    study: { name: "Can one analyst cope?", rootKeys: ["claims"] },
    scenarios: [
      { name: "Baseline (1 analyst)", isBaseline: true, runConfig: cfg() },
      { name: "Add an analyst", runConfig: cfg(), overrides: { teams: { Analysts: { capacity: 2 } } } },
    ],
  },
};

// ── 2. Shared team across two processes ─────────────────────────────────────
const sharedTeam: StarterExample = {
  slug: "shared-team-two-processes",
  title: "Shared team, two processes",
  concept: "Two processes draw on the same pool — cross-process contention you can't see in one diagram.",
  difficulty: "core",
  description: [
    "Onboarding and Support both rely on the same *Case Workers* pool. Each process looks",
    "fine alone, but together they overload the shared team.",
    "",
    "**Demo:** Run the *Baseline* and note Case Workers are the top bottleneck across BOTH",
    "processes. Then *Hire two more* and compare — the portfolio view is the point: capacity",
    "planning across processes, not per-diagram.",
  ].join("\n"),
  package: {
    version: 1,
    teams: [{ name: "Case Workers", capacity: 3 }],
    diagrams: [
      { key: "onboarding", name: "Customer onboarding", type: "bpmn", data: linearProcess("Customer onboarding", exp(12), [
        { id: "verify", label: "Verify identity", cycle: tri(4, 6, 10), team: "Case Workers" },
        { id: "setup", label: "Set up account", cycle: exp(7), team: "Case Workers" },
      ]) },
      { key: "support", name: "Support tickets", type: "bpmn", data: linearProcess("Support tickets", exp(9), [
        { id: "triage", label: "Triage ticket", cycle: exp(5), team: "Case Workers" },
      ]) },
    ],
    study: { name: "Can the team carry both?", rootKeys: ["onboarding", "support"] },
    scenarios: [
      { name: "Baseline (3 workers)", isBaseline: true, runConfig: cfg() },
      { name: "Hire two more", runConfig: cfg(), overrides: { teams: { "Case Workers": { capacity: 5 } } } },
    ],
  },
};

// ── 3. Planned surge intervention ───────────────────────────────────────────
const surge: StarterExample = {
  slug: "surge-intervention",
  title: "Surge staffing intervention",
  concept: "Schedule a timed capacity surge and compare it to leaving the team as-is.",
  difficulty: "core",
  description: [
    "A processing line is overloaded for the whole run. The *Surge* scenario schedules a",
    "planned intervention: at t=120 add capacity for 600 minutes, then revert.",
    "",
    "**Demo:** Compare *Baseline* vs *Surge at t=120* — the surge clears the backlog for a",
    "window. This is the deterministic cousin of the live Operator 'fork the timeline'.",
  ].join("\n"),
  package: {
    version: 1,
    teams: [{ name: "Processors", capacity: 1 }],
    diagrams: [{ key: "line", name: "Processing line", type: "bpmn", data: linearProcess("Processing line", exp(6), [
      { id: "process", label: "Process item", cycle: exp(5), team: "Processors" },
    ]) }],
    study: { name: "Does a surge help?", rootKeys: ["line"] },
    scenarios: [
      { name: "Baseline (no surge)", isBaseline: true, runConfig: cfg({ horizon: 1500 }) },
      {
        name: "Surge at t=120",
        runConfig: cfg({ horizon: 1500, interventions: [{ id: "surge1", t: 120, kind: "capacity", target: "Processors", value: 4, duration: 600 }] }),
      } as ExampleScenario,
    ],
  },
};

export const STARTER_EXAMPLES: StarterExample[] = [bottleneck, sharedTeam, surge];
