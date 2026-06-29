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
    ];

    for (const c of CASES) {
      it(`${c.name}: clean (no dangling / crossing / duplicate / over-segmented / non-moveable)`, () => {
        const data = layoutBpmnDiagram(c.elements, c.connections);
        const issues = findConnectorConformance(data);
        expect(issues, `conformance issues: ${JSON.stringify(summariseConformance(issues))}`).toEqual([]);
      });
    }
  });
});
