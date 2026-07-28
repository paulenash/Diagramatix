/**
 * Issue 5 (2026-07-29): a Data Object / Store placed inside an Expanded
 * Subprocess is moved vertically OUTSIDE the EP's nearest boundary (and re-homed
 * to the EP's container) so it doesn't crowd the EP's flow.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const els: AiElement[] = [
  { id: "p", type: "pool", label: "P", poolType: "white-box" },
  { id: "s", type: "start-event", label: "S", pool: "p" },
  { id: "ep", type: "subprocess-expanded", label: "Do Work", pool: "p" },
  { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "t1", type: "task", label: "Check", parentSubprocess: "ep" },
  { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
  { id: "ds", type: "data-store", label: "Lending Policy", parentSubprocess: "ep" },
  { id: "e", type: "end-event", label: "E", pool: "p" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
  { sourceId: "es", targetId: "t1" }, { sourceId: "t1", targetId: "ee" },
  { sourceId: "t1", targetId: "ds" },
];

describe("Issue 5 — data artifacts move outside an EP", () => {
  it("T1066 — a data store inside an EP ends up fully above or below the EP, re-homed to its container", () => {
    const out = layoutBpmnDiagram(els, conns);
    const ep = out.elements.find((e) => e.id === "ep")!;
    const ds = out.elements.find((e) => e.id === "ds")!;
    const outside = (ds.y + ds.height <= ep.y) || (ds.y >= ep.y + ep.height);
    expect(outside, `data store [y ${Math.round(ds.y)}..${Math.round(ds.y + ds.height)}] must be outside the EP [y ${Math.round(ep.y)}..${Math.round(ep.y + ep.height)}]`).toBe(true);
    expect(ds.parentId, "re-homed out of the EP").not.toBe("ep");
  });
});
