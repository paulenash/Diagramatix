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
  it("T3332 the Simulator announces itself as Diagramatix, and cascades BPMN", () => {
    const src = read("app/components/simulation/SimulatorIntro.tsx");
    expect(src).toContain("Entering the Diagramatix Simulator");
    expect(src).toContain(`glyphs="bpmn"`);
    // Twice the original 1,800ms, at the original rate: Paul tried half speed
    // and preferred the cascade quick and the show longer.
    expect(src).toContain("durationMs={3600}");
    expect(src, "back to the original rate").not.toContain("speedDivisor");
  });

  it("T3336 nothing anywhere still calls it DiagramMATRIX", () => {
    // It was in the TITLE of a screen customers see. A trademark is not a place
    // to be clever, so the check is over the whole tree rather than one file.
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(full); continue; }
        if (!/.(tsx?|md)$/.test(e.name)) continue;
        if (fs.readFileSync(full, "utf8").includes("DiagramMATRIX")) hits.push(full);
      }
    };
    walk(path.join(process.cwd(), "app"));
    expect(hits, hits.join(", ")).toEqual([]);
  });

  it("T3337 the Simulator title is the FEATURE icon and the product name", () => {
    // CHANGED 2026-09-10, at Paul's instruction. This previously pinned the
    // Diagramatix logo and a ™ on the name — put there when the console was
    // renamed off "DiagramMATRIX", so that a screen customers see carried the
    // real trademark rather than a film pun.
    //
    // The name is still the real one; what changed is the mark beside it. The
    // two consoles now head themselves identically — feature icon, then product
    // name — because the logo answered which PRODUCT you were in and left which
    // CONSOLE unanswered, which is the only question a header here needs to
    // settle. T3336 still guards the old name across the whole tree, and that
    // is the check that was actually protecting the trademark.
    //
    // The ™ is consequently absent from both headers. If it should come back it
    // belongs on both, not on one.
    const src = read("app/components/simulation/SimulatorConsole.tsx");
    expect(src).toContain("◈ Diagramatix Simulator");
    expect(src, "the logo is back beside the feature icon").not.toContain("/logos/diagramatix-icon.svg");
  });

  it("T3338 the console cascade is the same BPMN one as the entry", () => {
    // Katakana behind a process simulator was borrowed scenery.
    expect(read("app/components/simulation/SimulatorConsole.tsx")).toContain(`glyphs="bpmn"`);
  });

  it("T3339 a panel may shrink below its content, so fields cannot escape it", () => {
    // Paul, 2026-09-07: "Task fields overflow past the right hand boundary." A
    // grid child will not shrink below its content unless told it may, so the
    // columns ran out over the border.
    //
    // The PROPERTY — fields stay inside the panel — is unchanged. The MECHANISM
    // has moved: this used to require `overflow-x-auto`, i.e. scroll inside the
    // panel. Paul, 2026-09-11: "the horizontal scroll... should be removed",
    // because the console was capped narrower than the table's own minimum and
    // the scrollbar was therefore permanent rather than a fallback. The panel
    // now FITS (T4228 does that arithmetic) and clips as a last resort instead.
    // So the overflow-x assertion is superseded, not dropped.
    expect(read("app/components/simulation/matrix/MatrixChrome.tsx")).toContain("min-w-0");
    const panel = read("app/components/simulation/SimDataPanel.tsx");
    expect(panel, "a section must still be unable to push past the panel border").toContain("overflow-hidden");
    expect(panel, "the panel no longer sizes itself to its widest section").not.toContain("w-max min-w-full");
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
