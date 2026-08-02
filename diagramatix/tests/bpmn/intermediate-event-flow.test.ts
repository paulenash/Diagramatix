/**
 * B40 (intermediate-event-flow) + B41 (edge-mount-intermediate-outgoing).
 *
 * B40 — a NON-boundary intermediate event must have BOTH an incoming and an
 *       outgoing sequence connector.
 * B41 — an edge-mounted intermediate event on the OUTER-MOST Expanded Sub-Process
 *       must have an outgoing sequence flow; one mounted on an Activity INSIDE an
 *       EP may omit it, but any it has must land on another Activity within that EP.
 *
 * Synthetic elements/connectors are fed straight to the check functions.
 */
import { describe, it, expect } from "vitest";
import { checkIntermediateEventFlow, checkEdgeMountIntermediateOutgoing } from "@/app/lib/diagram/checks/diagramChecks";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const mk = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement => ({
  id, type: type as DiagramElement["type"], x: 0, y: 0, width: 40, height: 40, label: extra.label ?? id, properties: {}, ...extra,
});
const seq = (id: string, sourceId: string, targetId: string): Connector =>
  ({ id, type: "sequence", sourceId, targetId, waypoints: [] } as unknown as Connector);
const data = (elements: DiagramElement[], connectors: Connector[] = []) => ({ elements, connectors });

describe("B40 — non-boundary intermediate event needs incoming AND outgoing", () => {
  const base = () => [mk("a", "task"), mk("ie", "intermediate-event"), mk("b", "task")];

  it("clean when it has both an incoming and an outgoing sequence", () => {
    expect(checkIntermediateEventFlow(data(base(), [seq("i", "a", "ie"), seq("o", "ie", "b")]))).toHaveLength(0);
  });
  it("fires when the outgoing is missing", () => {
    const v = checkIntermediateEventFlow(data(base(), [seq("i", "a", "ie")]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("an outgoing");
  });
  it("fires when the incoming is missing", () => {
    const v = checkIntermediateEventFlow(data(base(), [seq("o", "ie", "b")]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("an incoming");
  });
  it("fires (both) when it is disconnected", () => {
    const v = checkIntermediateEventFlow(data(base(), []));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("an incoming and an outgoing");
  });
  it("does NOT flag an edge-mounted intermediate event (that's B41's job)", () => {
    const els = [mk("host", "task"), mk("be", "intermediate-event", { boundaryHostId: "host" })];
    expect(checkIntermediateEventFlow(data(els, []))).toHaveLength(0);
  });
});

describe("B41 — edge-mounted intermediate event outgoing flow", () => {
  it("outer-most EP host WITHOUT an outgoing → error", () => {
    const els = [mk("ep", "subprocess-expanded"), mk("be", "intermediate-event", { boundaryHostId: "ep" }), mk("after", "task")];
    expect(checkEdgeMountIntermediateOutgoing(data(els, []))).toHaveLength(1);
  });
  it("outer-most EP host WITH an outgoing → clean", () => {
    const els = [mk("ep", "subprocess-expanded"), mk("be", "intermediate-event", { boundaryHostId: "ep" }), mk("after", "task")];
    expect(checkEdgeMountIntermediateOutgoing(data(els, [seq("o", "be", "after")]))).toHaveLength(0);
  });

  // Host activity nested inside an EP.
  const nested = () => [
    mk("epx", "subprocess-expanded"),
    mk("actA", "task", { parentId: "epx" }),   // the boundary event's host
    mk("actB", "task", { parentId: "epx" }),   // a sibling activity inside the EP
    mk("be", "intermediate-event", { boundaryHostId: "actA" }),
    mk("outside", "task"),                       // an activity OUTSIDE the EP
  ];

  it("activity-in-EP host WITHOUT an outgoing → clean (optional)", () => {
    expect(checkEdgeMountIntermediateOutgoing(data(nested(), []))).toHaveLength(0);
  });
  it("activity-in-EP host WITH outgoing to a sibling activity inside the EP → clean", () => {
    expect(checkEdgeMountIntermediateOutgoing(data(nested(), [seq("o", "be", "actB")]))).toHaveLength(0);
  });
  it("activity-in-EP host WITH outgoing to an element OUTSIDE the EP → error", () => {
    const v = checkEdgeMountIntermediateOutgoing(data(nested(), [seq("o", "be", "outside")]));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain("inside the host's Expanded Sub-Process");
  });
});
