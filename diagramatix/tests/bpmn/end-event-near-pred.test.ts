/**
 * Issue 7 (2026-07-29): a process-level End event with a single incoming flow is
 * placed NEAR its immediate predecessor — aligned to its row and following its
 * lane — not floating at a lane's vertical centre.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

// Flow crosses into the LOWER lane before ending, so the End event must follow
// its predecessor down rather than sit at the top lane.
const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [
    { id: "top", name: "Top" }, { id: "bot", name: "Bottom" },
  ] },
  { id: "s", type: "start-event", label: "S", pool: "p", lane: "top" },
  { id: "a", type: "task", label: "A", pool: "p", lane: "top" },
  { id: "b", type: "task", label: "B", pool: "p", lane: "bot" },
  { id: "e", type: "end-event", label: "Done", pool: "p", lane: "bot" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "a" }, { sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "e" },
];

describe("Issue 7 — End event sits near its predecessor", () => {
  it("T1065 — a single-incoming End event aligns to its predecessor's row", () => {
    const out = layoutBpmnDiagram(els, conns);
    const b = out.elements.find((x) => x.id === "b")!;
    const e = out.elements.find((x) => x.id === "e")!;
    const cyB = b.y + b.height / 2, cyE = e.y + e.height / 2;
    expect(Math.abs(cyE - cyB), `End (cy=${Math.round(cyE)}) should align to pred B (cy=${Math.round(cyB)})`).toBeLessThanOrEqual(1);
    // …and follow the predecessor's lane.
    expect(e.parentId, "End follows its predecessor's lane").toBe(b.parentId);
  });
});
