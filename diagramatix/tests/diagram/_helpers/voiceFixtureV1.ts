/**
 * The FIRST Voice Assist test diagram (2026-09-25 → 2026-09-27), frozen for the tests that
 * pin geometry or features on it — sub-lanes (Claims Team: Sub 1, Sub 2), an expanded
 * subprocess, a default-named "Pool 3", Salesforce, and an element in no pool.
 *
 * Paul replaced the live test diagram on 2026-09-27 ("Replace current Voice Assist test
 * diagram with Voice-Assist-testdiagram-2.json … This looks a lot better and does allow for
 * many of the commands"); app/lib/assist/commandFixture.ts is now his diagram. These tests
 * are about lane geometry and reference rules, not about "the test diagram", so they keep
 * the world their numbers were measured on.
 */
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;

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
export const FIXTURE_IDS_V1 = {
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

