/**
 * V06.08 (2026-08-29): "any number of weird placements of activities".
 *
 * Root cause: the model emitted `parentSubprocess` / `boundaryHost` / `lane`
 * values that named nothing in the plan — a subprocess it had renamed, a lane id
 * spelled `Lane_Engineering` where the lane element was `engineering`. Every
 * flow-placement pass skips an element whose container it cannot resolve, so
 * those elements fell through to a float fallback and were scattered across the
 * canvas at whatever coordinates that produced.
 *
 * The failure was SILENT — a fifteen-diagram unattended run reported success.
 * These tests pin both halves of the fix: recover the reference where it is a
 * near miss, and where it cannot be recovered still place the element inside a
 * real container AND say so.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection, type LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";

/** Lays the plan out, collecting diagnostics. */
function run(els: AiElement[], conns: AiConnection[]) {
  const diagnostics: LayoutDiagnostic[] = [];
  const out = layoutBpmnDiagram(els, conns, { onDiagnostic: (d) => diagnostics.push(d) });
  return { out, diagnostics };
}

/** True when `el` sits entirely within `box`. */
const inside = (el: { x: number; y: number; width: number; height: number },
                box: { x: number; y: number; width: number; height: number }) =>
  el.x >= box.x && el.y >= box.y &&
  el.x + el.width <= box.x + box.width && el.y + el.height <= box.y + box.height;

describe("dangling AI references", () => {
  it("T2901 — a lane id the AI mis-spelled is recovered, not floated", () => {
    // The lane element is `eng`; the tasks name `Lane_Eng` — the exact shape
    // seen in V06.08. Normalising both sides makes them the same lane.
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "Product Organisation", poolType: "white-box" },
      { id: "eng", type: "lane", label: "Engineering", parentPool: "p" },
      { id: "s", type: "start-event", label: "Brief received", pool: "p", lane: "Lane_Eng" },
      { id: "t1", type: "task", label: "Assess Feasibility", pool: "p", lane: "Lane_Eng" },
      { id: "e", type: "end-event", label: "Assessed", pool: "p", lane: "Lane_Eng" },
    ];
    const conns: AiConnection[] = [{ sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "e" }];
    const { out, diagnostics } = run(els, conns);

    const lane = out.elements.find((e) => e.id === "eng")!;
    for (const id of ["s", "t1", "e"]) {
      const el = out.elements.find((x) => x.id === id)!;
      expect(el.parentId, `${id} should be homed to the lane`).toBe("eng");
      expect(inside(el, lane), `${id} must sit inside its lane`).toBe(true);
    }
    expect(diagnostics.some((d) => d.kind === "recovered-reference" && d.field === "lane")).toBe(true);
    expect(diagnostics.some((d) => d.kind === "unplaced")).toBe(false);
  });

  it("T2902 — a parentSubprocess naming nothing still lands in a container, and is reported", () => {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "s", type: "start-event", label: "S", pool: "p" },
      { id: "t1", type: "task", label: "Real Work", pool: "p" },
      { id: "e", type: "end-event", label: "E", pool: "p" },
      // Names an expanded subprocess that is not in the plan at all.
      { id: "orphan", type: "task", label: "Stranded Task", pool: "p", parentSubprocess: "ep-that-does-not-exist" },
    ];
    const conns: AiConnection[] = [{ sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "e" }];
    const { out, diagnostics } = run(els, conns);

    const pool = out.elements.find((e) => e.id === "p")!;
    const orphan = out.elements.find((e) => e.id === "orphan")!;
    // The point of the fix: it is contained, not floating at arbitrary coordinates.
    expect(orphan.parentId, "must be adopted by a real container").toBeTruthy();
    const container = out.elements.find((e) => e.id === orphan.parentId)!;
    expect(inside(orphan, container), "must sit inside whatever adopted it").toBe(true);
    expect(inside(orphan, pool), "and therefore inside the pool").toBe(true);
    // And the run must not be able to call this a clean success.
    expect(
      diagnostics.some((d) => d.elementId === "orphan" && d.kind !== "empty-subprocess"),
      "a stranded element must produce a diagnostic",
    ).toBe(true);
  });

  it("T2903 — an expanded subprocess left with no children is reported", () => {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "s", type: "start-event", label: "S", pool: "p" },
      { id: "ep", type: "subprocess-expanded", label: "Repeat Until Agreed", pool: "p" },
      { id: "e", type: "end-event", label: "E", pool: "p" },
    ];
    const conns: AiConnection[] = [{ sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" }];
    const { diagnostics } = run(els, conns);
    expect(diagnostics.some((d) => d.kind === "empty-subprocess" && d.elementId === "ep")).toBe(true);
  });

  it("T2904 — a clean plan produces no diagnostics at all", () => {
    // The guard on the guard: if a well-formed plan reported problems, the
    // diagnostics would be noise and an unattended run would learn to ignore them.
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "l", type: "lane", label: "Sales", parentPool: "p" },
      { id: "s", type: "start-event", label: "Order received", pool: "p", lane: "l" },
      { id: "ep", type: "subprocess-expanded", label: "Check Order", pool: "p", lane: "l" },
      { id: "es", type: "start-event", label: "", parentSubprocess: "ep" },
      { id: "t1", type: "task", label: "Validate Order", parentSubprocess: "ep" },
      { id: "ee", type: "end-event", label: "", parentSubprocess: "ep" },
      { id: "e", type: "end-event", label: "Order checked", pool: "p", lane: "l" },
    ];
    const conns: AiConnection[] = [
      { sourceId: "s", targetId: "ep" }, { sourceId: "ep", targetId: "e" },
      { sourceId: "es", targetId: "t1" }, { sourceId: "t1", targetId: "ee" },
    ];
    const { diagnostics } = run(els, conns);
    expect(diagnostics, JSON.stringify(diagnostics, null, 2)).toHaveLength(0);
  });
});
