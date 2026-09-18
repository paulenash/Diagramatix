/**
 * Does the gold flash actually get a chance to fire?
 *
 * The effect that computes the flash keys on `data.elements`. If a reducer
 * action returns the SAME array instance — which is the correct, allocation-free
 * thing for an action that touched nothing, and an easy accident for one that
 * did — the effect never runs, the armed snapshot is never consumed, and the
 * flash silently does nothing.
 *
 * Paul, 2026-09-18: "Flashing gold not working??". This is the first thing to
 * rule in or out, because everything else about the feature is downstream of it.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, x: number, y: number): DiagramElement =>
  ({ id, type: "task", label: id, x, y, width: 102, height: 65, properties: {} } as DiagramElement);

const state = (): DiagramData =>
  ({
    elements: [el("A", 100, 100), el("B", 300, 100)],
    connectors: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as DiagramData);

describe("T4494 — an Voice Assist edit gives React a new elements array to see", () => {
  it("a move produces a different array instance", () => {
    const before = state();
    const after = reducer(before, {
      type: "MOVE_ELEMENTS",
      payload: { ids: ["A"], dx: 20, dy: 0 },
    } as never);
    expect(after.elements, "same instance — the flash effect would never run").not.toBe(before.elements);
    expect(after.elements.find((e) => e.id === "A")!.x).toBe(120);
  });

  it("a nudge of zero correctly changes nothing — and so cannot flash", () => {
    // Worth pinning: the reducer returns the SAME state for a no-op move, which
    // is right, and means the flash effect must not depend on being handed a
    // fresh array on every command.
    const before = state();
    const after = reducer(before, {
      type: "MOVE_ELEMENTS",
      payload: { ids: ["A"], dx: 0, dy: 0 },
    } as never);
    expect(after.elements).toBe(before.elements);
  });
});
