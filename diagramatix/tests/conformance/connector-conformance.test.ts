/**
 * Connector conformance (#2) — the deterministic checks behind the AI-quality
 * complaints ("connectors not moveable", "too many segments"). Pins the
 * over-segmentation/lock detector, and asserts the real layout produces clean,
 * moveable, non-crossing wiring. The SAME `findConnectorConformance` net runs in
 * the AI conformance harness (scripts/ai-conformance-report.ts) on live output.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import {
  findConnectorConformance,
  checkConnectorSegments,
  summariseConformance,
  MAX_AUTO_WAYPOINTS,
} from "@/app/lib/diagram/checks/connectorConformance";
import type { Connector } from "@/app/lib/diagram/types";
import bookTripCompensation from "./fixtures/book-trip-compensation.json";

const conn = (over: Partial<Connector>): Connector =>
  ({
    id: "c", type: "sequence", sourceId: "a", targetId: "b",
    sourceSide: "right", targetSide: "left", waypoints: [],
    routingType: "rectilinear", directionType: "directed",
    ...over,
  } as Connector);
const wps = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i * 10, y: 0 }));

describe("connector conformance", () => {
  describe("over-segmentation / lock detector", () => {
    it(`flags a routed connector with > ${MAX_AUTO_WAYPOINTS} waypoints`, () => {
      const issues = checkConnectorSegments({ connectors: [conn({ waypoints: wps(10) })] });
      expect(issues).toHaveLength(1);
      expect(issues[0].rule).toBe("connector-over-segmented");
    });
    it(`passes an auto route (<= ${MAX_AUTO_WAYPOINTS} waypoints)`, () => {
      expect(checkConnectorSegments({ connectors: [conn({ waypoints: wps(7) })] })).toHaveLength(0);
      expect(checkConnectorSegments({ connectors: [conn({ waypoints: wps(8) })] })).toHaveLength(0);
    });
    it("ignores non-routed types (a message flow legitimately has fixed waypoints)", () => {
      expect(checkConnectorSegments({ connectors: [conn({ type: "messageBPMN", waypoints: wps(12) })] })).toHaveLength(0);
    });
  });

  describe("layoutBpmnDiagram produces conformant wiring", () => {
    const CASES: { name: string; elements: AiElement[]; connections: AiConnection[] }[] = [
      {
        name: "linear",
        elements: [
          { id: "s", type: "start-event", label: "Start" },
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "e", type: "end-event", label: "End" },
        ],
        connections: [
          { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "e" },
        ],
      },
      {
        name: "gateway split + merge",
        elements: [
          { id: "s", type: "start-event", label: "Start" },
          { id: "g", type: "gateway", label: "OK?" },
          { id: "a", type: "task", label: "Approve" },
          { id: "r", type: "task", label: "Reject" },
          { id: "m", type: "gateway", label: "" },
          { id: "e", type: "end-event", label: "End" },
        ],
        connections: [
          { sourceId: "s", targetId: "g" }, { sourceId: "g", targetId: "a", label: "Yes" },
          { sourceId: "g", targetId: "r", label: "No" }, { sourceId: "a", targetId: "m" },
          { sourceId: "r", targetId: "m" }, { sourceId: "m", targetId: "e" },
        ],
      },
      {
        // Regression: the AI conformance harness surfaced this back-edge case —
        // the loop-back t3→t2 picked top→top, but a sibling (pub) stacked above
        // t3 blocked the top exit, so the route fell back and clipped t3's body
        // (sequence-clips-own-endpoint). The side picker now detects the stacked
        // sibling and routes the loop UNDER (bottom→bottom). See bpmnLayout.ts.
        name: "rework loop (back-edge, sibling stacked above source)",
        elements: [
          { id: "s", type: "start-event", label: "Start" },
          { id: "t1", type: "task", label: "Draft" },
          { id: "t2", type: "task", label: "Review" },
          { id: "g", type: "gateway", label: "Approved?" },
          { id: "t3", type: "task", label: "Revise" },
          { id: "pub", type: "task", label: "Publish" },
          { id: "e", type: "end-event", label: "End" },
        ],
        connections: [
          { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
          { sourceId: "t2", targetId: "g" }, { sourceId: "g", targetId: "pub", label: "Yes" },
          { sourceId: "g", targetId: "t3", label: "No" }, { sourceId: "t3", targetId: "t2" },
          { sourceId: "pub", targetId: "e" },
        ],
      },
    ];

    for (const c of CASES) {
      it(`${c.name}: clean (no dangling / crossing / duplicate / over-segmented / non-moveable)`, () => {
        const data = layoutBpmnDiagram(c.elements, c.connections);
        const issues = findConnectorConformance(data);
        expect(issues, `conformance issues: ${JSON.stringify(summariseConformance(issues))}`).toEqual([]);
      });
    }

    // Regression: the AI harness's book-trip-allornothing — a transaction with a
    // compensation fan-out where the "Cancel All" gateway has a target sitting
    // LEVEL to its right. The 2-way decision-gateway side rule forced top→top by
    // index, so the route jogged into the target body (sequence-clips-own-endpoint).
    // The fix makes the gateway side position-based (level target → exit right).
    it("book-trip compensation fan-out (real AI plan): clean wiring", () => {
      const f = bookTripCompensation as { elements: AiElement[]; connections: AiConnection[] };
      const data = layoutBpmnDiagram(f.elements, f.connections);
      const issues = findConnectorConformance(data);
      expect(issues, `conformance issues: ${JSON.stringify(summariseConformance(issues))}`).toEqual([]);
    });
  });
});
