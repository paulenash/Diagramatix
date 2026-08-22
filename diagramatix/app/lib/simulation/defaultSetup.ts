/**
 * Default simulation setup: the calendars / teams / study a project should have
 * so the simulator is usable the moment it opens, instead of an empty library.
 *
 * `planDefaultSetup` is PURE — it takes what already exists and returns only what
 * is MISSING (idempotent: run it on every open, it never duplicates or clobbers).
 * The caller (SimulatorConsole) applies the plan via the existing POST routes.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import type { WorkCalendar } from "./types";
import { harvestReferencedTeams } from "./harvestTeams";
import { hasAutomatedWork, AUTOMATED_RESOURCE_NAME, AUTOMATED_RESOURCE_CAPACITY, AUTOMATED_CALENDAR_NAME } from "./automation";

const MON_FRI = [0, 1, 2, 3, 4]; // sim clock: day 0 = Monday

/** The three calendars every project should have (names matched case-insensitively
 *  against existing rows so we never create a duplicate). Business Hours is the
 *  default a freshly-harvested team is assigned. */
export const BUSINESS_HOURS_NAME = "Business Hours";
export const DEFAULT_CALENDARS: { name: string; calendar: WorkCalendar }[] = [
  { name: "24/7", calendar: { intervals: [] } },
  { name: BUSINESS_HOURS_NAME, calendar: { intervals: MON_FRI.map((day) => ({ day, start: "09:00", end: "17:00" })) } },
  { name: "Business Hours + lunch", calendar: { intervals: MON_FRI.flatMap((day) => [{ day, start: "09:00", end: "12:00" }, { day, start: "13:00", end: "17:00" }]) } },
];

const DEFAULT_STUDY_NAME = "Initial Study";
const DEFAULT_SCENARIO_NAME = "Baseline";

export interface DefaultSetupPlan {
  calendarsToCreate: { name: string; calendar: WorkCalendar }[];
  /** Resources to create. People default to one person on Business Hours; the
   *  shared Automation resource runs around the clock and is effectively
   *  unconstrained, so system steps never become an accidental bottleneck. */
  teamsToCreate: { name: string; capacity: number; calendarName: string }[];
  /** true when the project has no studies → create Initial Study + Baseline. */
  createStudy: boolean;
  studyName: string;
  scenarioName: string;
}

/** Compute the missing defaults for a project's simulator, idempotently. */
export function planDefaultSetup(
  diagrams: DiagramData[],
  existing: { calendars: { name: string }[]; teams: { name: string }[]; studyCount: number },
): DefaultSetupPlan {
  const haveCal = new Set(existing.calendars.map((c) => c.name.trim().toLowerCase()));
  const haveTeam = new Set(existing.teams.map((t) => t.name.trim().toLowerCase()));

  const calendarsToCreate = DEFAULT_CALENDARS.filter((c) => !haveCal.has(c.name.toLowerCase()));
  // People, from the lanes and assignments the model references.
  const names = harvestReferencedTeams(diagrams);
  // …plus the shared Automation resource, but ONLY when the model actually
  // contains system work. Like the lane resources it is harvested from what the
  // user drew, never conjured, and it is editable like any other row.
  if (hasAutomatedWork(diagrams) && !names.some((n) => n.toLowerCase() === AUTOMATED_RESOURCE_NAME.toLowerCase())) {
    names.push(AUTOMATED_RESOURCE_NAME);
  }
  const teamsToCreate = names
    .filter((name) => !haveTeam.has(name.trim().toLowerCase()))
    .map((name) => (name.toLowerCase() === AUTOMATED_RESOURCE_NAME.toLowerCase()
      ? { name, capacity: AUTOMATED_RESOURCE_CAPACITY, calendarName: AUTOMATED_CALENDAR_NAME }
      : { name, capacity: 1, calendarName: BUSINESS_HOURS_NAME }));

  return {
    calendarsToCreate,
    teamsToCreate,
    createStudy: existing.studyCount === 0,
    studyName: DEFAULT_STUDY_NAME,
    scenarioName: DEFAULT_SCENARIO_NAME,
  };
}
