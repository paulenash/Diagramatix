/**
 * T4669 — no emoji cursor survives anywhere in the Canvas Help card's text.
 *
 * Paul, 22 September 2026: "2 occurrences of the grab cursor still in yellow in
 * the Canvas Help under What the Cursor is Telling You."
 *
 * The icon column had been redrawn, but the NOTES still carried ✊ as typed
 * text — "closes to ✊ while you hold it" — and an emoji is a yellow drawing of
 * a fist, not the white-and-black cursor. Two more hid in the Moving and
 * Connecting notes. Notes now name the cursor as a token, `{grabbing}`, and the
 * card draws the real cursor there, inline.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NoteWithCursors } from "@/app/components/canvas/CursorIcon";
import { POINTER_PROTOCOL, CURSOR_GLYPH } from "@/app/lib/canvas/pointerProtocol";

const GLYPHS = [...new Set(Object.values(CURSOR_GLYPH))];
const render = (text: string) => renderToStaticMarkup(createElement(NoteWithCursors, { text }));

/** Every piece of text the card shows. */
const allText = () => POINTER_PROTOCOL.flatMap((sec) => [
  sec.heading,
  ...(sec.hover ?? []).flatMap((r) => [r.over, r.note ?? ""]),
  ...(sec.gestures ?? []).flatMap((g) => [g.does, g.result, g.note ?? ""]),
]);

describe("T4669 — cursors in the card's text are drawn, not typed", () => {
  it("no cursor glyph appears in any heading, row or note", () => {
    for (const text of allText()) {
      for (const g of GLYPHS) {
        expect(text.includes(g), `"${text}" still types ${g}`).toBe(false);
      }
    }
  });

  it("the notes that talk about a cursor name it as a token", () => {
    const notes = allText().join("\n");
    expect(notes).toMatch(/closes to \{grabbing\} while you hold it/);
    expect(notes).toMatch(/drag to reposition it; closes to \{grabbing\}/);
    expect(notes).toMatch(/\{grabbing\} for the whole drag/);
    expect(notes).toMatch(/the cursor becomes \{crosshair\}/);
  });

  it("a token is drawn as the real cursor, inline", () => {
    const html = render("closes to {grabbing} while you hold it");
    expect(html).toMatch(/closes to <span[^>]*><svg /);
    expect(html).toMatch(/fill="#ffffff"/);
    expect(html).toContain("while you hold it");
    expect(html).not.toContain("{grabbing}");
    expect(html).not.toContain("✊");
  });

  it("text without a token is untouched, and an unknown token is left as written", () => {
    expect(render("plain words")).toBe("plain words");
    expect(render("see {nonsense} here")).toBe("see {nonsense} here");
  });

  it("the card renders every note through it", () => {
    const canvas = readFileSync(join(process.cwd(), "app", "components", "canvas", "Canvas.tsx"), "utf8");
    expect(canvas.match(/<NoteWithCursors text=\{row\.note\} \/>/g)).toHaveLength(2);   // hover + gesture notes
    expect(canvas).not.toMatch(/— \{row\.note\}<\/span>/);
  });
});
