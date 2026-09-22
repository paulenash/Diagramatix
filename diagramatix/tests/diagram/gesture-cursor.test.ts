/**
 * T4661–T4662 — the cursor for the length of a gesture.
 *
 * Paul's protocol, decided 22 September 2026:
 *
 *   "When selecting an element:
 *    1. click and press → Drag cursor
 *    2. click, click and press → this should be connector creation mode and
 *       when the targets are highlighted, the cursor should change to '+'.
 *       Currently it remains as a Grab cursor after the recent changes."
 *
 * Neither gesture can hold its cursor from the shape it started on. The
 * pointer passes over other shapes, each with a cursor of its own — and in the
 * MOVE case the shape itself changes under the pointer: pressing an unselected
 * element selects it, and the selected state lays a crosshair overlay across
 * it mid-drag. That overlay's ✛ is the "+" Paul kept seeing through a move.
 *
 * So the canvas root carries the gesture's cursor for as long as the gesture
 * lasts — `.dgx-dragging` (✊) while an element moves, `.dgx-connecting` (✛)
 * while a connector is being drawn — and `!important` over every descendant.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const CANVAS = src("app", "components", "canvas", "Canvas.tsx");
const CSS = src("app", "globals.css");

describe("T4661 — the root carries the gesture", () => {
  it("adds dgx-dragging while an element is being moved", () => {
    expect(CANVAS).toMatch(/\$\{draggingElementId \? " dgx-dragging" : ""\}/);
  });

  it("adds dgx-connecting while a connector is being drawn", () => {
    expect(CANVAS).toMatch(/\$\{isDraggingConnector \? " dgx-connecting" : ""\}/);
  });

  it("on the canvas root, beside the pan class", () => {
    const at = CANVAS.indexOf("dgx-pan${draggingElementId");
    expect(at, "the gesture classes are not on the root with dgx-pan").toBeGreaterThan(-1);
    expect(CANVAS.slice(at - 200, at)).toMatch(/className=\{`w-full h-full outline-none /);
  });

  it("the move state cannot be left on", () => {
    // A stuck `draggingElementId` would leave ✊ on the whole canvas. A window
    // mouseup clears it whatever else happens.
    expect(CANVAS).toMatch(/function onWindowMouseUp\(\) \{ setDraggingElementId\(null\); \}/);
  });
});

describe("T4662 — and wins over every shape it passes", () => {
  it("✊ for a move", () => {
    expect(CSS).toMatch(/\.dgx-dragging, \.dgx-dragging \*\s*\{ cursor: grabbing !important; \}/);
  });

  it("✛ for a connector", () => {
    expect(CSS).toMatch(/\.dgx-connecting, \.dgx-connecting \*\s*\{ cursor: crosshair !important; \}/);
  });
});
