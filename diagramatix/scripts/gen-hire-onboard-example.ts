/**
 * Author the Hire & Onboard capstone example (slices 6 + 7).
 *
 * Plan: audit/Example-Hire-and-Onboard-Plan.md. Sizing: scratchpad/hire-onboard-final.cjs.
 *
 * WHY A SCRIPT AND NOT THE EDITOR. The plan says to author through the editor,
 * because hand-written diagram JSON goes stale against the editor's own
 * invariants. This does the next best thing: it feeds the process through
 * `layoutBpmnDiagram` and the ArchiMate model through `layoutGenericDiagram` —
 * the SAME functions the AI generator and the image importer use — so geometry,
 * waypoints, attachment sides and routing fields are produced by the product,
 * not by me. Only the sim parameters are attached afterwards, by label.
 *
 * It MERGES BY SLUG into exampleData.json and never rewrites the file wholesale:
 * that is the exact failure (0.4 in the extensions plan) that once destroyed
 * three examples, and T3369 exists to catch it.
 *
 * Re-runnable. Run with:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix && npx tsx scripts/gen-hire-onboard-example.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "../app/lib/diagram/bpmnLayout";
import { layoutGenericDiagram } from "../app/lib/diagram/genericLayout";
import type { DiagramData, DiagramElement } from "../app/lib/diagram/types";
import type { ExamplePackage, ExampleTeam } from "../app/lib/simulation/examplePackage";
import type { SimDist, WorkCalendar } from "../app/lib/simulation/types";

const SLUG = "hire-and-onboard";
const DATA = join(process.cwd(), "app/lib/simulation/exampleData.json");

// ═════════════════════════════════════════════════════════════════════════
// Teams. Utilisations are from the sizing script; no team is above 59%, which
// is the point — nothing in the utilisation panel looks like a problem.
// ═════════════════════════════════════════════════════════════════════════
const HR_HOURS = "HR business hours";
const IT_HOURS = "IT service desk";

const SK = {
  sourcing: "Sourcing",
  negotiation: "Offer Negotiation",
  compliance: "Compliance Accreditation",
  payroll: "Payroll Administration",
  onboarding: "Onboarding Administration",
  device: "Device Provisioning",
} as const;

const teams: ExampleTeam[] = [
  // A counted pool, deliberately: you only name people where naming DOES
  // something, and no hiring-manager task carries a skill requirement.
  { name: "Hiring Manager", capacity: 6, costPerHour: 95, calendarName: HR_HOURS },
  {
    // TEN, not eight. At eight, Talent Acquisition ran at 63% against HR
    // Operations' 61% and became `bottlenecks[0]` — so the example's own
    // bottleneck report pointed at the wrong team, and the story "the busiest
    // team is fine, its people are not" had the wrong team in it. TA carries
    // 11.2 h/case against HR Operations' 5.3, so it needs the headcount.
    name: "Talent Acquisition", capacity: 10, costPerHour: 65, calendarName: HR_HOURS,
    members: [
      { name: "Priya Raman", skills: [SK.sourcing, SK.negotiation] },
      { name: "Aisha Khan", skills: [SK.sourcing, SK.negotiation] },
      { name: "Ravi Menon", skills: [SK.sourcing, SK.negotiation] },
      { name: "Tom Fletcher", skills: [SK.sourcing] },
      { name: "Ellie Shaw", skills: [SK.sourcing] },
      { name: "Jack Oduya", skills: [SK.sourcing] },
      { name: "Nadia Rahman", skills: [SK.sourcing] },
      { name: "Chris Bell", skills: [SK.sourcing] },
      { name: "Owen Pryce", skills: [SK.sourcing] },
      { name: "Isla Fraser", skills: [SK.sourcing] },
    ],
  },
  {
    // THE CONSTRAINT LIVES HERE. Four people, 56% utilisation — and only two of
    // them accredited, at 92%.
    name: "HR Operations", capacity: 4, costPerHour: 45, calendarName: HR_HOURS,
    members: [
      { name: "Grace Oduya", skills: [SK.onboarding, SK.compliance] },
      { name: "Ruth Ellis", skills: [SK.onboarding, SK.compliance] },
      { name: "Ben Carter", skills: [SK.onboarding] },
      { name: "Marta Silva", skills: [SK.onboarding] },
    ],
  },
  {
    name: "Onboarding Services", capacity: 3, costPerHour: 42, calendarName: HR_HOURS,
    members: [
      { name: "Leah Nowak", skills: [SK.onboarding] },
      { name: "Femi Adeyemi", skills: [SK.onboarding] },
      { name: "Dan Russo", skills: [SK.onboarding] },
    ],
  },
  {
    name: "IT Provisioning", capacity: 2, costPerHour: 55, calendarName: IT_HOURS,
    members: [
      { name: "Sam Doyle", skills: [SK.device] },
      { name: "Nina Petrov", skills: [SK.device] },
    ],
  },
  {
    name: "Payroll", capacity: 1, costPerHour: 50, calendarName: HR_HOURS,
    members: [{ name: "Jo Mensah", skills: [SK.payroll] }],
  },
];

// ═════════════════════════════════════════════════════════════════════════
// Calendars. epochDate 2027-07-05 is a MONDAY (the weekly pattern anchors t=0
// to Monday 00:00) and puts the Christmas shutdown at 47% of an 8760-hour run —
// mid-measurement, rather than among the end effects.
// ═════════════════════════════════════════════════════════════════════════
const EPOCH = "2027-07-05";
const closed = (date: string) => ({ date, intervals: [] });
const EXCEPTIONS = [
  closed("2027-10-04"),                                    // Labour Day
  { date: "2027-12-23", intervals: [{ start: "09:00", end: "12:30" }] }, // half day
  ...["2027-12-24", "2027-12-27", "2027-12-28", "2027-12-29", "2027-12-30",
      "2027-12-31", "2028-01-03"].map(closed),             // Christmas shutdown
  closed("2028-01-26"),                                    // Australia Day
  closed("2028-04-14"), closed("2028-04-17"),              // Good Friday, Easter Monday
  closed("2028-04-25"),                                    // Anzac Day
  closed("2028-06-12"),                                    // King's Birthday
];

const weekdays = (start: string, end: string, second?: { start: string; end: string }) =>
  ([1, 2, 3, 4, 5] as const).flatMap((day) => [
    { day, start, end },
    ...(second ? [{ day, start: second.start, end: second.end }] : []),
  ]);

const calendars = [
  {
    name: HR_HOURS,
    pattern: {
      intervals: weekdays("09:00", "12:30", { start: "13:30", end: "17:00" }),
      epochDate: EPOCH, exceptions: EXCEPTIONS,
    } as WorkCalendar,
  },
  {
    name: IT_HOURS,
    pattern: { intervals: weekdays("08:00", "18:00"), epochDate: EPOCH, exceptions: EXCEPTIONS } as WorkCalendar,
  },
];

// ═════════════════════════════════════════════════════════════════════════
// The BPMN process. Lane labels ARE team names — sim.teamId is a lane label,
// not a DB id, so a task inherits its lane's team.
// ═════════════════════════════════════════════════════════════════════════
const tri = (min: number, mode: number, max: number): SimDist => ({ kind: "triangular", min, mode, max });
const fixed = (value: number): SimDist => ({ kind: "fixed", value });

/**
 * ~790 hires a year — the volume that makes the argument true (see §1.1 of the
 * plan; at 260 every team sat near 20% and nothing queued anywhere).
 *
 * MEASURED, NOT DERIVED, and it has to be. A source's inter-arrival delay is
 * sampled in ELAPSED time, added to a clock that only ever sits inside an open
 * window, and then pushed forward to the next open moment. So the effective rate
 * is neither "per elapsed hour" nor "per open hour": below the open-window
 * length it behaves roughly like open-hours spacing, and above it saturates at
 * about one arrival per window. There is no closed form from a target volume to
 * this parameter.
 *
 * Both obvious guesses are wrong by a factor of two or more. 2.35 (open hours)
 * gave ~1060/yr and pushed every team into the eighties; 11.09 (8760/790, the
 * elapsed-hours arithmetic) gave ~386/yr because almost every delay overshot the
 * open day and collapsed to one arrival per day.
 *
 * 3.6 was read off a sweep — scratchpad/calibrate-arrival.ts, which prints
 * volume, utilisation and the vetting queue against arrival mean. Re-run it if
 * any duration in this file changes.
 */
const ARRIVAL_MEAN_HOURS = 3.6; // → ~790 hires/yr, measured

const POOL = "pool-hire";
const LANES = [
  { id: "lane-hm", name: "Hiring Manager" },
  { id: "lane-ta", name: "Talent Acquisition" },
  { id: "lane-hr", name: "HR Operations" },
  { id: "lane-ob", name: "Onboarding Services" },
  { id: "lane-it", name: "IT Provisioning" },
  { id: "lane-pay", name: "Payroll" },
];

/**
 * Per-element simulation parameters, attached AFTER layout by element id.
 *
 * After, not before: `layoutBpmnDiagram` rebuilds pools and lanes from the
 * lane spec and drops any `properties` handed to it, so a teamId set on the
 * input silently disappears. The tasks keep theirs, which makes the loss easy
 * to miss — and the symptom is not an error but a model where every task runs
 * with unlimited capacity: no pools, no queues, no utilisation, and results
 * that look perfectly reasonable.
 */
const SIM: Record<string, Record<string, unknown>> = {
  // THE LANES CARRY THE TEAMS. sim.teamId is a lane LABEL, not a DB id, and a
  // task with no team of its own inherits its lane's. This is what autofill
  // writes in a real project.
  ...Object.fromEntries(LANES.map((l) => [l.id, { teamId: l.name }])),

  start: { arrival: { kind: "exponential", mean: ARRIVAL_MEAN_HOURS }, calendarId: HR_HOURS },
  draft: { cycleTime: tri(1, 1.5, 3) },
  approve: { cycleTime: tri(0.25, 0.5, 1.5) },
  advertise: { cycleTime: fixed(0.75) },
  gather: { delay: fixed(10), delayMode: "working-days" },
  screen: { cycleTime: tri(2, 3, 5) },
  shortlist: { cycleTime: tri(0.75, 1, 2) },
  interview: { cycleTime: tri(1.5, 2, 3) },
  prepOffer: { cycleTime: tri(0.5, 0.75, 1.25) },
  negotiate: { cycleTime: tri(0.5, 1, 2.5), requiredSkills: [SK.negotiation] },
  // THE CONSTRAINT. tri(1,3,9) — a check that comes back clean in an hour or
  // needs chasing for a week. The spread matters as much as the mean: it is
  // what turns 92% utilisation into 1.9 working days of queue.
  // waitTime is the external provider: process waiting, which no amount of
  // staffing shortens, and which the business case must not confuse with queueing.
  vetting: { cycleTime: tri(1, 3, 9), waitTime: fixed(40), requiredSkills: [SK.compliance] },
  payrollRec: { cycleTime: fixed(0.4), requiredSkills: [SK.payroll] },
  provision: { cycleTime: tri(0.5, 0.75, 1.5), requiredSkills: [SK.device] },
  pack: { cycleTime: fixed(0.6), requiredSkills: [SK.onboarding] },
  startDate: { delay: fixed(15), delayMode: "working-days" },
  induction: { cycleTime: fixed(3) },
};

const bpmnElements: AiElement[] = [
  { id: POOL, type: "pool", label: "Hire & Onboard", poolType: "white-box", lanes: LANES },
  ...LANES.map((l) => ({ id: l.id, type: "lane", label: l.name, parentPool: POOL })),

  { id: "start", type: "start-event", label: "Vacancy approved", pool: POOL, lane: "lane-hm" },
  { id: "draft", type: "task", label: "Draft role profile", taskType: "user", pool: POOL, lane: "lane-hm" },
  { id: "approve", type: "task", label: "Approve requisition", taskType: "user", pool: POOL, lane: "lane-hm" },
  { id: "advertise", type: "task", label: "Advertise role", taskType: "user", pool: POOL, lane: "lane-ta" },
  { id: "gather", type: "intermediate-event", eventType: "timer", label: "Applications gather (10 working days)", pool: POOL, lane: "lane-ta" },
  { id: "screen", type: "task", label: "Screen applications", taskType: "user", pool: POOL, lane: "lane-ta" },
  { id: "shortlist", type: "task", label: "Shortlist & schedule interviews", taskType: "user", pool: POOL, lane: "lane-ta" },
  { id: "interview", type: "task", label: "Interview panel", taskType: "user", pool: POOL, lane: "lane-ta" },
  { id: "gwOffer", type: "gateway", gatewayType: "exclusive", label: "Offer made?", pool: POOL, lane: "lane-ta" },
  { id: "prepOffer", type: "task", label: "Prepare offer", taskType: "user", pool: POOL, lane: "lane-hr" },
  { id: "negotiate", type: "task", label: "Negotiate offer", taskType: "user", pool: POOL, lane: "lane-ta" },
  { id: "gwAccept", type: "gateway", gatewayType: "exclusive", label: "Offer accepted?", pool: POOL, lane: "lane-ta" },
  { id: "vetting", type: "task", label: "Compliance & vetting review", taskType: "user", pool: POOL, lane: "lane-hr" },
  { id: "gwSplit", type: "gateway", gatewayType: "parallel", label: "", pool: POOL, lane: "lane-hr" },
  { id: "payrollRec", type: "task", label: "Create payroll record", taskType: "user", pool: POOL, lane: "lane-pay" },
  { id: "provision", type: "task", label: "Provision laptop & accounts", taskType: "user", pool: POOL, lane: "lane-it" },
  { id: "pack", type: "task", label: "Prepare onboarding pack", taskType: "user", pool: POOL, lane: "lane-ob" },
  { id: "gwJoin", type: "gateway", gatewayType: "parallel", label: "", pool: POOL, lane: "lane-ob" },
  { id: "startDate", type: "intermediate-event", eventType: "timer", label: "Wait for start date (15 working days)", pool: POOL, lane: "lane-ob" },
  { id: "induction", type: "task", label: "Day-one induction", taskType: "user", pool: POOL, lane: "lane-ob" },
  { id: "end", type: "end-event", label: "Onboarded", pool: POOL, lane: "lane-ob" },
];

const bpmnConnections: AiConnection[] = [
  { sourceId: "start", targetId: "draft" },
  { sourceId: "draft", targetId: "approve" },
  { sourceId: "approve", targetId: "advertise" },
  { sourceId: "advertise", targetId: "gather" },
  { sourceId: "gather", targetId: "screen" },
  { sourceId: "screen", targetId: "shortlist" },
  { sourceId: "shortlist", targetId: "interview" },
  { sourceId: "interview", targetId: "gwOffer" },
  { sourceId: "gwOffer", targetId: "prepOffer", label: "Yes" },
  { sourceId: "gwOffer", targetId: "shortlist", label: "No" },
  { sourceId: "prepOffer", targetId: "negotiate" },
  { sourceId: "negotiate", targetId: "gwAccept" },
  { sourceId: "gwAccept", targetId: "vetting", label: "Yes" },
  { sourceId: "gwAccept", targetId: "shortlist", label: "No" },
  { sourceId: "vetting", targetId: "gwSplit" },
  { sourceId: "gwSplit", targetId: "payrollRec" },
  { sourceId: "gwSplit", targetId: "provision" },
  { sourceId: "gwSplit", targetId: "pack" },
  { sourceId: "payrollRec", targetId: "gwJoin" },
  { sourceId: "provision", targetId: "gwJoin" },
  { sourceId: "pack", targetId: "gwJoin" },
  { sourceId: "gwJoin", targetId: "startDate" },
  { sourceId: "startDate", targetId: "induction" },
  { sourceId: "induction", targetId: "end" },
];

/** Branch probabilities, as percentages, keyed source→target. */
const BRANCH: Record<string, number> = {
  "gwOffer>prepOffer": 72, "gwOffer>shortlist": 28,
  "gwAccept>vetting": 86, "gwAccept>shortlist": 14,
};

// ═════════════════════════════════════════════════════════════════════════
// The ArchiMate operating model. Actors (band 2) above roles (band 3) above the
// work (band 7), which the layout does on its own.
// ═════════════════════════════════════════════════════════════════════════
const ROLE_SENIOR = "role-senior-recruiter";
const ROLE_VETTING = "role-vetting-officer";

const archiActors: { id: string; label: string; roles: string[] }[] = [
  { id: "a-priya", label: "Priya Raman", roles: [ROLE_SENIOR] },
  { id: "a-aisha", label: "Aisha Khan", roles: [ROLE_SENIOR] },
  { id: "a-ravi", label: "Ravi Menon", roles: [ROLE_SENIOR] },
  { id: "a-tom", label: "Tom Fletcher", roles: ["role-sourcing"] },
  { id: "a-ellie", label: "Ellie Shaw", roles: ["role-sourcing"] },
  { id: "a-jack", label: "Jack Oduya", roles: ["role-sourcing"] },
  { id: "a-nadia", label: "Nadia Rahman", roles: ["role-sourcing"] },
  { id: "a-chris", label: "Chris Bell", roles: ["role-sourcing"] },
  { id: "a-owen", label: "Owen Pryce", roles: ["role-sourcing"] },
  { id: "a-isla", label: "Isla Fraser", roles: ["role-sourcing"] },
  { id: "a-grace", label: "Grace Oduya", roles: [ROLE_VETTING] },
  { id: "a-ruth", label: "Ruth Ellis", roles: [ROLE_VETTING] },
  { id: "a-ben", label: "Ben Carter", roles: ["role-onboarding"] },
  { id: "a-marta", label: "Marta Silva", roles: ["role-onboarding"] },
  { id: "a-leah", label: "Leah Nowak", roles: ["role-onboarding"] },
  { id: "a-femi", label: "Femi Adeyemi", roles: ["role-onboarding"] },
  { id: "a-dan", label: "Dan Russo", roles: ["role-onboarding"] },
  { id: "a-sam", label: "Sam Doyle", roles: ["role-device"] },
  { id: "a-nina", label: "Nina Petrov", roles: ["role-device"] },
  { id: "a-jo", label: "Jo Mensah", roles: ["role-payroll"] },
  // DELIBERATE non-match #1: fully modelled and accredited, but on no team. He
  // is given a role on purpose — an actor with NO role would also trip the
  // "holds nothing" warning, and one honest report is worth more than two. He
  // also makes a quiet point: the architecture says a third accredited person
  // exists; the team library says he is not available.
  { id: "a-dev", label: "Dev Nair (Contractor)", roles: [ROLE_VETTING] },
];

const archiRoles = [
  { id: "role-sourcing", label: SK.sourcing },
  { id: "role-negotiation", label: SK.negotiation },
  { id: "role-compliance", label: SK.compliance },
  { id: "role-payroll", label: SK.payroll },
  { id: "role-onboarding", label: SK.onboarding },
  { id: "role-device", label: SK.device },
  { id: ROLE_SENIOR, label: "Senior Recruiter" },
  { id: ROLE_VETTING, label: "Accredited Vetting Officer" },
];

/** Role bundles — a role that aggregates others IS those skills. */
const BUNDLES: [string, string][] = [
  [ROLE_SENIOR, "role-sourcing"], [ROLE_SENIOR, "role-negotiation"],
  [ROLE_VETTING, "role-onboarding"], [ROLE_VETTING, "role-compliance"],
];

/** Role → the work that requires it. Labels must match the BPMN task labels. */
const REQUIRES: [string, string, string][] = [
  ["role-negotiation", "w-negotiate", "Negotiate offer"],
  ["role-compliance", "w-vetting", "Compliance & vetting review"],
  ["role-payroll", "w-payroll", "Create payroll record"],
  ["role-device", "w-provision", "Provision laptop & accounts"],
  ["role-onboarding", "w-pack", "Prepare onboarding pack"],
  // DELIBERATE non-match #2: a business process with a role assigned and no
  // matching BPMN task. An example whose unmatched report comes back empty
  // teaches the reader to ignore it.
  ["role-onboarding", "w-exit", "Exit interview"],
];

function buildArchimate(): DiagramData {
  const elements = [
    ...archiActors.map((a) => ({ id: a.id, type: "business-actor", label: a.label })),
    ...archiRoles.map((r) => ({ id: r.id, type: "business-role", label: r.label })),
    ...REQUIRES.map(([, id, label]) => ({ id, type: "business-process", label })),
  ];
  const connections = [
    ...archiActors.flatMap((a) => a.roles.map((r) => ({ sourceId: a.id, targetId: r, type: "assignment" }))),
    ...BUNDLES.map(([parent, child]) => ({ sourceId: parent, targetId: child, type: "aggregation" })),
    ...REQUIRES.map(([role, work]) => ({ sourceId: role, targetId: work, type: "assignment" })),
  ];
  return layoutGenericDiagram({ elements, connections }, "archimate");
}

// ═════════════════════════════════════════════════════════════════════════
function buildBpmn(): DiagramData {
  const data = layoutBpmnDiagram(bpmnElements, bpmnConnections, { promptLabel: "Hire & Onboard" });

  // Attach sim params by element id. layoutBpmnDiagram preserves the ids it was
  // given, so this is a direct lookup rather than a label match.
  let attached = 0;
  data.elements = data.elements.map((el: DiagramElement) => {
    const sim = SIM[el.id];
    if (!sim) return el;
    attached++;
    return { ...el, properties: { ...(el.properties ?? {}), sim: { ...(el.properties?.sim ?? {}), ...sim } } };
  }) as DiagramElement[];
  // Proven, not assumed: an id that stopped matching would silently strip that
  // element's parameters, and a task with no cycle time still runs.
  if (attached !== Object.keys(SIM).length) {
    throw new Error(`Attached sim params to ${attached} of ${Object.keys(SIM).length} elements — an id did not survive layout.`);
  }

  // Branch probabilities on the two decisions.
  let tagged = 0;
  data.connectors = data.connectors.map((c) => {
    const pct = BRANCH[`${c.sourceId}>${c.targetId}`];
    if (pct === undefined) return c;
    tagged++;
    return { ...c, branchProbability: pct };
  });
  if (tagged !== Object.keys(BRANCH).length) {
    throw new Error(`Expected ${Object.keys(BRANCH).length} branch probabilities, tagged ${tagged} — the loop-backs did not survive layout.`);
  }
  return data;
}

// ═════════════════════════════════════════════════════════════════════════
// Scenarios. Full year at hourly resolution; 90 days of warm-up is about two
// flow times, and the measurement window is ~590 completed cases per rep.
// ═════════════════════════════════════════════════════════════════════════
const RUN = {
  clockUnit: "hour" as const, horizon: 8760, warmUp: 2160,
  replications: 10, seed: 20270705, collectQueues: true,
};

const HR = "HR Operations";
const trainMarta = { name: "Marta Silva", skills: [SK.onboarding, SK.compliance] };

/**
 * An element override is keyed by the ASSEMBLED node id — "<diagram key>::<element
 * id>", not the bare element id. Keyed wrongly it matches nothing and applies
 * nothing, and the scenario then runs identical to the baseline: no error, no
 * warning, just a column of zeroes. Which is the exact symptom this whole change
 * is fixing, so the id is built rather than typed.
 */
const node = (elementId: string) => `hire-process::${elementId}`;
const days = (n: number) => ({ delay: { kind: "fixed" as const, value: n } });

const scenarios = [
  { name: "As-is — today's team", isBaseline: true, runConfig: RUN, overrides: {} },
  {
    // Bit-identical to the baseline, on purpose: capacity cannot exceed the four
    // named members, so the model will not pretend a desk is a person.
    name: "More desks, no more people",
    runConfig: RUN, overrides: { teams: { [HR]: { capacity: 6 } } },
  },
  {
    // ~£176k/year. Helps "Prepare offer" only — the accredited pair is untouched.
    name: "Hire two more administrators",
    runConfig: RUN,
    overrides: { teams: { [HR]: { capacity: 6, members: [
      { name: "New Starter A", skills: [SK.onboarding] },
      { name: "New Starter B", skills: [SK.onboarding] },
    ] } } },
  },
  {
    // £4,500. Capacity unchanged; the accredited pool goes 2 → 3.
    name: "Train a third checker",
    runConfig: RUN, overrides: { teams: { [HR]: { members: [trainMarta] } } },
  },
  // ── The process levers ───────────────────────────────────────────────────
  //
  // Paul, 2026-09-11: "Too little difference in the example simulation runs to
  // show that the feature can be successfully used."
  //
  // He was right, and for a reason worth stating: about 85% of the 988-hour
  // flow time is these two timers — the advertising window (10 working days)
  // and the wait for a start date (15). Most of the remaining 91 hours of
  // waiting is not contention either; it is three parallel tasks each waiting
  // ~16 hours for the office to reopen. So EVERY staffing lever above is
  // pulling on 0.5% of the number, and four scenarios that each move it by
  // nothing demonstrate only that the tool is insensitive.
  //
  // These two cost nobody anything and take a third off the elapsed time. They
  // do not replace the staffing scenarios — they are what makes those land,
  // because "£176k of hiring changes nothing and a calendar change halves it"
  // is the actual lesson, and it cannot be told with one of the two halves.
  {
    // 10 → 5 working days. -17%.
    name: "Advertise for one week, not two",
    runConfig: RUN, overrides: { elements: { [node("gather")]: days(5) } },
  },
  {
    // ...and 15 → 10 working days on the start date. -34%, together.
    name: "Advertise one week, start a week sooner",
    runConfig: RUN,
    overrides: { elements: { [node("gather")]: days(5), [node("startDate")]: days(10) } },
  },
];

// ═════════════════════════════════════════════════════════════════════════
function main() {
  const bpmn = buildBpmn();
  const archi = buildArchimate();

  const pkg: ExamplePackage = {
    version: 1,
    teams,
    calendars,
    diagrams: [
      { key: "hire-process", name: "Hire & Onboard", type: "bpmn", data: bpmn },
      { key: "hire-operating-model", name: "HR operating model — who can do what", type: "archimate", data: archi },
    ],
    study: {
      name: "Hire & Onboard — staffing vs accreditation",
      rootKeys: ["hire-process"],
      businessCase: { implementationCost: 4500, annualVolume: 790, costOfDelayPerHour: 120 },
    },
    scenarios,
    companionKeys: ["hire-operating-model"],
  };

  const entry = {
    slug: SLUG,
    title: "Hire & Onboard",
    concept: "Four people in HR Operations, only two accredited to sign off a vetting review — the constraint is not headcount, it is who is allowed to do the work.",
    description: [
      "A regulated employer hiring ~790 people a year. Every team sits under 60% utilisation, so nothing in the",
      "utilisation panel looks wrong — and yet every hire waits about two working days at one step.",
      "",
      "Only 2 of HR Operations' 4 people are accredited to sign off a compliance & vetting review. Adding desks",
      "changes nothing — capacity is not people. Hiring two more administrators, at ~£176k a year, changes",
      "nothing either: they cannot do the accredited work. Training a third checker DOES collapse that queue,",
      "from about 9 hours to 4 — and still barely moves the total, which is the point of the example.",
      "",
      "Because ~85% of the 988-hour elapsed time is two waiting periods nobody is working through: the",
      "advertising window and the wait for a start date. Advertise for one week instead of two and the typical",
      "hire lands 17% sooner; bring the start date forward a week as well and it is 34%, for no money at all.",
      "Four staffing levers move the number by nothing and two calendar decisions take a third off it — which is",
      "the whole argument for simulating before spending.",
      "",
      "Fill the skills matrix from the ArchiMate operating model rather than typing it: Actor →assignment→ Role",
      "means the person holds the skill, Role →assignment→ Business Process means the work requires it, and a",
      "Role that aggregates others is a bundle. Two things deliberately do NOT match — a contractor who is on no",
      "team, and an 'Exit interview' with no BPMN task — because a fill that quietly matches nothing looks exactly",
      "like a fill that worked.",
      "",
      "Then: sweep the arrival rate to find where the current accreditation cover falls over, run the tornado to",
      "see HR Operations' headcount sit flat while the arrival rate runs the width of the chart, and build the",
      "business case. The £120/hour cost of an unfilled role is an ASSUMPTION — replace it with yours.",
    ].join("\n"),
    difficulty: "advanced",
    package: pkg,
  };

  // MERGE BY SLUG. Rewriting the file wholesale is the failure that once
  // destroyed three examples (extensions plan 0.4); T3369 guards against it.
  const doc = JSON.parse(readFileSync(DATA, "utf8")) as { examples: { slug: string }[] };
  const before = doc.examples.length;
  const at = doc.examples.findIndex((e) => e.slug === SLUG);
  if (at >= 0) doc.examples[at] = entry; else doc.examples.push(entry);
  if (doc.examples.length < before) throw new Error("Merge lost an example — refusing to write.");

  writeFileSync(DATA, JSON.stringify(doc, null, 2) + "\n");
  console.log(`${at >= 0 ? "Replaced" : "Added"} "${SLUG}". Catalog now holds ${doc.examples.length}: ${doc.examples.map((e) => e.slug).join(", ")}`);
  console.log(`  BPMN: ${bpmn.elements.length} elements, ${bpmn.connectors.length} connectors`);
  console.log(`  ArchiMate: ${archi.elements.length} elements, ${archi.connectors.length} connectors`);
}

main();
