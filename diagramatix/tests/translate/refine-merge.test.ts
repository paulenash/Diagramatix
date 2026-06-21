/**
 * The AI tidy pass is structure-locked by mergeRefinement: it overlays only
 * label / taskType / gatewayType / eventType onto the deterministic plan,
 * matched by id, so the model can never add, remove, re-type or re-parent a
 * node — whatever it returns.
 */
import { describe, it, expect } from "vitest";
import { mergeRefinement } from "@/app/lib/ai/refineFlowchartBpmn";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

const els: AiElement[] = [
  { id: "t1", type: "task", label: "do it", pool: "p", taskType: "none" },
  { id: "g1", type: "gateway", label: "", pool: "p", gatewayType: "exclusive" },
];
const conns: AiConnection[] = [
  { sourceId: "g1", targetId: "t1", type: "sequence" },
];

describe("mergeRefinement (structure lock)", () => {
  it("applies whitelisted label / taskType / gatewayType + connection label", () => {
    const out = mergeRefinement(els, conns, {
      elements: [
        { id: "t1", label: "Process application", taskType: "user" },
        { id: "g1", gatewayType: "exclusive", label: "Approved?" },
      ],
      connections: [{ sourceId: "g1", targetId: "t1", label: "Yes" }],
    });
    expect(out.elements[0]).toMatchObject({ label: "Process application", taskType: "user", type: "task" });
    expect(out.elements[1].label).toBe("Approved?");
    expect(out.connections[0].label).toBe("Yes");
  });

  it("ignores attempts to change id / type / pool", () => {
    const out = mergeRefinement(els, conns, {
      elements: [{ id: "t1", type: "gateway", pool: "EVIL", label: "x" } as any],
    });
    expect(out.elements[0].type).toBe("task");
    expect(out.elements[0].pool).toBe("p");
  });

  it("ignores added or removed elements and connections (count is preserved)", () => {
    const out = mergeRefinement(els, conns, {
      elements: [{ id: "t1", label: "x" }, { id: "GHOST", type: "task", label: "ghost" } as any],
      connections: [], // model dropped the connection
    });
    expect(out.elements).toHaveLength(2);
    expect(out.elements.some((e) => e.id === "GHOST")).toBe(false);
    expect(out.connections).toHaveLength(1);
  });

  it("is a no-op when the model returns nothing useful", () => {
    const out = mergeRefinement(els, conns, {});
    expect(out.elements).toEqual(els);
    expect(out.connections).toEqual(conns);
  });
});
