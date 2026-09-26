/**
 * The diagram every generated command is written against, and scored against.
 *
 * Promoted out of `tests/diagram/assist-reference-reliability.test.ts`, where it
 * lived as a `world()` helper, because the generator, the scorer and the script
 * Paul reads aloud must all resolve names against **the same diagram**. Two
 * fixtures would mean a corpus whose answers depend on which copy the reader had.
 *
 * ─── It looks like real work, on purpose (Paul, 2026-09-25) ────────────────
 *
 * The first version used whatever names were handy — "Pool 3", "Sales",
 * "Fulfilment" — and that made the corpus test the recogniser against a
 * vocabulary nobody actually speaks at a whiteboard. The naming now follows the
 * rules a modeller follows:
 *
 *   • ACTIVITIES ARE VERB PHRASES — "Review Application", never "Application"
 *     or "Urgent". A noun-phrase task name is a modelling error, so testing one
 *     measures a sentence nobody would say.
 *   • POOLS are companies or departments — "Claims Processing".
 *   • LANES are teams or roles — "Claims Team", "Underwriters".
 *   • A NON-IT BLACK-BOX POOL is an external party — Customer, Applicant.
 *   • AN IT-SYSTEM BLACK-BOX POOL is a product — Salesforce, ServiceNow.
 *
 * ─── And the default names, which matter most ──────────────────────────────
 *
 * Paul: "Very common is 'Rename Task 1 to Review Email' — the old names of
 * Tasks will very often be Task 1, Task 2, Subprocess 3, and the old names of
 * Lanes will be Lane 1, Lane 2, since this is how they are created."
 *
 * That is the single commonest real command, and it is also the hardest thing
 * to hear: a reference ending in a DIGIT. So the fixture deliberately carries
 * un-renamed elements — `Task 1`, `Task 2`, `Subprocess 3`, `Lane 3` — beside
 * the properly named ones, and the generator prefers them as rename targets.
 *
 * One of them breaks the realistic-names rule above, deliberately: a pool
 * called `Pool 3`. New pools are born "Pool N", and "compress pool three"
 * asking "Pool 3 or Lane 3?" (Paul's log, 2026-09-23) lives exactly there — a
 * fixture of proper pool names could never reproduce it (2026-09-26).
 *
 * The awkward classes are still represented, because they were each found the
 * hard way: a name ending in a digit (`Lane 3`), a bare word that is also a
 * verb (`Review Claim` starts with one), a two-word proper noun, and a
 * homophone-adjacent short name.
 *
 * Returns FRESH ARRAYS on every call: ops mutate, and a shared fixture would
 * leak one case's edits into the next.
 */
import type { Connector, DiagramData, DiagramElement } from "../diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** The elements. A claims department, two teams, an external party, a system, and a pool nobody renamed. */
export function fixtureElements(): DiagramElement[] {
  return [
    E({ id: "p", type: "pool", label: "Claims Processing", x: 0, y: 0, width: 900, height: 1180, properties: { poolType: "white-box" } }),
    E({ id: "L1", type: "lane", label: "Claims Team", x: 36, y: 0, width: 864, height: 300, parentId: "p", properties: {} }),
    // Underwriters and Lane 3 have ROOM — 190px of empty space above AND below
    // their contents, enough for the tallest name in LANE_LABELS (T4757) — as a
    // lane being worked on does. A new
    // lane is carved out of its neighbour and must be tall enough for its name,
    // so a fixture packed to the last pixel refused every "add a lane below X
    // called Quality Assurance" — correctly, and uselessly (L4, 2026-09-25).
    E({ id: "L2", type: "lane", label: "Underwriters", x: 36, y: 300, width: 864, height: 440, parentId: "p", properties: {} }),
    // A lane nobody has renamed yet — the commonest rename target there is.
    E({ id: "L3", type: "lane", label: "Lane 3", x: 36, y: 740, width: 864, height: 440, parentId: "p", properties: {} }),
    E({ id: "S1", type: "lane", label: "Sub 1", x: 72, y: 0, width: 828, height: 150, parentId: "L1", properties: {} }),
    E({ id: "S2", type: "lane", label: "Sub 2", x: 72, y: 150, width: 828, height: 150, parentId: "L1", properties: {} }),

    E({ id: "start", type: "start-event", label: "Claim Received", x: 100, y: 40, width: 36, height: 36, parentId: "S1", properties: {} }),
    E({ id: "t1", type: "task", label: "Review Claim", x: 200, y: 30, width: 100, height: 60, parentId: "S1", properties: {} }),
    E({ id: "t2", type: "task", label: "Check Coverage", x: 360, y: 30, width: 100, height: 60, parentId: "S1", properties: {} }),
    E({ id: "t3", type: "task", label: "Assess Risk", x: 200, y: 180, width: 100, height: 60, parentId: "S2", properties: {} }),
    // Un-renamed, exactly as the editor creates them.
    E({ id: "t4", type: "task", label: "Task 1", x: 200, y: 490, width: 100, height: 60, parentId: "L2", properties: {} }),
    E({ id: "t5", type: "task", label: "Task 2", x: 360, y: 490, width: 100, height: 60, parentId: "L2", properties: {} }),
    E({ id: "sub3", type: "subprocess", label: "Subprocess 3", x: 520, y: 490, width: 120, height: 60, parentId: "L2", properties: {} }),
    E({ id: "g", type: "gateway", label: "Claim Approved?", x: 700, y: 495, width: 50, height: 50, parentId: "L2", properties: {} }),
    // Un-renamed, as the editor creates them (Paul, 2026-09-25): a gateway is
    // born "Decision?" and an expanded subprocess "Expanded 2". Both are
    // common rename targets, and both are awkward — one ends in punctuation
    // the parser strips, the other ends in a digit.
    E({ id: "g2", type: "gateway", label: "Decision?", x: 700, y: 180, width: 50, height: 50, parentId: "S2", properties: {} }),
    E({ id: "ep2", type: "subprocess-expanded", label: "Expanded 2", x: 480, y: 170, width: 180, height: 90, parentId: "S2", properties: {} }),
    E({ id: "t6", type: "task", label: "Pay Claim", x: 200, y: 930, width: 100, height: 60, parentId: "L3", properties: {} }),
    E({ id: "end", type: "end-event", label: "Claim Closed", x: 800, y: 938, width: 36, height: 36, parentId: "L3", properties: {} }),

    // An external participant, and an IT system. Both black-box, and they read
    // very differently in a sentence — worth exercising both.
    //
    // 120 tall, not 80: the reducer will not let a pool be shorter than 116, so
    // an 80px fixture pool GREW on its first edit, and L4 read "move the bottom
    // boundary up" as moving it down (2026-09-25). A fixture the reducer would
    // correct on contact measures the correction, not the command.
    E({ id: "cust", type: "pool", label: "Customer", x: 0, y: 1280, width: 900, height: 120, properties: { poolType: "black-box" } }),
    E({ id: "sys", type: "pool", label: "Salesforce", x: 0, y: 1440, width: 900, height: 120, properties: { poolType: "black-box" } }),
    // Born "Pool 3" and never renamed — see the note above. Black-box, as a
    // new pool is.
    E({ id: "pool3", type: "pool", label: "Pool 3", x: 0, y: 1600, width: 900, height: 120, properties: { poolType: "black-box" } }),

    // One element in NO pool — last in the list, so no template's picks shift.
    // Without it "put a pool around everything" had nothing to wrap and was
    // refused every time, so L4 could never see what happens to the NAME.
    E({ id: "loose", type: "intermediate-event", label: "Reminder Sent", x: 980, y: 300, width: 36, height: 36, properties: {} }),
  ];
}

/** A few connectors, so "disconnect X from Y" has something to remove. */
export function fixtureConnectors(): Array<Record<string, unknown>> {
  return [
    { id: "c1", sourceId: "start", targetId: "t1", type: "sequence", waypoints: [] },
    { id: "c2", sourceId: "t1", targetId: "t2", type: "sequence", waypoints: [] },
    { id: "c3", sourceId: "g", targetId: "t6", type: "sequence", waypoints: [] },
    { id: "c4", sourceId: "t6", targetId: "end", type: "sequence", waypoints: [] },
  ];
}

/**
 * The whole fixture as a diagram the reducer can run — for L4, which applies
 * the ops and inspects what came out. The connectors above carry only what a
 * reference needs; the reducer needs sides and routing too, so they are filled
 * with the editor's own defaults for a new sequence flow.
 */
export function fixtureDiagram(): DiagramData {
  return {
    elements: fixtureElements(),
    connectors: fixtureConnectors().map((c) => ({
      sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false, ...c,
    }) as unknown as Connector),
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/** Ids grouped by what they are, so a template can ask without knowing the fixture. */
export const FIXTURE_IDS = {
  pools: ["p", "cust", "sys", "pool3"],
  whiteBoxPool: "p",
  participantPool: "cust",
  systemPool: "sys",
  /** "Pool 3" — the pool nobody renamed. */
  defaultNamedPool: "pool3",
  lanes: ["L1", "L2", "L3"],
  sublanes: ["S1", "S2"],
  tasks: ["t1", "t2", "t3", "t4", "t5", "t6"],
  gateways: ["g"],
  events: ["start", "end"],
  /** Un-renamed elements — the commonest rename targets. */
  defaultNamed: ["t4", "t5", "sub3", "L3", "g2", "ep2", "pool3"],
  gateways2: ["g", "g2"],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Names the generator hands out. Typed by what is being named, because a lane
// called "Dispatch" and a task called "Finance" are both modelling errors, and
// a corpus full of them measures sentences nobody would say.
// ─────────────────────────────────────────────────────────────────────────────

/** ACTIVITIES ARE VERB PHRASES. Every one starts with a verb. */
export const ACTIVITY_LABELS: readonly string[] = [
  "Review Email", "Approve Payment", "Send Invoice", "Check Stock",
  "Escalate Complaint", "Verify Identity", "Record Decision", "Notify Customer",
  "Prepare Quote", "Close Claim", "Request Documents", "Update Policy",
];

/** LANES ARE TEAMS OR ROLES. */
export const LANE_LABELS: readonly string[] = [
  "Finance Team", "Support Desk", "Case Manager", "Team Leader",
  "Quality Assurance", "Operations Team", "Senior Assessor", "Billing Team",
];

/** POOLS ARE COMPANIES OR DEPARTMENTS. */
export const POOL_LABELS: readonly string[] = [
  "Accounts Payable", "Customer Service", "Northwind Freight",
  "Risk and Compliance", "Member Services",
];

/** A NON-IT BLACK-BOX POOL IS AN EXTERNAL PARTY. */
export const PARTICIPANT_LABELS: readonly string[] = [
  "Client", "Applicant", "Member", "Supplier", "Broker",
];

/**
 * EVENTS ARE NOT VERB PHRASES — they are things that HAVE HAPPENED, so they
 * read as noun + past participle. "Add an end event called Check Stock" is the
 * same category error as a noun-phrase task, one notch quieter.
 */
export const EVENT_LABELS: readonly string[] = [
  "Payment Received", "Order Shipped", "Policy Issued", "Application Submitted",
  "Quote Accepted", "Invoice Paid",
];

/** A BOUNDARY EVENT IS AN INTERRUPTION — a timeout, an error, a withdrawal. */
export const BOUNDARY_LABELS: readonly string[] = [
  "Timeout", "Error", "Escalation", "Claim Withdrawn", "Deadline Passed",
];

/** A MESSAGE IS A THING SENT — a document, a notice, a form. */
export const MESSAGE_LABELS: readonly string[] = [
  "Claim Form", "Invoice", "Confirmation", "Policy Documents",
  "Rejection Notice", "Status Update",
];

/** AN IT-SYSTEM BLACK-BOX POOL IS A PRODUCT. */
export const SYSTEM_LABELS: readonly string[] = [
  "SAP", "ServiceNow", "Workday", "Dynamics", "Jira",
];

/**
 * Everything the generator may hand out as a NEW name, for the guard that says
 * a fresh name must not already be on the diagram.
 */
export const FRESH_LABELS: readonly string[] = [
  ...ACTIVITY_LABELS, ...LANE_LABELS, ...POOL_LABELS,
  ...PARTICIPANT_LABELS, ...SYSTEM_LABELS,
  ...EVENT_LABELS, ...BOUNDARY_LABELS, ...MESSAGE_LABELS,
];
