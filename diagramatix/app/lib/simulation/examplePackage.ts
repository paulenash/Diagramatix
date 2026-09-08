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

import type { DiagramData } from "../diagram/types";
import type { ScenarioRunConfig, WorkCalendar } from "./types";
import type { BusinessCaseInputs } from "./facts/businessCase";
import type { OverrideSet } from "./overrides";

export interface ExampleDiagram {
  /** Package-local handle; study roots reference this, not a DB id. */
  key: string;
  name: string;
  type: string;       // "bpmn"
  data: DiagramData;
}

/** One named person on a team, and what they can do. */
export interface ExampleTeamMember {
  name: string;
  skills: string[];
}

export interface ExampleTeam {
  name: string;
  capacity: number;
  costPerHour?: number | null;
  efficiency?: number;
  /** Working calendar this team follows, by package-local calendar name. */
  calendarName?: string;
  /**
   * Named people and their skills. ABSENT/EMPTY = a counted pool of
   * interchangeable units, which is what every package held before skills
   * existed and what a re-captured older package still holds.
   *
   * Carried because without it a cross-skilled example adopts as a plain counted
   * pool — SILENTLY. Every task's `requiredSkills` would still be in the diagram
   * and every one of them would be ignored (a pool with no units grants any
   * request), so the example would run, look fine, and teach the opposite of
   * what it claims.
   */
  members?: ExampleTeamMember[];
  /** Where the skills were last filled from: { diagramId, diagramName, at }.
   *  Provenance only — carried so an adopted example can still say its matrix
   *  came from an ArchiMate diagram rather than looking hand-typed. */
  skillsSource?: Record<string, unknown>;
}

/** A reusable working calendar carried in the bundle (referenced by teams —
 *  and, later, sources — by name; adopt mints a new id per calendar). */
export interface ExampleCalendar {
  name: string;
  pattern: WorkCalendar;
  /** The calendar's id in the project it was captured from. Carried so a SCOPED
   *  BACKUP restore — whose diagrams are rebuilt from raw rows still holding
   *  that id — can re-point a source's `sim.calendarId` at the new row. Package
   *  diagram data references calendars by NAME, so this is only the fallback. */
  id?: string;
}

export interface ExampleScenario {
  name: string;
  isBaseline?: boolean;
  runConfig: ScenarioRunConfig;
  overrides?: OverrideSet;
  /** Process-variant roots for As-is vs To-be comparison studies: the diagram
   *  KEY(s) this scenario runs instead of the study's roots. Empty/absent = run
   *  the study roots. Referenced by package key (not DB id) so adopt can remap
   *  to the freshly-minted diagram ids. */
  variantRootKeys?: string[];
}

/** A project's simulation LIBRARY on its own — the teams + calendars, with no
 *  study attached. A package always embeds one of these, but a project can own
 *  a library before any study exists, so backups/exports carry it separately
 *  too (see captureProjectLibrary). */
export interface ExampleLibrary {
  teams: ExampleTeam[];
  calendars?: ExampleCalendar[];
}

export interface ExamplePackage extends ExampleLibrary {
  version: 1;
  diagrams: ExampleDiagram[];
  study: {
    name: string;
    rootKeys: string[];
    /** Implementation cost, annual volume, cost of delay. Carried because they
     *  live on the STUDY, not on a scenario, and a business case without them
     *  cannot produce a payback month — so an adopted comparison example would
     *  silently lose the one figure it exists to show. */
    businessCase?: BusinessCaseInputs;
  };
  scenarios: ExampleScenario[];
  /**
   * Diagrams carried alongside the process but NOT run by it — today, the
   * ArchiMate operating model a team's skills matrix was filled from.
   *
   * Capture used to take the study's roots and variant roots and nothing else,
   * so a companion diagram could never travel: an adopted example arrived with a
   * skills matrix whose stated source did not exist, and the learner could never
   * repeat the fill that produced it.
   *
   * These are diagram KEYS into `diagrams`, like every other reference here.
   * They are never study roots and are never assembled or run.
   */
  companionKeys?: string[];
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

  // Calendar library (optional): unique names.
  const calendarNames = new Set<string>();
  for (const c of p.calendars ?? []) {
    if (!c || typeof c.name !== "string" || !c.name) errs.push("A calendar is missing a name");
    else if (calendarNames.has(c.name)) errs.push(`Duplicate calendar name: ${c.name}`);
    else calendarNames.add(c.name);
  }

  if (!Array.isArray(p.teams)) errs.push("`teams` must be an array");
  const teamNames = new Set<string>();
  for (const t of p.teams ?? []) {
    if (!t || typeof t.name !== "string" || !t.name) errs.push("A team is missing a name");
    else if (teamNames.has(t.name)) errs.push(`Duplicate team name: ${t.name}`);
    else teamNames.add(t.name);
    if (t?.calendarName && !calendarNames.has(t.calendarName)) errs.push(`Team "${t.name}" references calendar "${t.calendarName}", which is not in the package`);
    const memberNames = new Set<string>();
    for (const m of t?.members ?? []) {
      if (!m || typeof m.name !== "string" || !m.name.trim()) { errs.push(`Team "${t?.name ?? "?"}" has a member with no name`); continue; }
      const key = m.name.replace(/\s+/g, " ").trim().toLowerCase();
      if (memberNames.has(key)) errs.push(`Team "${t.name}" names "${m.name}" twice`);
      memberNames.add(key);
      if (!Array.isArray(m.skills)) errs.push(`Team "${t.name}" member "${m.name}" has no skills array`);
    }
    // A team that names FEWER people than its capacity can never reach that
    // capacity — pickUnits can only choose from people who exist, so the spare
    // capacity is unreachable. Legitimate to model, but silent, and in an
    // EXAMPLE it is almost always a mistake in the authoring.
    if ((t?.members?.length ?? 0) > 0 && (t?.members?.length ?? 0) < (t?.capacity ?? 0)) {
      errs.push(`Team "${t.name}" has capacity ${t.capacity} but names only ${t.members!.length} people, so it can never work more than ${t.members!.length} cases at once`);
    }
  }

  if (!p.study || typeof p.study.name !== "string") errs.push("`study.name` is required");
  for (const rk of p.study?.rootKeys ?? []) {
    if (!keys.has(rk)) errs.push(`Study root "${rk}" does not match any diagram key`);
  }

  for (const ck of p.companionKeys ?? []) {
    if (!keys.has(ck)) errs.push(`Companion diagram "${ck}" does not match any diagram key`);
    // A companion that is also a root is a contradiction: roots are run, and
    // companions exist precisely because they are not.
    else if ((p.study?.rootKeys ?? []).includes(ck)) errs.push(`Diagram "${ck}" is both a study root and a companion`);
  }

  if (!Array.isArray(p.scenarios)) errs.push("`scenarios` must be an array");
  if ((p.scenarios ?? []).filter((s) => s?.isBaseline).length > 1) errs.push("At most one baseline scenario");
  for (const s of p.scenarios ?? []) {
    for (const vk of s?.variantRootKeys ?? []) {
      if (!keys.has(vk)) errs.push(`Scenario "${s?.name ?? "?"}" variant root "${vk}" does not match any diagram key`);
    }
  }

  return errs;
}

/** A small display summary for catalog cards / admin lists. Tolerates a
 *  partially-formed package (e.g. the empty `{}` default). */
export function summarizePackage(pkg: Partial<ExamplePackage>): { diagrams: number; teams: number; scenarios: number; roots: number; companions: number } {
  return {
    diagrams: pkg.diagrams?.length ?? 0,
    teams: pkg.teams?.length ?? 0,
    scenarios: pkg.scenarios?.length ?? 0,
    roots: pkg.study?.rootKeys?.length ?? 0,
    companions: pkg.companionKeys?.length ?? 0,
  };
}
