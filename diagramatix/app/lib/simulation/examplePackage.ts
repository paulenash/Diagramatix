/**
 * The portable bundle stored on SimulationExample.package — everything needed
 * to recreate a worked example in a user's own project: annotated diagrams, the
 * team library, the study + its roots, and the scenarios. Captured FROM a
 * project (admin authoring) and adopted INTO a fresh project (the learner).
 *
 * Diagrams are referenced by a package-local `key`, not a DB id, so adopt can
 * mint new diagram ids and remap the study roots + any portfolio overrides
 * without the example carrying stale ids. Internal element/connector ids are
 * preserved on adopt, so single-diagram overrides + interventions (keyed by
 * element/edge id) and team references (by name) survive intact.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import type { ScenarioRunConfig } from "./types";
import type { OverrideSet } from "./overrides";

export interface ExampleDiagram {
  /** Package-local handle; study roots reference this, not a DB id. */
  key: string;
  name: string;
  type: string;       // "bpmn"
  data: DiagramData;
}

export interface ExampleTeam {
  name: string;
  capacity: number;
  costPerHour?: number | null;
  efficiency?: number;
}

export interface ExampleScenario {
  name: string;
  isBaseline?: boolean;
  runConfig: ScenarioRunConfig;
  overrides?: OverrideSet;
}

export interface ExamplePackage {
  version: 1;
  teams: ExampleTeam[];
  diagrams: ExampleDiagram[];
  study: { name: string; rootKeys: string[] };
  scenarios: ExampleScenario[];
}

export function emptyPackage(): ExamplePackage {
  return { version: 1, teams: [], diagrams: [], study: { name: "Example study", rootKeys: [] }, scenarios: [] };
}

/** Structural validation — returns human-readable problems (empty = valid).
 *  Used by the admin save path + before an adopt so a malformed package can't
 *  half-create a project. */
export function validateExamplePackage(pkg: unknown): string[] {
  const errs: string[] = [];
  if (!pkg || typeof pkg !== "object") return ["Package is not an object"];
  const p = pkg as Partial<ExamplePackage>;
  if (p.version !== 1) errs.push("Unsupported or missing package version");

  if (!Array.isArray(p.diagrams)) errs.push("`diagrams` must be an array");
  const keys = new Set<string>();
  for (const d of p.diagrams ?? []) {
    if (!d || typeof d.key !== "string" || !d.key) errs.push("A diagram is missing a key");
    else if (keys.has(d.key)) errs.push(`Duplicate diagram key: ${d.key}`);
    else keys.add(d.key);
    if (!d?.data || typeof d.data !== "object") errs.push(`Diagram ${d?.key ?? "?"} has no data`);
  }
  if ((p.diagrams ?? []).length === 0) errs.push("At least one diagram is required");

  if (!Array.isArray(p.teams)) errs.push("`teams` must be an array");
  const teamNames = new Set<string>();
  for (const t of p.teams ?? []) {
    if (!t || typeof t.name !== "string" || !t.name) errs.push("A team is missing a name");
    else if (teamNames.has(t.name)) errs.push(`Duplicate team name: ${t.name}`);
    else teamNames.add(t.name);
  }

  if (!p.study || typeof p.study.name !== "string") errs.push("`study.name` is required");
  for (const rk of p.study?.rootKeys ?? []) {
    if (!keys.has(rk)) errs.push(`Study root "${rk}" does not match any diagram key`);
  }

  if (!Array.isArray(p.scenarios)) errs.push("`scenarios` must be an array");
  if ((p.scenarios ?? []).filter((s) => s?.isBaseline).length > 1) errs.push("At most one baseline scenario");

  return errs;
}

/** A small display summary for catalog cards / admin lists. Tolerates a
 *  partially-formed package (e.g. the empty `{}` default). */
export function summarizePackage(pkg: Partial<ExamplePackage>): { diagrams: number; teams: number; scenarios: number; roots: number } {
  return {
    diagrams: pkg.diagrams?.length ?? 0,
    teams: pkg.teams?.length ?? 0,
    scenarios: pkg.scenarios?.length ?? 0,
    roots: pkg.study?.rootKeys?.length ?? 0,
  };
}
