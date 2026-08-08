/**
 * Re-attaching mined directly-follows frequencies to an AI-curated BPMN so the
 * twin can calibrate gateway branch probabilities off it (the AI drops them).
 */
import { describe, it, expect } from "vitest";
import { annotateGatewayFrequencies } from "@/app/lib/mining/aiFrequencies";
import type { Variant } from "@/app/lib/mining/types";
import type { DiagramData } from "@/app/lib/diagram/types";

const V = (events: string[], count: number): Variant => ({ states: events, events, count });
const el = (id: string, type: string, label: string): DiagramData["elements"][number] =>
  ({ id, type, label, x: 0, y: 0, width: 80, height: 40, properties: {} } as DiagramData["elements"][number]);
const c = (id: string, s: string, t: string): DiagramData["connectors"][number] =>
  ({ id, sourceId: s, targetId: t, type: "sequence", sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "orthogonal", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] } as unknown as DiagramData["connectors"][number]);

// Assessed → (gw) → A / B → Completed → (end); with an early exit A → (end).
const DATA: DiagramData = {
  elements: [el("as", "task", "Assessed"), el("gw", "gateway", ""), el("a", "task", "A"), el("b", "task", "B"), el("cp", "task", "Completed"), el("end", "end-event", "")],
  connectors: [c("c1", "as", "gw"), c("c2", "gw", "a"), c("c3", "gw", "b"), c("c4", "a", "cp"), c("c5", "b", "cp"), c("c6", "cp", "end"), c("c7", "a", "end")],
} as DiagramData;

describe("AI frequency annotation", () => {
  it("T2241 — gateway out-edges get the mined directly-follows counts (→ branch probabilities)", () => {
    const variants = [V(["Assessed", "A", "Completed"], 7), V(["Assessed", "B", "Completed"], 3), V(["Assessed", "A"], 2)];
    const out = annotateGatewayFrequencies(DATA, variants);
    const byId = new Map(out.connectors.map((x) => [x.id, x]));
    // Assessed→A = 9 (7 + 2), Assessed→B = 3 → the gateway split.
    expect(byId.get("c2")!.transitionCount).toBe(9);
    expect(byId.get("c3")!.transitionCount).toBe(3);
  });

  it("T2242 — an early-exit branch to the end carries the mined end count", () => {
    const variants = [V(["Assessed", "A", "Completed"], 7), V(["Assessed", "A"], 2)];
    const out = annotateGatewayFrequencies(DATA, variants);
    // A → end (c7): 2 cases ended at A.
    expect(out.connectors.find((x) => x.id === "c7")!.transitionCount).toBe(2);
  });
});
