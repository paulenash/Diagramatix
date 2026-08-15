/**
 * ENG-05 — REMOVE_SPACE over a CROSS zone (both axes active) must still shift a
 * CORNER element that overlaps one strip but sits cleanly outside the other. The
 * old blanket `if (partialOverlap) return e` bailed such elements out entirely,
 * so they drifted out of alignment while their neighbours moved.
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const box = (id: string, x: number, y: number, w = 40, h = 40): DiagramElement =>
  ({ id, type: "task", x, y, width: w, height: h, label: id, properties: {} });

// Cross zone: vertical strip x∈[100,150], horizontal strip y∈[100,150].
const ZONE = { x: 100, y: 100, width: 50, height: 50 };
const act: Action = { type: "REMOVE_SPACE", payload: { zone: ZONE } };

function run(elements: DiagramElement[]): DiagramData {
  return reducer({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } }, act);
}
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

describe("REMOVE_SPACE — corner elements in a cross zone (ENG-05)", () => {
  it("shifts a corner that is right of the vertical strip but straddles the horizontal strip", () => {
    // x=200 → cleanly right of the vertical strip (≥150).
    // y=130,h=40 → straddles the horizontal strip's bottom edge (not fully inside,
    // so not deleted; partially overlaps, so the old code bailed it out).
    const corner = box("corner", 200, 130);
    const d = run([corner]);
    const c = at(d, "corner");
    expect(c.x).toBe(150);  // shifted LEFT by the vertical strip width — the fix
    expect(c.y).toBe(130);  // straddles the horizontal strip → no vertical shift
  });

  it("still shifts a clean bottom-right element on BOTH axes", () => {
    const clean = box("clean", 200, 200); // right of + below the whole cross
    const d = run([clean]);
    const c = at(d, "clean");
    expect(c.x).toBe(150); // left by strip width
    expect(c.y).toBe(150); // up by strip height
  });

  it("leaves an element that straddles BOTH strips where it is", () => {
    // Spans across the cross centre on both axes → can't cleanly shift either way.
    const straddle = box("straddle", 130, 130, 60, 60); // x∈[130,190], y∈[130,190]
    const d = run([straddle]);
    const s = at(d, "straddle");
    expect(s.x).toBe(130);
    expect(s.y).toBe(130);
  });
});
