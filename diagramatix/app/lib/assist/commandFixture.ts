/**
 * The diagram every generated command is written against, and scored against.
 *
 * Promoted out of `tests/diagram/assist-reference-reliability.test.ts`, where it
 * lived as a `world()` helper, because the generator, the scorer and — later —
 * the script Paul reads aloud must all resolve names against **the same
 * diagram**. Two fixtures would mean a corpus whose answers depend on which
 * copy the reader had.
 *
 * THE LABELS ARE CHOSEN, not arbitrary. Each one exercises a class this feature
 * has actually been caught by:
 *
 *   • `Lane 1` / `Lane 2` — a name ending in a digit. "Lane two" has to survive
 *     `spokenNumbersAsDigits`, and the recogniser's `lane:3` keyword boost has
 *     been observed beating the word "one" on a numbered pick.
 *   • `Sub 1` / `Sub 2` — the sub-lane naming Paul asked for on 2026-09-23, and
 *     a prefix that is also a word inside "subprocess".
 *   • `Review` — a bare common word that is also a verb, and appears inside
 *     "Review Order" so a substring match has something to be ambiguous about.
 *   • `Pick Items` — a two-word proper noun where the first word is a verb the
 *     grammar uses elsewhere ("pick").
 *   • `Sales` — homophone-adjacent ("sails"), and short enough to sit under
 *     `phonetic.MIN_KEY_FOR_FUZZ`.
 *   • `Approved?` — trailing punctuation the parser strips.
 *
 * Returns FRESH ARRAYS on every call: ops mutate, and a shared fixture would
 * leak one case's edits into the next.
 */
import type { DiagramElement } from "../diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

/** The elements. One white-box pool with two lanes and two sub-lanes, plus a participant. */
export function fixtureElements(): DiagramElement[] {
  return [
    E({ id: "p", type: "pool", label: "Pool 3", x: 0, y: 0, width: 900, height: 600, properties: { poolType: "white-box" } }),
    E({ id: "L1", type: "lane", label: "Lane 1", x: 36, y: 0, width: 864, height: 300, parentId: "p", properties: {} }),
    E({ id: "L2", type: "lane", label: "Lane 2", x: 36, y: 300, width: 864, height: 300, parentId: "p", properties: {} }),
    E({ id: "S1", type: "lane", label: "Sub 1", x: 72, y: 0, width: 828, height: 150, parentId: "L1", properties: {} }),
    E({ id: "S2", type: "lane", label: "Sub 2", x: 72, y: 150, width: 828, height: 150, parentId: "L1", properties: {} }),
    E({ id: "start", type: "start-event", label: "Order Received", x: 100, y: 40, width: 36, height: 36, parentId: "S1", properties: {} }),
    E({ id: "t1", type: "task", label: "Review", x: 200, y: 30, width: 100, height: 60, parentId: "S1", properties: {} }),
    E({ id: "t2", type: "task", label: "Pick Items", x: 360, y: 30, width: 100, height: 60, parentId: "S1", properties: {} }),
    E({ id: "t3", type: "task", label: "Sales", x: 200, y: 180, width: 100, height: 60, parentId: "S2", properties: {} }),
    E({ id: "g", type: "gateway", label: "Approved?", x: 520, y: 340, width: 50, height: 50, parentId: "L2", properties: {} }),
    E({ id: "t4", type: "task", label: "Ship Order", x: 640, y: 335, width: 100, height: 60, parentId: "L2", properties: {} }),
    E({ id: "end", type: "end-event", label: "Done", x: 800, y: 348, width: 36, height: 36, parentId: "L2", properties: {} }),
    E({ id: "cust", type: "pool", label: "Customer", x: 0, y: 700, width: 900, height: 80, properties: { poolType: "black-box" } }),
  ];
}

/** A handful of connectors, so "disconnect X from Y" has something to remove. */
export function fixtureConnectors(): Array<Record<string, unknown>> {
  return [
    { id: "c1", sourceId: "start", targetId: "t1", type: "sequence", waypoints: [] },
    { id: "c2", sourceId: "t1", targetId: "t2", type: "sequence", waypoints: [] },
    { id: "c3", sourceId: "g", targetId: "t4", type: "sequence", waypoints: [] },
    { id: "c4", sourceId: "t4", targetId: "end", type: "sequence", waypoints: [] },
  ];
}

/** Ids grouped by what they are, so a template can ask for "a task" without knowing the fixture. */
export const FIXTURE_IDS = {
  pools: ["p", "cust"],
  whiteBoxPool: "p",
  blackBoxPool: "cust",
  lanes: ["L1", "L2"],
  sublanes: ["S1", "S2"],
  tasks: ["t1", "t2", "t3", "t4"],
  gateways: ["g"],
  events: ["start", "end"],
} as const;

/** Labels that are NOT on the diagram — safe to use as a new name. */
export const FRESH_LABELS: readonly string[] = [
  "Approve", "Check Stock", "Prepare", "Dispatch", "Escalate", "Verify Goods",
  "Pack Boxes", "Send Invoice", "Receive Payment", "Quality Check",
  "Finance", "Picking", "Shipping", "Marketing", "Fulfilment",
];
