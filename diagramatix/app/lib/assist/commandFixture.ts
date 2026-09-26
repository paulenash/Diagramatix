/**
 * The diagram every generated command is written against, and scored against —
 * and the one "Show test diagram" puts in front of the user.
 *
 * PAUL'S OWN DIAGRAM (2026-09-27): "Replace current Voice Assist test diagram
 * with Voice-Assist-testdiagram-2.json in /test. This looks a lot better and
 * does allow for many of the commands." It is `voiceTestDiagram.json`, exactly
 * as he exported it — positions, routes, the line breaks he typed into names
 * ("Pass Claim⏎Check?"). The first test diagram is frozen for the tests that
 * pinned geometry on it (tests/diagram/_helpers/voiceFixtureV1.ts).
 *
 * The generator, the scorer and the script Paul reads aloud must all resolve
 * names against **the same diagram**. Two fixtures would mean a corpus whose
 * answers depend on which copy the reader had.
 *
 * ─── It looks like real work, on purpose (Paul, 2026-09-25) ────────────────
 *
 *   • ACTIVITIES ARE VERB PHRASES — "Review Claim", "Draft Documentation".
 *   • POOLS are companies or departments — "Claims Processing".
 *   • LANES are teams or roles — "Underwriters".
 *   • A NON-IT BLACK-BOX POOL is an external party — Customer.
 *   • AN IT-SYSTEM BLACK-BOX POOL is a product — "Claims System".
 *
 * And the DEFAULT NAMES, which matter most. Paul: "Very common is 'Rename Task 1
 * to Review Email' — the old names of Tasks will very often be Task 1, Task 2,
 * Subprocess 3, and the old names of Lanes will be Lane 1, Lane 2, since this is
 * how they are created." The diagram keeps un-renamed Task 1, Task 2,
 * Subprocess 3, Lane 3 and Lane 2 beside the properly named ones.
 *
 * A name is SPOKEN with its line breaks as spaces (`spokenName`): nobody says a
 * line break.
 *
 * Returns FRESH ARRAYS on every call: ops mutate, and a shared fixture would
 * leak one case's edits into the next.
 */
import type { Connector, DiagramData, DiagramElement } from "../diagram/types";
import DIAGRAM from "./voiceTestDiagram.json";

/** How a name is said: its line breaks and runs of spaces as one space. */
export function spokenName(label: string | null | undefined): string {
  return (label ?? "").replace(/\s+/g, " ").trim();
}

/** The elements, fresh. */
export function fixtureElements(): DiagramElement[] {
  return structuredClone(DIAGRAM.elements) as unknown as DiagramElement[];
}

/** The SEQUENCE flows, as a reference needs them — so "disconnect X from Y" has something to remove. */
export function fixtureConnectors(): Array<Record<string, unknown>> {
  return (structuredClone(DIAGRAM.connectors) as unknown as Array<Record<string, unknown>>)
    .filter((c) => c.type === "sequence");
}

/** The whole diagram as Paul drew it — routes, sides, message flows and all — for L4 and for "Create test diagram". */
export function fixtureDiagram(): DiagramData {
  return {
    elements: fixtureElements(),
    connectors: structuredClone(DIAGRAM.connectors) as unknown as Connector[],
    viewport: { ...DIAGRAM.viewport },
  } as DiagramData;
}

/** Ids grouped by what they are, so a template can ask without knowing the fixture. */
export const FIXTURE_IDS = {
  pools: ["p", "cust", "sys"],
  whiteBoxPool: "p",
  participantPool: "cust",
  systemPool: "sys",
  lanes: ["L1", "L2", "L3"],
  /** Un-renamed elements — the commonest rename targets. */
  defaultNamed: ["t4", "t5", "sub3", "L1", "L3"],
  /** Two steps side by side in one lane (Task 1, Task 2) — what "align these" is said with. */
  alignPair: ["t4", "t5"],
  /**
   * Where "add a lane above/below X called <any LANE_LABELS name>" has room.
   * A new lane is carved out of the lane it is named against and the pool
   * never grows, so voice refuses when the name does not fit (Paul,
   * 2026-09-25). On this diagram only Lane 3 has room for every name, above
   * and below; Underwriters fits the short names only and Lane 2 none. The
   * REDUCER's answer, not a copy of its rule — T4757 asks it.
   */
  laneRoom: [["L1", "above"], ["L1", "below"]],
  /** Lanes already fitted to their content — "compress lane" on one is rightly refused (T4757 asks the reducer). */
  fittedLanes: ["L3"],
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
