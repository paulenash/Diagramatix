/**
 * Investigation: R8.02 data-object positioning + input/output role.
 *
 * Reproduces the "Loan Application Process (as-is)" defect — data objects left in
 * the far-left column with no input/output role. Hypothesis: R8.02 (bpmnLayout
 * ~1798) finds the association via `aiConnections` filtered `c.type !== "sequence"
 * && c.type !== "message"`, but a data-object link emitted as a plain sequence
 * flow (the only types AiConnection supports) is excluded, so R8.02 never fires.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const base: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "l", name: "L" }] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "l" },
  { id: "t", type: "task", label: "Verify", pool: "p", lane: "l" },
  { id: "e", type: "end-event", label: "E", pool: "p", lane: "l" },
  { id: "din", type: "data-object", label: "Docs", pool: "p", lane: "l" },
  { id: "dout", type: "data-object", label: "Report", pool: "p", lane: "l" },
];
const flow: AiConnection[] = [
  { sourceId: "s", targetId: "t" },
  { sourceId: "t", targetId: "e" },
];
const at = (out: ReturnType<typeof layoutBpmnDiagram>, id: string) => out.elements.find((x) => x.id === id)!;
const nearX = (d: { x: number; width: number }, t: { x: number; width: number }) =>
  // data object's centre within ~2 task-widths of the task
  Math.abs((d.x + d.width / 2) - (t.x + t.width / 2)) < 260;

describe("R8.02 data-object association — type insensitivity", () => {
  it("T0531 — data link emitted as a SEQUENCE flow (the AI's only option) gets role + placement", () => {
    // planBpmn only lets the AI emit "sequence"/"message" types, so a data-object
    // association arrives as a sequence flow. R8.02 must still find it (by endpoint).
    const out = layoutBpmnDiagram(base, [
      ...flow,
      { sourceId: "din", targetId: "t", type: "sequence" }, // input, AI-style sequence
      { sourceId: "t", targetId: "dout", type: "sequence" }, // output
    ]);
    const din = at(out, "din"), dout = at(out, "dout"), t = at(out, "t");
    expect(din.properties?.role, "data → element = input").toBe("input");
    expect(dout.properties?.role, "element → data = output").toBe("output");
    expect(nearX(din, t), "input data object near its task").toBe(true);
    expect(nearX(dout, t), "output data object near its task").toBe(true);
  });

  it("T0532 — data link with NO type — R8.02 fires (role + placement correct)", () => {
    const out = layoutBpmnDiagram(base, [
      ...flow,
      { sourceId: "din", targetId: "t" }, // input, untyped
      { sourceId: "t", targetId: "dout" }, // output, untyped
    ]);
    const din = at(out, "din"), dout = at(out, "dout"), t = at(out, "t");
    expect(din.properties?.role, "data → element = input").toBe("input");
    expect(dout.properties?.role, "element → data = output").toBe("output");
    expect(nearX(din, t), "input data object near its task").toBe(true);
    expect(nearX(dout, t), "output data object near its task").toBe(true);
  });

  it("T0537 — a Data Store linked by a sequence-typed association sits near its element (R8.03)", () => {
    const out = layoutBpmnDiagram(
      [...base, { id: "store", type: "data-store", label: "Lending Policy", pool: "p", lane: "l" }],
      [...flow, { sourceId: "store", targetId: "t", type: "sequence" }],
    );
    const store = at(out, "store"), t = at(out, "t");
    expect(nearX(store, t), "data store should be placed near its associated element").toBe(true);
  });
});
