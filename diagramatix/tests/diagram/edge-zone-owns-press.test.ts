/**
 * T4676–T4677 — one press, one gesture: an edge zone owns the press it gets.
 *
 * Paul, 22 September 2026, with the Dev Tools gesture trace switched on,
 * dragging a pool's left boundary:
 *
 *   [gesture] press on a container {label: 'Company', selected: false,
 *             took: 'HEADER (moves the container)', worldX: -55, leftEdge: -53}
 *   [gesture] MOVE drag starts
 *   [gesture] edge-zone decided {side: 'w', intent: 'RESIZE (drag ran across the edge)'}
 *   [gesture] RESIZE drag starts
 *   [gesture] MOVE_ELEMENT moved 11
 *   [gesture] RESIZE_ELEMENT moved 3
 *   [gesture] MOVE_ELEMENT moved 11
 *   … every mousemove, both …
 *
 *   "Problems when moving left boundary right!!!"
 *
 * TWO FAULTS, found in one capture.
 *
 *  1. The press was 2px LEFT of the pool — outside it — and the pool's handler
 *     still called it a header press. Its test was `x <= left edge + header
 *     width`, with no lower bound, so anything left of the pool was "header".
 *  2. The edge zone drawn over the pool does not stop the press, so the SAME
 *     press reached the pool's handler too. The zone began a RESIZE, the pool
 *     began a MOVE, and both ran together: every mousemove moved the pool and
 *     its eleven elements AND resized it. That was the "weird effects" — and
 *     worst dragging the boundary right, where the two push the same way.
 *
 * Now a press inside a zone belongs to the zone: the pool's handler only makes
 * sure it is selected and starts nothing, and the zone decides — across the
 * edge resizes, along it moves. The header test is bounded on both sides.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { edgeZoneAt, edgeBand } from "@/app/lib/diagram/edgeGesture";

const ALL = ["n", "e", "s", "w"] as const;

describe("T4676 — which edge zone a press lands in", () => {
  // Paul's pool: left edge at x = -53. Its height is not in the trace; any
  // realistic one gives the same answer.
  const company = { x: -53, y: 100, width: 900, height: 300 };

  it("puts Paul's press — 2px outside the left edge — in the LEFT zone", () => {
    expect(edgeZoneAt({ x: -55, y: 250 }, company, ALL)).toBe("w");
  });

  it("matches the drawn zones: 14px outside, and a slice inside", () => {
    const b = edgeBand("w", company.width, company.height);
    expect(edgeZoneAt({ x: company.x - b.outside, y: 250 }, company, ALL), "outer limit").toBe("w");
    expect(edgeZoneAt({ x: company.x - b.outside - 1, y: 250 }, company, ALL), "past it").toBeNull();
    expect(edgeZoneAt({ x: company.x + b.inside, y: 250 }, company, ALL), "inner limit").toBe("w");
    expect(edgeZoneAt({ x: company.x + b.inside + 1, y: 250 }, company, ALL), "into the header").toBeNull();
  });

  it("finds each of the four edges", () => {
    expect(edgeZoneAt({ x: 847, y: 250 }, company, ALL)).toBe("e");
    expect(edgeZoneAt({ x: 300, y: 95 }, company, ALL)).toBe("n");
    expect(edgeZoneAt({ x: 300, y: 405 }, company, ALL)).toBe("s");
    expect(edgeZoneAt({ x: 300, y: 250 }, company, ALL), "the middle of the pool").toBeNull();
  });

  it("gives a corner to the zone drawn on top, as the browser does", () => {
    expect(edgeZoneAt({ x: -53, y: 400 }, company, ALL)).toBe("s");
  });

  it("ignores an edge the shape does not offer", () => {
    expect(edgeZoneAt({ x: -55, y: 250 }, company, ["n", "e", "s"])).toBeNull();
  });
});

describe("T4677 — the pool's own handler stands aside for the zone", () => {
  const SYMBOLS = readFileSync(join(process.cwd(), "app", "components", "canvas", "SymbolRenderer.tsx"), "utf8");
  const handler = SYMBOLS.slice(
    SYMBOLS.indexOf("function handleMouseDown(e: React.MouseEvent) {\n    // A PRESS IN AN EDGE ZONE BELONGS TO THE ZONE"),
  );

  it("checks the zones FIRST, with the zones' own geometry", () => {
    expect(handler.length, "the edge-zone rule is gone from the top of the handler").toBeGreaterThan(0);
    const zone = handler.indexOf("edgeZoneAt(wp, element, resizableSides(element.type))");
    const header = handler.indexOf("const headerHit =");
    expect(zone).toBeGreaterThan(-1);
    expect(zone, "the zone check must run before the header test").toBeLessThan(header);
  });

  it("only selects — never starts a drag, never toggles the pool off", () => {
    const at = handler.indexOf("edgeZoneAt(wp, element, resizableSides(element.type))");
    const block = handler.slice(at, handler.indexOf("return;", at) + 7);
    expect(block).toMatch(/e\.stopPropagation\(\);/);
    expect(block).toMatch(/if \(!selected\) onSelect\(e\);/);
    expect(block, "a drag started here would run alongside the zone's").not.toMatch(/beginElementDrag/);
  });

  it("bounds the header test on both sides", () => {
    // The defect: `worldPos.x <= element.x + HEADER_LW` — anything left of
    // the container counted as its header.
    expect(SYMBOLS).toMatch(/const headerHit = worldPos\.x >= element\.x && worldPos\.x <= element\.x \+ HEADER_LW/);
  });
});
