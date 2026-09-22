/**
 * T4655–T4657 — the Canvas Help card, and a pool header that moves the pool.
 *
 * Paul, 22 September 2026, reviewing the written protocol:
 *
 *   "the cursor remains a hand. It would be good if it did grab and reliably
 *    then move the pool."  (DEFECT)
 *
 *   "Let's add a popup moveable window summary, like the Voice Assist Commands
 *    window, under 'Canvas Help' in the line at the bottom of the canvas, just
 *    before the percentage."
 *
 * THE UNRELIABILITY was one line. On an ALREADY-SELECTED container, a press on
 * the header deselected and returned, so the drag never began — and since
 * clicking the header is also how you select it, the second attempt and every
 * one after it did nothing. Deselecting is still there, but as a CLICK: the
 * toggle waits 4px to see whether the mouse moves, which is the threshold the
 * rest of the canvas already uses.
 *
 * THE CURSOR had to move from an inline style to the `.dgx-grab` class.
 * Inline `style={{ cursor }}` cannot reach the `:active` pseudo, so grab never
 * closed to grabbing on press — the G05 scheme exists precisely for this and
 * the header was not using it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POINTER_PROTOCOL, CURSOR_GLYPH, type CursorName } from "@/app/lib/canvas/pointerProtocol";

const src = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const SYMBOLS = src("app", "components", "canvas", "SymbolRenderer.tsx");
const CANVAS = src("app", "components", "canvas", "Canvas.tsx");

describe("T4655 — a header press takes hold of the container", () => {
  it("waits to see whether it is a click or a drag", () => {
    const at = SYMBOLS.indexOf("A HEADER PRESS IS A HANDLE, WHATEVER THE SELECTION STATE");
    expect(at, "the header-press rule is gone").toBeGreaterThan(-1);
    const body = SYMBOLS.slice(at, at + 2200);
    expect(body, "a drag past the threshold must move it").toMatch(/> 4\)[\s\S]{0,260}beginElementDrag\(e\)/);
    expect(body, "a click without moving must still deselect").toMatch(/onPreUp[\s\S]{0,300}onSelect\(\)/);
  });

  it("no longer deselects on the press itself", () => {
    // The defect, exactly: `if (selected) { onSelect(); return; }` on mousedown.
    expect(SYMBOLS).not.toMatch(/if \(selected\) \{ onSelect\(\); return; \}\s*\/\/ header re-click/);
  });

  it("cleans up if the element unmounts mid-gesture", () => {
    const at = SYMBOLS.indexOf("A HEADER PRESS IS A HANDLE, WHATEVER THE SELECTION STATE");
    expect(SYMBOLS.slice(at, at + 2200)).toMatch(/gestureCleanupRef\.current = \(\) =>/);
  });
});

describe("T4656 — the cursor can close to grabbing", () => {
  it("uses the class, so `:active` can reach it", () => {
    expect(SYMBOLS).toMatch(/fill=\{poolHeaderColour\}[\s\S]{0,120}className="dgx-grab"/);
  });

  it("the G05 scheme still defines both halves", () => {
    const css = src("app", "globals.css");
    expect(css).toMatch(/\.dgx-grab\s*\{\s*cursor:\s*grab;\s*\}/);
    expect(css).toMatch(/\.dgx-grab:active\s*\{\s*cursor:\s*grabbing;\s*\}/);
  });
});

describe("T4657 — the Canvas Help card", () => {
  it("sits in the status bar, immediately before the zoom readout", () => {
    // Anchor on the BUTTON, not the words: "Canvas Help" also appears in a
    // comment further up the file, and matching that passed happily while the
    // button itself had been renamed out from under it.
    const button = CANVAS.indexOf("onClick={() => setShowCanvasHelp((v) => !v)}");
    const zoom = CANVAS.indexOf("{Math.round(zoom * 100)}%");
    expect(button, "no Canvas Help button").toBeGreaterThan(-1);
    expect(zoom, "no zoom readout").toBeGreaterThan(-1);
    expect(button, "the button must come before the percentage").toBeLessThan(zoom);
    // …and it must be labelled, in the status bar, between the hints and the %.
    const bar = CANVAS.slice(CANVAS.indexOf("{/* Status bar */}"), zoom);
    expect(bar).toMatch(/>\s*Canvas Help\s*<\/button>/);
  });

  it("is the same draggable window the Voice Assist commands use", () => {
    const panel = src("app", "components", "canvas", "FloatingPanel.tsx");
    expect(panel).toMatch(/export function FloatingPanel/);
    expect(CANVAS).toMatch(/import \{ FloatingPanel \} from "\.\/FloatingPanel"/);
    expect(src("app", "components", "canvas", "VoiceAssistBar.tsx"))
      .toMatch(/import \{ FloatingPanel \} from "\.\/FloatingPanel"/);
    // …and defined once, not copied.
    expect(src("app", "components", "canvas", "VoiceAssistBar.tsx"))
      .not.toMatch(/function FloatingPanel\(\{ title/);
  });

  it("every row names a cursor that has a glyph", () => {
    const named: CursorName[] = [];
    for (const sec of POINTER_PROTOCOL) for (const row of sec.hover ?? []) named.push(row.cursor);
    expect(named.length).toBeGreaterThan(5);
    for (const c of named) expect(CURSOR_GLYPH[c], c).toBeTruthy();
  });

  it("describes only cursors the canvas actually sets", () => {
    // A card that promises a cursor nothing produces is worse than no card.
    const used = new Set<string>();
    for (const file of [SYMBOLS, CANVAS, src("app", "components", "canvas", "ConnectorRenderer.tsx")]) {
      for (const m of file.matchAll(/cursor: "([a-z-]+)"/g)) used.add(m[1]);
    }
    used.add("grab"); used.add("grabbing");            // via .dgx-grab / .dgx-pan
    for (const sec of POINTER_PROTOCOL) {
      for (const row of sec.hover ?? []) {
        expect(used.has(row.cursor), `${row.cursor} (for "${row.over}") is not set anywhere`).toBe(true);
      }
    }
  });

  it("has no empty sections", () => {
    for (const sec of POINTER_PROTOCOL) {
      expect((sec.hover?.length ?? 0) + (sec.gestures?.length ?? 0), sec.heading).toBeGreaterThan(0);
    }
  });
});
