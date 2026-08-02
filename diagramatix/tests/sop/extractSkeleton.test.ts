/**
 * SOP skeleton extractor — deterministic BPMN → SopSkeleton, with the critical
 * lane-scoping behaviour: a single-lane SOP keeps GLOBAL step numbers and
 * surfaces cross-lane hand-offs in both directions.
 */
import { describe, it, expect } from "vitest";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { extractSkeleton } from "@/app/lib/sop/extractSkeleton";

// Minimal element/connector factories (only the fields the extractor reads).
const el = (id: string, type: string, label: string, parentId?: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x: 0, y: 0, width: 80, height: 40, parentId, properties: {}, ...extra });
const seq = (id: string, sourceId: string, targetId: string, label = ""): Connector =>
  ({ id, type: "sequence", sourceId, targetId, label, waypoints: [] } as unknown as Connector);
const assoc = (id: string, sourceId: string, targetId: string): Connector =>
  ({ id, type: "associationBPMN", sourceId, targetId, directionType: "open-directed", waypoints: [] } as unknown as Connector);

// A 2-lane requisition process: Requester raises + files; Approver approves.
function fixture(): DiagramData {
  const elements: DiagramElement[] = [
    el("P1", "pool", "Company", undefined, { properties: { poolType: "white-box" } }),
    el("L1", "lane", "Requester", "P1"),
    el("L2", "lane", "Approver", "P1"),
    el("S", "start-event", "Start", "L1"),
    el("T1", "task", "Raise request", "L1"),
    el("T2", "task", "Approve request", "L2"),
    el("T3", "task", "File request", "L1"),
    el("Eend", "end-event", "End", "L1"),
    el("D", "data-object", "Request form", "L1"),
  ];
  const connectors: Connector[] = [
    seq("s0", "S", "T1"),
    seq("s1", "T1", "T2"),  // Requester → Approver  (hand-off)
    seq("s2", "T2", "T3"),  // Approver → Requester  (hand-off)
    seq("s3", "T3", "Eend"),
    assoc("a1", "T1", "D"), // T1 writes Request form
    assoc("a2", "D", "T3"), // T3 reads Request form
  ];
  return { elements, connectors, title: "Purchase Requisition" } as unknown as DiagramData;
}

describe("SOP skeleton extractor", () => {
  it("T2203 — whole-diagram scope: ordered steps with global numbers + both hand-offs", () => {
    const sk = extractSkeleton(fixture(), { scope: "whole", diagramName: "Purchase Requisition" });
    expect(sk.steps.map((s) => [s.globalNo, s.label])).toEqual([[1, "Raise request"], [2, "Approve request"], [3, "File request"]]);
    expect(sk.roles.sort()).toEqual(["Approver", "Requester"]);
    // Request form: written by T1 (output), read by T3 (input).
    expect(sk.steps.find((s) => s.label === "Raise request")!.outputs).toContain("Request form");
    expect(sk.steps.find((s) => s.label === "File request")!.inputs).toContain("Request form");
    // A WHOLE-diagram SOP has no BOUNDARY hand-offs (nothing leaves the scope).
    expect(sk.handoffsOut).toEqual([]);
    expect(sk.handoffsIn).toEqual([]);
  });

  it("T2204 — LANE scope keeps GLOBAL step numbers (Requester = steps 1 and 3, not 1 and 2)", () => {
    const sk = extractSkeleton(fixture(), { scope: "lane", scopeElementId: "L1", diagramName: "PR" });
    expect(sk.steps.map((s) => s.globalNo)).toEqual([1, 3]);          // step 2 (Approver) omitted, numbering preserved
    expect(sk.steps.every((s) => s.role === "Requester")).toBe(true);
    expect(sk.meta.scopeLabel).toBe("Requester");
  });

  it("T2205 — LANE scope surfaces inbound AND outbound hand-offs to the other lane", () => {
    const sk = extractSkeleton(fixture(), { scope: "lane", scopeElementId: "L1" });
    // Requester hands T1 off TO Approver, and receives T3's work back FROM Approver.
    expect(sk.handoffsOut.some((h) => h.to === "Approver")).toBe(true);
    expect(sk.handoffsIn.some((h) => h.from === "Approver")).toBe(true);
    // The step-level attribution is present too.
    expect(sk.steps.find((s) => s.globalNo === 1)!.handoffOut?.to).toBe("Approver");
    expect(sk.steps.find((s) => s.globalNo === 3)!.handoffIn?.from).toBe("Approver");
  });

  it("T2206 — extraction is deterministic (same input → identical skeleton)", () => {
    expect(JSON.stringify(extractSkeleton(fixture(), { scope: "whole" })))
      .toEqual(JSON.stringify(extractSkeleton(fixture(), { scope: "whole" })));
  });
});
