/**
 * UML (Domain-diagram) connector re-routing modes.
 *
 * Reproduces Paul's scenario: two entities on the same row joined by a
 * horizontal association; move the RIGHT one up.
 *   • OPTIMAL (default): both endpoints "slide" — the stationary LEFT endpoint
 *     rides up, and the moving RIGHT endpoint stays at the original height.
 *   • STICKY: both endpoints stay fixed on their face (offset 0.5) — so the
 *     left point stays put and the right point moves up with its entity — UNTIL
 *     a large move makes a different face closest, then that end jumps.
 * Also guards that the flag NEVER touches non-UML connectors.
 */
import { describe, it, expect, afterEach } from "vitest";
import { recomputeAllConnectors, setUmlStickyRouting } from "@/app/lib/diagram/routing";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

afterEach(() => setUmlStickyRouting(false)); // never leak the flag between tests

const cls = (id: string, x: number, y: number): DiagramElement =>
  ({ id, type: "uml-class", x, y, width: 100, height: 60, label: id, properties: {} });

const assoc = (): Connector => ({
  id: "a1", sourceId: "L", targetId: "R", type: "uml-association",
  sourceSide: "right", targetSide: "left", directionType: "non-directed", routingType: "rectilinear",
  sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
  sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5,
});

const recompute = (conn: Connector, els: DiagramElement[]) => recomputeAllConnectors([conn], els)[0];

describe("UML sticky routing", () => {
  it("OPTIMAL (default): a small upward move of the right entity slides BOTH endpoints", () => {
    const els = [cls("L", 0, 0), cls("R", 200, -20)]; // right moved up 20px
    const r = recompute(assoc(), els);
    expect(r.sourceSide).toBe("right");
    expect(r.targetSide).toBe("left");
    // stationary LEFT endpoint slid UP (offset < 0.5); moving RIGHT endpoint
    // stayed near the original height (offset > 0.5).
    expect(r.sourceOffsetAlong!).toBeLessThan(0.45);
    expect(r.targetOffsetAlong!).toBeGreaterThan(0.55);
  });

  it("STICKY: a small upward move keeps BOTH endpoints fixed on their face (0.5)", () => {
    setUmlStickyRouting(true);
    const els = [cls("L", 0, 0), cls("R", 200, -20)];
    const r = recompute(assoc(), els);
    expect(r.sourceSide).toBe("right");
    expect(r.targetSide).toBe("left");
    // Both offsets preserved → left point stays put, right point rides up with R.
    expect(r.sourceOffsetAlong).toBe(0.5);
    expect(r.targetOffsetAlong).toBe(0.5);
  });

  it("STICKY: a LARGE upward move (different face now closest) jumps to the optimal face", () => {
    setUmlStickyRouting(true);
    const els = [cls("L", 0, 0), cls("R", 200, -300)]; // right way above → top/bottom now closest
    const r = recompute(assoc(), els);
    // source's closest face is now its TOP (R is far above), target's is BOTTOM.
    expect(r.sourceSide).toBe("top");
    expect(r.targetSide).toBe("bottom");
  });

  it("STICKY flag NEVER affects non-UML connectors (e.g. BPMN sequence)", () => {
    const els: DiagramElement[] = [
      { id: "s", type: "task", x: 0, y: 0, width: 100, height: 60, label: "s", properties: {} },
      { id: "t", type: "task", x: 200, y: 0, width: 100, height: 60, label: "t", properties: {} },
    ];
    const seq: Connector = { id: "c", sourceId: "s", targetId: "t", type: "sequence",
      sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] };
    const off = recompute(seq, els);
    setUmlStickyRouting(true);
    const on = recompute(seq, els);
    // Identical result regardless of the UML flag.
    expect(on.sourceSide).toBe(off.sourceSide);
    expect(on.targetSide).toBe(off.targetSide);
    expect(on.waypoints).toEqual(off.waypoints);
  });
});
