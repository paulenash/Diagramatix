import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { drawGlyph } from "@/app/components/simulation/matrix/glyphs";

/**
 * The cascade's glyphs.
 *
 * Paul, 2026-09-07: the Simulator's rain becomes "a cascade of small green BPMN
 * symbols", the Miner's "small brown jagged rocks (50%) small brown BPMN symbols
 * (50%)".
 *
 * A canvas drawing cannot be asserted by looking at it, so what is pinned is
 * what the code CALLS: a katakana glyph is one fillText and nothing else, a BPMN
 * glyph strokes paths and never fills text, and the mix really is a mix rather
 * than one or the other. That is enough to catch the ways this goes wrong —
 * silently falling back to characters, or drawing nothing at all.
 */

/** A canvas context that records which drawing calls were made. */
function recordingCtx() {
  const calls: string[] = [];
  const rec = (name: string) => (...args: unknown[]) => { calls.push(name); void args; };
  return {
    calls,
    ctx: {
      fillStyle: "", strokeStyle: "", lineWidth: 0, font: "", textBaseline: "",
      fillText: rec("fillText"),
      beginPath: rec("beginPath"), closePath: rec("closePath"),
      moveTo: rec("moveTo"), lineTo: rec("lineTo"), arc: rec("arc"), arcTo: rec("arcTo"),
      rect: rec("rect"), fill: rec("fill"), stroke: rec("stroke"),
      fillRect: rec("fillRect"),
    } as unknown as CanvasRenderingContext2D,
  };
}

describe("what falls in the cascade", () => {
  it("T3328 katakana draws a character, and nothing but", () => {
    const { ctx, calls } = recordingCtx();
    drawGlyph(ctx, "katakana", 0, 0, 16, "#22FF22");
    expect(calls).toEqual(["fillText"]);
  });

  it("T3329 a BPMN glyph draws SHAPES, never a character", () => {
    // The failure this guards against is a quiet fallback to text: ◇ and ○ at
    // 16px read as punctuation, which is why the shapes are drawn rather than
    // typed in the first place.
    for (let i = 0; i < 60; i++) {
      const { ctx, calls } = recordingCtx();
      drawGlyph(ctx, "bpmn", 0, 0, 22, "#22FF22");
      expect(calls).not.toContain("fillText");
      expect(calls).toContain("stroke");
      expect(calls.length).toBeGreaterThan(1);
    }
  });

  it("T3330 the Miner's mix really is half rocks and half BPMN", () => {
    // A rock is FILLED and a BPMN symbol is STROKED, so the two are told apart
    // by which they call. 500 draws puts the sampling error far below the
    // margin, and a mix that had quietly become all-one-thing would fail.
    let rocks = 0, bpmn = 0;
    for (let i = 0; i < 500; i++) {
      const { ctx, calls } = recordingCtx();
      drawGlyph(ctx, "rocks-and-bpmn", 0, 0, 22, "#B45309");
      if (calls.includes("fill") && !calls.includes("stroke")) rocks++;
      else if (calls.includes("stroke")) bpmn++;
    }
    expect(rocks + bpmn).toBe(500);
    expect(rocks).toBeGreaterThan(150);
    expect(bpmn).toBeGreaterThan(150);
  });

  it("T3331 every glyph takes the colour it is handed", () => {
    // One cascade, two skins: green for the Simulator, brown for the Miner. A
    // glyph that set its own colour would break that.
    for (const set of ["katakana", "bpmn", "rocks-and-bpmn"] as const) {
      const { ctx } = recordingCtx();
      drawGlyph(ctx, set, 0, 0, 22, "#B45309");
      expect(ctx.fillStyle, set).toBe("#B45309");
      expect(ctx.strokeStyle, set).toBe("#B45309");
    }
  });
});

/**
 * The two screens that use it, and the keystroke that replaced a button.
 *
 * Read from the source rather than rendered: these are presentation choices with
 * no behaviour to exercise, and the thing worth catching is someone changing one
 * of them back without noticing what it was for.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("the Simulator and Miner entries", () => {
  it("T3332 the Simulator announces itself as Diagramatix, and cascades BPMN at half rate", () => {
    const src = read("app/components/simulation/SimulatorIntro.tsx");
    expect(src).toContain("Entering the Diagramatix Simulator");
    expect(src, "the old DiagramMATRIX wording is gone").not.toContain("DiagramMATRIX");
    expect(src).toContain(`glyphs="bpmn"`);
    // 8 frames between redraws is half the original 4 — bigger is slower.
    expect(src).toContain("speedDivisor={8}");
  });

  it("T3333 the Miner cascades brown rocks and BPMN", () => {
    const src = read("app/components/mining/DiagramatixMinerIntro.tsx");
    expect(src).toContain(`glyphs="rocks-and-bpmn"`);
    expect(src).toMatch(/color="#B45309"/);
  });

  it("T3334 the screensaver has no button, and its key is Ctrl+ALT+M", () => {
    // Ctrl+Shift+M is the profile switcher in Chrome and Edge and Responsive
    // Design Mode in Firefox — the browser takes it before the page sees it, so
    // the shortcut would simply appear not to work. Ctrl+Alt+M is unclaimed.
    const src = read("app/components/MatrixToggle.tsx");
    expect(src).toContain("e.altKey");
    expect(src, "shift would collide with the browser").toContain("e.shiftKey || e.metaKey) return");
    expect(src, "the draggable M button is gone").not.toContain("aria-label=\"Toggle Matrix screensaver\"");
    expect(src, "SuperAdmin only").toContain("superAdmin");
  });

  it("T3335 the camera and video buttons take the space the M button left", () => {
    expect(read("app/components/ScreenCapture.tsx")).toContain(`{ left: 16, bottom: 16 }`);
    expect(read("app/components/screencast/ScreencastStudio.tsx")).toContain(`{ left: 64, bottom: 16 }`);
  });
});
