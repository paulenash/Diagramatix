/**
 * T4544-T4545 — the screen brightness slider.
 *
 * Paul, 2026-09-18: "Add a new Brightness slider next to the Zoom slider on the
 * right that controls the brightness of the whole Diagramatix browser screen.
 * The default should be as it currently is with the slider set showing 80%. The
 * user can then make it a bit brighter or lots darker."
 *
 * So 80 means "leave it exactly as it is" — the scale is pct/80 — and at 80 the
 * app must render no overlay at all, or the feature would cost every user a
 * full-screen composited layer for nothing.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRIGHTNESS_DEFAULT,
  BRIGHTNESS_MIN,
  BRIGHTNESS_MAX,
  brightnessFactor,
  brightnessFilter,
  clampBrightness,
  readBrightness,
} from "@/app/lib/ui/screenBrightness";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("T4544 — 80% is 'as it currently is'", () => {
  it("changes nothing at the default", () => {
    expect(BRIGHTNESS_DEFAULT).toBe(80);
    expect(brightnessFactor(BRIGHTNESS_DEFAULT)).toBe(1);
    expect(brightnessFilter(BRIGHTNESS_DEFAULT), "no overlay at all at the default").toBeNull();
  });

  it("goes a bit brighter and a long way darker", () => {
    expect(BRIGHTNESS_MAX).toBe(100);
    expect(BRIGHTNESS_MIN).toBe(20);
    expect(brightnessFactor(BRIGHTNESS_MAX), "a bit brighter").toBe(1.25);
    expect(brightnessFactor(BRIGHTNESS_MIN), "lots darker").toBe(0.25);
    expect(brightnessFactor(40)).toBe(0.5);
  });

  it("is monotonic — every step up is brighter", () => {
    for (let p = BRIGHTNESS_MIN; p < BRIGHTNESS_MAX; p++) {
      expect(brightnessFactor(p + 1)).toBeGreaterThan(brightnessFactor(p));
    }
  });

  it("emits a usable filter either side of the default", () => {
    expect(brightnessFilter(100)).toBe("brightness(1.25)");
    expect(brightnessFilter(20)).toBe("brightness(0.25)");
  });

  it("keeps the slider inside its range", () => {
    expect(clampBrightness(0)).toBe(BRIGHTNESS_MIN);
    expect(clampBrightness(999)).toBe(BRIGHTNESS_MAX);
    expect(clampBrightness(63.4)).toBe(63);
    expect(clampBrightness(NaN)).toBe(BRIGHTNESS_DEFAULT);
  });

  it("falls back to the default on anything unreadable in storage", () => {
    // localStorage can come back empty or junk (a private window, cleared site
    // data, a hand-edited value). None of those should black out the screen.
    expect(readBrightness(null)).toBe(BRIGHTNESS_DEFAULT);
    expect(readBrightness("")).toBe(BRIGHTNESS_DEFAULT);
    expect(readBrightness("dark")).toBe(BRIGHTNESS_DEFAULT);
    expect(readBrightness(undefined)).toBe(BRIGHTNESS_DEFAULT);
    expect(readBrightness("0"), "and a stored value out of range is clamped, not honoured").toBe(BRIGHTNESS_MIN);
    expect(readBrightness("45")).toBe(45);
  });
});

describe("T4545 — it dims the whole window, and nothing else moves", () => {
  const overlay = read("app", "components", "ScreenBrightness.tsx");

  it("is mounted at the app root, not inside the editor", () => {
    // "the whole Diagramatix browser screen" — nav, panels and dialogs too, so
    // the overlay has to live above everything in the root layout.
    const layout = read("app", "layout.tsx");
    expect(layout).toContain("<ScreenBrightness />");
  });

  it("tints with backdrop-filter rather than filtering an ancestor", () => {
    // A CSS filter on <html> or <body> makes that element the containing block
    // for every position:fixed descendant, which re-anchors modals and floating
    // toolbars to the document instead of the viewport.
    expect(overlay).toContain("backdropFilter");
    expect(overlay, "never filter an ancestor").not.toMatch(/document\.(documentElement|body)\.style\.filter/);
    expect(overlay).toContain('position: "fixed"');
    expect(overlay, "and it must never swallow a click").toContain('pointerEvents: "none"');
  });

  it("renders nothing at the default", () => {
    expect(overlay).toContain("if (!filter) return null;");
  });

  it("survives storage being unavailable", () => {
    // Accessing localStorage THROWS in some contexts, so an unguarded read
    // would take the whole app down rather than just lose the setting.
    const reads = overlay.match(/window\.localStorage\.(get|set)Item/g) ?? [];
    expect(reads.length, "the component both reads and writes storage").toBeGreaterThan(1);
    expect((overlay.match(/catch\s*\{/g) ?? []).length).toBeGreaterThanOrEqual(reads.length);
  });

  it("sits beside the zoom slider and leaves the zoom bar where it was", () => {
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    expect(canvas).toContain("Screen brightness");
    expect(canvas).toContain("setScreenBrightness(v)");
    // Both pills share the zoom bar's existing anchor, and brightness is the
    // first of the two, so adding it did not shift the zoom bar.
    const anchor = canvas.indexOf('right: "calc(0.5rem + 156px + 6px + 130px + 6px)"');
    const bright = canvas.indexOf('title="Screen brightness"');
    const zoomIn = canvas.indexOf('title="Zoom in"');
    expect(anchor).toBeGreaterThan(-1);
    expect(bright).toBeGreaterThan(anchor);
    expect(bright, "brightness comes first, so zoom keeps its position").toBeLessThan(zoomIn);
  });
});
