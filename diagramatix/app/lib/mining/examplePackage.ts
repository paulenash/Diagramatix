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
 * connector overlay ids stay valid. The BPMN is discovered live after adopt, so
 * it is NOT carried here — the run's variants are enough to (re)discover it.
 *
 * Mirrors app/lib/simulation/examplePackage.ts for the mining domain.
 */

import type { DiagramData } from "../diagram/types";
import type { LogMapping, MiningStats, Variant, Performance } from "./types";

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
  /** Which package diagram (by key) the run should adopt as its reference SM. */
  referenceSmKey?: string;
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
  /** Reference state-machine diagrams (the single source of truth for states). */
  diagrams: MiningExampleDiagram[];
  run: MiningExampleRun;
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
      mapping: { caseId: "", activity: "", timestamp: "", state: "" },
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

  const r = p.run;
  if (!r || typeof r !== "object") { errs.push("`run` is required"); return errs; }
  if (typeof r.name !== "string" || !r.name) errs.push("`run.name` is required");
  if (!r.mapping || !r.mapping.caseId || !r.mapping.activity || !r.mapping.timestamp || !r.mapping.state) {
    errs.push("`run.mapping` must map caseId, activity, timestamp and state");
  }
  if (!Array.isArray(r.variants) || r.variants.length === 0) errs.push("`run.variants` must be a non-empty array");
  if (!r.performance || typeof r.performance.clockUnit !== "string") errs.push("`run.performance` is required (with a clockUnit)");
  if (r.referenceSmKey && !keys.has(r.referenceSmKey)) errs.push(`run.referenceSmKey "${r.referenceSmKey}" does not match any diagram key`);

  const validateLog = (sl: MiningExampleSampleLog, label: string) => {
    if (!Array.isArray(sl.headers) || sl.headers.length === 0) errs.push(`\`${label}.headers\` must be a non-empty array`);
    if (!Array.isArray(sl.rows) || sl.rows.length === 0) errs.push(`\`${label}.rows\` must be a non-empty array`);
    if (!sl.mapping || !sl.mapping.caseId || !sl.mapping.activity || !sl.mapping.timestamp || !sl.mapping.state) {
      errs.push(`\`${label}.mapping\` must map caseId, activity, timestamp and state`);
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
