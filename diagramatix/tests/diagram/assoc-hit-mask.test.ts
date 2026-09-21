/**
 * T4653–T4654 — a Data Object's association never takes a click off its own
 * element, and a pool header is always a handle.
 *
 * Paul, 21 September 2026:
 *
 *   "Clicking on an element with a Data Object connected to it, that has
 *    converted to a centre to centre connector because one of the source or
 *    target has been moved, should not ever select the association connector
 *    over selecting the element."
 *
 * An association is drawn above every shape, so its invisible 12px hit path
 * would take any click it crosses. The canvas cuts the shapes out of it with
 * an `evenodd` clipPath — one huge rectangle, minus one per shape.
 *
 * EVEN-ODD COUNTS; IT DOES NOT UNION. A point inside TWO subtracted rectangles
 * is inside an even number of them and is filled again: a hole punched twice
 * is not a hole. The canvas passed `sourceBounds` and `targetBounds`
 * explicitly and ALSO included every element in `maskBounds` — so the only two
 * rectangles that appeared twice were the association's own endpoints, and the
 * line stayed clickable inside exactly the two shapes it belongs to.
 *
 * Centre-to-centre is why it surfaced when it did. A routed association clips
 * only the edge of its endpoints, so the doubled hole sits where nobody
 * clicks; a centre-to-centre line runs through the middle of both shapes,
 * directly under the pointer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dedupeHoles, isClippedOut } from "@/app/lib/diagram/hitMask";

const TASK = { x: 100, y: 100, width: 120, height: 80 };
const DATA = { x: 400, y: 100, width: 50, height: 60 };
const OTHER = { x: 700, y: 300, width: 90, height: 40 };
const centreOf = (r: { x: number; y: number; width: number; height: number }) =>
  ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

describe("T4653 — the hole is punched once", () => {
  it("is the defect, stated as arithmetic", () => {
    // What the canvas used to build: endpoints, then every element again.
    const doubled = [TASK, DATA, TASK, DATA, OTHER];
    expect(isClippedOut(centreOf(TASK), doubled), "the task's centre was NOT cut away").toBe(false);
    expect(isClippedOut(centreOf(DATA), doubled)).toBe(false);
    // …while a shape mentioned once was cut away correctly, which is why this
    // went unnoticed everywhere except on the association's own endpoints.
    expect(isClippedOut(centreOf(OTHER), doubled)).toBe(true);
  });

  it("cuts all three once the list is de-duplicated", () => {
    const holes = dedupeHoles([TASK, DATA, TASK, DATA, OTHER]);
    expect(holes).toHaveLength(3);
    for (const r of [TASK, DATA, OTHER]) {
      expect(isClippedOut(centreOf(r), holes), JSON.stringify(r)).toBe(true);
    }
  });

  it("leaves the line clickable in the gap between the shapes", () => {
    const holes = dedupeHoles([TASK, DATA, TASK, DATA, OTHER]);
    expect(isClippedOut({ x: 300, y: 140 }, holes), "the open span must stay clickable").toBe(false);
  });

  it("keeps order, and drops rectangles that cut nothing", () => {
    expect(dedupeHoles([TASK, DATA])).toEqual([TASK, DATA]);
    expect(dedupeHoles([{ x: 0, y: 0, width: 0, height: 50 }])).toEqual([]);
    expect(dedupeHoles([{ x: 0, y: 0, width: 10, height: 0 }])).toEqual([]);
  });

  it("treats float drift as the same hole", () => {
    expect(dedupeHoles([TASK, { ...TASK, x: TASK.x + 0.001 }])).toHaveLength(1);
    expect(dedupeHoles([TASK, { ...TASK, x: TASK.x + 5 }]), "but not a real difference").toHaveLength(2);
  });

  it("is what the renderer actually calls", () => {
    const src = readFileSync(join(process.cwd(), "app", "components", "canvas", "ConnectorRenderer.tsx"), "utf8");
    expect(src).toMatch(/const holes = dedupeHoles\(\[/);
  });
});

describe("T4654 — a pool header is a handle, not a connector source", () => {
  const SYMBOLS = readFileSync(join(process.cwd(), "app", "components", "canvas", "SymbolRenderer.tsx"), "utf8");

  it("keeps the connect overlay off the header strip", () => {
    // Paul, 2026-09-21: "clicking on the Pool header should always just allow
    // pool movement … and never go to connector create mode."
    expect(SYMBOLS).toMatch(/element\.type === "pool"[\s\S]{0,700}x: element\.x \+ containerHeaderWidth\(element\)/);
  });

  it("shows a grab cursor there, on every pool", () => {
    expect(SYMBOLS).toMatch(/fill=\{poolHeaderColour\}[\s\S]{0,120}cursor: "grab"/);
    expect(SYMBOLS, "the cursor must not depend on the pool's type")
      .not.toMatch(/style=\{isWhiteBox \? \{ cursor: "pointer" \} : undefined\}/);
  });

  it("a drag on a selected shape MOVES it; only a still hold connects", () => {
    // The overlay used to read a 5px movement as "start drawing a connector",
    // so dragging a selected shape drew a line instead of moving it.
    const at = SYMBOLS.indexOf("MOVE IS THE DEFAULT; CONNECTING IS THE DELIBERATE ONE");
    expect(at, "the overlay's move-vs-connect rule is gone").toBeGreaterThan(-1);
    const body = SYMBOLS.slice(at, at + 3000);
    expect(body, "movement no longer starts a drag").toMatch(/> 4\) \{[\s\S]{0,300}beginElementDrag\(e\)/);
    expect(body, "the 300ms hold must still connect").toMatch(/setTimeout\(activate, 300\)/);
  });
});
