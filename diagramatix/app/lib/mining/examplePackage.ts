/**
 * The portable bundle stored on MiningExample.package — everything needed to
 * recreate a worked DiagramatixMINER example in a user's own project: the
 * compressed event log (mapping + variants + performance + stats) and the
 * reference state-machine diagram(s). Captured FROM a project (admin authoring)
 * and adopted INTO a fresh project (the learner).
 *
 * Reference diagrams are referenced by a package-local `key`, not a DB id, so
 * adopt can mint new diagram ids and point the run's `referenceSmId` at the
 * fresh id without the example carrying stale ids. Internal element/connector
 * ids are preserved on adopt, so conformance (which matches by label) and any
 * connector overlay ids stay valid. For an uncalibrated run the BPMN is
 * discovered live after adopt (the run's variants are enough to re-discover it);
 * a CALIBRATED run additionally carries its discovered BPMN + simulation twin
 * (the SimulationStudy + scenarios, and a project-scoped team/calendar library)
 * so the mined digital twin adopts ready to run.
 *
 * Mirrors app/lib/simulation/examplePackage.ts for the mining domain.
 */

import type { DiagramData } from "../diagram/types";
import type { LogMapping, MiningStats, Variant, Performance, GovernanceStats } from "./types";
// The simulation twin embedded in a mining run reuses the simulator's portable
// shapes verbatim (team + calendar library, scenario config) so capture/adopt
// stay symmetric with app/lib/simulation.
import type { ExampleTeam, ExampleCalendar, ExampleScenario } from "../simulation/examplePackage";

/** A reference state-machine diagram carried in the bundle. */
export interface MiningExampleDiagram {
  /** Package-local handle; the run's referenceSmKey references this, not a DB id. */
  key: string;
  name: string;
  type: string;       // "state-machine"
  data: DiagramData;
}

/** The mined run itself — the compressed, persistable form of the log. */
export interface MiningExampleRun {
  name: string;
  mapping: LogMapping;
  stats: MiningStats;
  variants: Variant[];
  performance: Performance;
  /** Governance aggregate (Change B) — carried so an adopted run reproduces mined
   *  control operating-effectiveness. Present only when the log had governance ids. */
  governance?: GovernanceStats;
  /** Which package diagram (by key) the run should adopt as its reference SM. */
  referenceSmKey?: string;
  /** OCEL study — the object type this run's lifecycle is for. */
  objectType?: string;
  /** OCEL study — this run's discovered state-machine diagram (by package key). */
  discoveredSmKey?: string;
  /** Calibrated simulation twin: the run's discovered BPMN (by package key) that
   *  the twin study runs as its root. Present only for a calibrated run. */
  discoveredBpmnKey?: string;
  /** Calibrated simulation twin: the SimulationStudy + scenarios mined for this
   *  run. Root = `discoveredBpmnKey`; teams/calendars live at package level
   *  (project-scoped, shared across the study's runs). */
  twin?: MiningExampleTwin;
}

/** The calibrated digital-twin carried with a run: its study name + scenarios.
 *  The study's single root is the run's `discoveredBpmnKey`; the team/calendar
 *  library it references is package-level (`MiningExamplePackage.teams/calendars`). */
export interface MiningExampleTwin {
  studyName: string;
  scenarios: ExampleScenario[];
}

/** The raw sample event log carried in the bundle. When present, adopt does NOT
 *  pre-create the run — it hands this to the console so the user lands on the
 *  Import panel pre-loaded (confirm the analysis, then Import). */
export interface MiningExampleSampleLog {
  fileName?: string;
  runName?: string;
  headers: string[];
  rows: string[][];
  mapping: LogMapping;
  /** Short chooser label when the bundle ships several scenarios (e.g. "July 2025"). */
  scenario?: string;
  /** One-line description of what's distinctive about this scenario. */
  note?: string;
}

export interface MiningExamplePackage {
  version: 1;
  /** All carried diagrams by key: reference SMs, and (for an OCEL study) the
   *  Domain Diagram + each object type's discovered state machine. */
  diagrams: MiningExampleDiagram[];
  /** The primary run. For a single-object example this IS the run; for an OCEL
   *  study it is the first of `runs` (kept so legacy consumers still work). */
  run: MiningExampleRun;
  /** OCEL study — one run per object type (the whole grouped study). When present,
   *  adopt recreates all of them + the Domain Diagram, cross-linked. */
  runs?: MiningExampleRun[];
  /** OCEL study — the Domain Diagram (object model), by package key. */
  domainDiagramKey?: string;
  /** Simulation-twin team library (project-scoped, shared across the study's
   *  per-object-type twins). Present only when a run carries a `twin`. */
  teams?: ExampleTeam[];
  /** Simulation-twin working-calendar library (referenced by teams by name). */
  calendars?: ExampleCalendar[];
  /** Optional raw log for the "confirm the CSV analysis, then import" flow.
   *  When several scenarios ship, this is the recommended/default one (also the
   *  last entry of `sampleLogs`). */
  sampleLog?: MiningExampleSampleLog;
  /** Optional set of alternative raw logs the learner can CHOOSE between on
   *  entry — e.g. the same process across different past periods with varying
   *  compliance. When present the console shows a scenario picker. */
  sampleLogs?: MiningExampleSampleLog[];
}

export function emptyMiningPackage(): MiningExamplePackage {
  return {
    version: 1,
    diagrams: [],
    run: {
      name: "Event log",
      mapping: { caseId: "", activity: "", timestamp: "" },
      stats: { cases: 0, events: 0, activities: [], states: [], variants: 0 },
      variants: [],
      performance: { clockUnit: "hour", activityDurations: {}, interArrival: [], activityResource: {}, resourceConcurrency: {}, activeHours: new Array(168).fill(0) },
    },
  };
}

/** Structural validation — returns human-readable problems (empty = valid).
 *  Used by the admin save path + before an adopt so a malformed package can't
 *  half-create a project. */
export function validateMiningExamplePackage(pkg: unknown): string[] {
  const errs: string[] = [];
  if (!pkg || typeof pkg !== "object") return ["Package is not an object"];
  const p = pkg as Partial<MiningExamplePackage>;
  if (p.version !== 1) errs.push("Unsupported or missing package version");

  if (!Array.isArray(p.diagrams)) errs.push("`diagrams` must be an array");
  const keys = new Set<string>();
  for (const d of p.diagrams ?? []) {
    if (!d || typeof d.key !== "string" || !d.key) errs.push("A diagram is missing a key");
    else if (keys.has(d.key)) errs.push(`Duplicate diagram key: ${d.key}`);
    else keys.add(d.key);
    if (!d?.data || typeof d.data !== "object") errs.push(`Diagram ${d?.key ?? "?"} has no data`);
  }

  const validateRun = (r: MiningExampleRun | undefined, label: string) => {
    if (!r || typeof r !== "object") { errs.push(`\`${label}\` is required`); return; }
    if (typeof r.name !== "string" || !r.name) errs.push(`\`${label}.name\` is required`);
    if (!r.mapping || !r.mapping.caseId || !r.mapping.activity || !r.mapping.timestamp) {
      errs.push(`\`${label}.mapping\` must map caseId, activity and timestamp`);
    }
    if (!Array.isArray(r.variants) || r.variants.length === 0) errs.push(`\`${label}.variants\` must be a non-empty array`);
    if (!r.performance || typeof r.performance.clockUnit !== "string") errs.push(`\`${label}.performance\` is required (with a clockUnit)`);
    if (r.referenceSmKey && !keys.has(r.referenceSmKey)) errs.push(`${label}.referenceSmKey "${r.referenceSmKey}" does not match any diagram key`);
    if (r.discoveredSmKey && !keys.has(r.discoveredSmKey)) errs.push(`${label}.discoveredSmKey "${r.discoveredSmKey}" does not match any diagram key`);
    if (r.discoveredBpmnKey && !keys.has(r.discoveredBpmnKey)) errs.push(`${label}.discoveredBpmnKey "${r.discoveredBpmnKey}" does not match any diagram key`);
    if (r.twin) {
      if (typeof r.twin.studyName !== "string" || !r.twin.studyName) errs.push(`${label}.twin.studyName is required`);
      if (!Array.isArray(r.twin.scenarios) || r.twin.scenarios.length === 0) errs.push(`${label}.twin.scenarios must be a non-empty array`);
      if (!r.discoveredBpmnKey) errs.push(`${label}.twin requires a discoveredBpmnKey (the study root)`);
    }
  };
  validateRun(p.run, "run");
  // OCEL study — validate each per-type run + the domain diagram key.
  if (p.runs !== undefined) {
    if (!Array.isArray(p.runs) || p.runs.length === 0) errs.push("`runs` must be a non-empty array when present");
    else p.runs.forEach((r, i) => validateRun(r, `runs[${i}]`));
  }
  if (p.domainDiagramKey && !keys.has(p.domainDiagramKey)) errs.push(`domainDiagramKey "${p.domainDiagramKey}" does not match any diagram key`);

  // Simulation-twin team/calendar library (optional): unique names + resolvable
  // calendar refs. Mirrors app/lib/simulation/examplePackage validation.
  const calendarNames = new Set<string>();
  for (const c of p.calendars ?? []) {
    if (!c || typeof c.name !== "string" || !c.name) errs.push("A twin calendar is missing a name");
    else if (calendarNames.has(c.name)) errs.push(`Duplicate twin calendar name: ${c.name}`);
    else calendarNames.add(c.name);
  }
  const teamNames = new Set<string>();
  for (const t of p.teams ?? []) {
    if (!t || typeof t.name !== "string" || !t.name) errs.push("A twin team is missing a name");
    else if (teamNames.has(t.name)) errs.push(`Duplicate twin team name: ${t.name}`);
    else teamNames.add(t.name);
    if (t?.calendarName && !calendarNames.has(t.calendarName)) errs.push(`Twin team "${t.name}" references calendar "${t.calendarName}", which is not in the package`);
  }

  const validateLog = (sl: MiningExampleSampleLog, label: string) => {
    if (!Array.isArray(sl.headers) || sl.headers.length === 0) errs.push(`\`${label}.headers\` must be a non-empty array`);
    if (!Array.isArray(sl.rows) || sl.rows.length === 0) errs.push(`\`${label}.rows\` must be a non-empty array`);
    if (!sl.mapping || !sl.mapping.caseId || !sl.mapping.activity || !sl.mapping.timestamp) {
      errs.push(`\`${label}.mapping\` must map caseId, activity and timestamp`);
    }
  };
  if (p.sampleLog !== undefined) validateLog(p.sampleLog, "sampleLog");
  if (p.sampleLogs !== undefined) {
    if (!Array.isArray(p.sampleLogs) || p.sampleLogs.length === 0) errs.push("`sampleLogs` must be a non-empty array when present");
    else p.sampleLogs.forEach((sl, i) => validateLog(sl, `sampleLogs[${i}]`));
  }

  return errs;
}

/** A small display summary for catalog cards / admin lists. Tolerates a
 *  partially-formed package (e.g. the empty default). */
export function summarizeMiningPackage(pkg: Partial<MiningExamplePackage>): { references: number; cases: number; variants: number; states: number } {
  return {
    references: pkg.diagrams?.length ?? 0,
    cases: pkg.run?.stats?.cases ?? 0,
    variants: pkg.run?.stats?.variants ?? (pkg.run?.variants?.length ?? 0),
    states: pkg.run?.stats?.states?.length ?? 0,
  };
}
