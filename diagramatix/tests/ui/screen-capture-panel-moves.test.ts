/**
 * T5261 — Image capture (Paul, 2026-10-06): "Make the capture popup moveable so that the mouse has access to the selection handles."
 * The panel (description box, Save / Cancel) sat over the bottom of the screen, so the crop box's lower handles were out of reach. It now
 * drags by its title strip, is kept inside the window, remembers where it was left, and double-click puts it back.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const src = readFileSync("app/components/ScreenCapture.tsx", "utf8");

describe("T5261 the capture panel can be moved", () => {
  it("its title strip is a drag handle, with a grip, a tooltip that says why, and a move cursor", () => {
    expect(src).toContain('data-testid="capture-toolbar-handle"');
    expect(src).toContain("onPointerDown={startToolbarDrag}");
    expect(src).toContain("out of the way of the selection handles");
    expect(src).toContain("cursor-move");
  });
  it("a drag keeps the whole panel inside the window, and listeners are removed on release", () => {
    expect(src).toContain("clamp(d.left + e.clientX - d.sx, 0, Math.max(0, W - d.w))");
    expect(src).toContain("clamp(d.top + e.clientY - d.sy, 0, Math.max(0, H - d.h))");
    expect(src).toContain('window.removeEventListener("pointermove", onToolbarMove)');
    expect(src).toContain('window.removeEventListener("pointerup", onToolbarUp)');
  });
  it("the position is remembered, re-clamped when drawn, and a double-click on the strip restores the default (bottom centre)", () => {
    expect(src).toContain('const TOOLBAR_POS_KEY = "diagramatix.capture.toolbarPos"');
    expect(src).toContain("localStorage.setItem(TOOLBAR_POS_KEY");
    expect(src).toContain("onDoubleClick={resetToolbarPos}");
    expect(src).toContain('${tbPos ? "" : "left-1/2 -translate-x-1/2 bottom-6"}');
    expect(src).toContain("clamp(tbPos.left, 0, Math.max(0, window.innerWidth - 120))");
  });
  it("it does not steal the crop box's own drag: the strip stops propagation, and only the strip (not the buttons or the description box) starts a drag", () => {
    const at = src.indexOf("const startToolbarDrag");
    expect(src.slice(at, at + 400)).toContain("e.preventDefault(); e.stopPropagation();");
    expect(src.match(/onPointerDown=\{startToolbarDrag\}/g)?.length).toBe(1);
  });
  it("the crop box and its eight handles are untouched", () => {
    expect(src).toContain("HANDLES.map((h) => (");
    expect(src).toContain('onPointerDown={(e) => startDrag(e, h.id)}');
  });
});
