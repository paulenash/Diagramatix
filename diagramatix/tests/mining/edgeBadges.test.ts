/**
 * Discovered-BPMN edge frequency → transitionCount badge (matches the discovered
 * state machine's count badges rendered by ConnectorRenderer).
 */
import { describe, it, expect } from "vitest";
import { badgeEdgeCounts } from "@/app/lib/mining/edgeBadges";
import type { DiagramData } from "@/app/lib/diagram/types";

const conn = (id: string, label: string | undefined): DiagramData["connectors"][number] =>
  ({ id, sourceId: "a", targetId: "b", label, type: "sequence", sourceSide: "right", targetSide: "left", directionType: "forward", routingType: "orthogonal", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] } as unknown as DiagramData["connectors"][number]);

describe("edge badges", () => {
  it("T2237 — numeric edge labels become transitionCount badges; others untouched", () => {
    const data = { elements: [], connectors: [conn("c1", "42"), conn("c2", "approve"), conn("c3", undefined)] } as DiagramData;
    const out = badgeEdgeCounts(data);
    expect(out.connectors[0].transitionCount).toBe(42);
    expect(out.connectors[0].label).toBeUndefined();
    expect(out.connectors[1].transitionCount).toBeUndefined();
    expect(out.connectors[1].label).toBe("approve");
    expect(out.connectors[2].label).toBeUndefined();
  });
});
