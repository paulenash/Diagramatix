/**
 * T4658–T4660 — the grab cursor everywhere a drag moves something, and a pool
 * drag that survives its own first mousemove.
 *
 * Paul, 22 September 2026:
 *
 *   "With a Pool I have to click and press on the header region twice in a row
 *    to move it. The first time it very slightly starts to move, but it appears
 *    that the green alignment dots and green alignment line appear and stop
 *    any further movement of the pool."
 *
 *   "Click and press still does not produce a Grab cursor on elements. It is
 *    still an '+' cursor??"
 *
 *   "I'd like the grab cursor for labels as well."
 *
 * THE POOL. The green guide was a symptom, not the cause. The first mousemove
 * marks the pool as travelling so it can ride above what it crosses; the next
 * render took it OUT of the container pass and drew it only in the lifted
 * overlay. A different place in the tree, so React unmounted the
 * SymbolRenderer that owned the drag — and its unmount cleanup removed the
 * drag's listeners. The drag died after one tick; mouseup never reached it, so
 * move-end never fired and the lift and the guide stayed on. The second press
 * worked because the pool was already stuck in the overlay and nothing
 * remounted. Tasks never had the problem because ordinary elements were never
 * taken out of their pass. The overlay is now an event-free picture; the
 * instance holding the gesture stays put.
 *
 * THE CURSORS. Two faults, one each.
 *   • A selected element carried a ✛ crosshair — correct when a drag drew a
 *     connector, wrong since 77122bb3, when a drag started MOVING it.
 *   • Labels were `grab` inline. Inline cursor cannot reach `:active`, and it
 *     also outranked the body's "grabbing" that the label drag sets, because
 *     the element under the pointer wins over the body. So it never closed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POINTER_PROTOCOL } from "@/app/lib/canvas/pointerProtocol";

const src = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const CANVAS = src("app", "components", "canvas", "Canvas.tsx");
const SYMBOLS = src("app", "components", "canvas", "SymbolRenderer.tsx");
const CONNECTORS = src("app", "components", "canvas", "ConnectorRenderer.tsx");

describe("T4658 — a travelling container is never unmounted mid-drag", () => {
  it("stays in the container pass while it travels", () => {
    // The mount that holds the gesture must not move in the tree.
    const pass = CANVAS.slice(CANVAS.indexOf("renderContainerEl = (el: DiagramElement)"));
    const call = pass.slice(0, pass.indexOf(".map(renderContainerEl); })()}") + 40);
    expect(call, "the pass filters travelling containers out again").not.toMatch(/!isLifted\(el\.id\)/);
    expect(call).toMatch(/\.filter\(el => !inActiveGroup\(el\.id\)\)\s*\.map\(renderContainerEl\)/);
  });

  it("draws the travelling copy as a picture on top", () => {
    const at = CANVAS.indexOf('<g data-lifted-drag="true"');
    expect(at, "no lifted overlay").toBeGreaterThan(-1);
    expect(CANVAS.slice(at, at + 60)).toMatch(/pointerEvents="none"/);
  });

  it("would lose the drag on unmount — which is why that matters", () => {
    // The reason, pinned: the drag's listeners are torn down on unmount.
    // Keep this and the rule above together; either alone invites the bug.
    expect(SYMBOLS).toMatch(/useEffect\(\(\) => \(\) => \{ gestureCleanupRef\.current\?\.\(\);/);
  });
});

describe("T4659 — a selected element says 'move', not 'connect'", () => {
  it("carries the grab class on its overlay, not a crosshair", () => {
    const at = SYMBOLS.indexOf("✋ not ✛. Since 77122bb3 a drag on a selected shape MOVES it");
    expect(at, "the overlay's cursor note is gone").toBeGreaterThan(-1);
    const overlay = SYMBOLS.slice(at, at + 600);
    expect(overlay).toMatch(/className="dgx-grab"/);
    expect(overlay).not.toMatch(/cursor: "crosshair"/);
  });

  it("the Help card agrees", () => {
    const rows = POINTER_PROTOCOL.flatMap((s) => s.hover ?? []);
    expect(rows.find((r) => r.over === "A selected element")?.cursor).toBe("grab");
  });
});

describe("T4660 — labels grab and close", () => {
  it("an element's external label uses the class", () => {
    expect(SYMBOLS).toMatch(/className=\{onUpdateProperties \? "dgx-grab" : undefined\}/);
    expect(SYMBOLS, "an inline grab here can never close to grabbing")
      .not.toMatch(/cursor: onUpdateProperties \? "grab" : "default"/);
  });

  it("a connector's label uses the class", () => {
    expect(CONNECTORS).toMatch(/className=\{onUpdateLabel \? "dgx-grab" : undefined\}/);
    expect(CONNECTORS).not.toMatch(/style=\{\{ cursor: onUpdateLabel \? "grab" : "default" \}\}/);
  });

  it("the Help card lists labels", () => {
    const rows = POINTER_PROTOCOL.flatMap((s) => s.hover ?? []);
    expect(rows.find((r) => r.over === "A label")?.cursor).toBe("grab");
  });
});
