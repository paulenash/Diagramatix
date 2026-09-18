/**
 * T4544-T4547 — the screen Brightness and Contrast controls.
 *
 * Paul, 2026-09-18: "…controls the brightness of the whole Diagramatix browser
 * screen. The default should be as it currently is with the slider set showing
 * 80%. The user can then make it a bit brighter or lots darker."
 * Paul, 2026-09-19: "Move the brightness control to the System menu Dashboard
 * Screen. Add a way to return to the default setting. Add a Contrast control
 * with similar features on the menu as well. Default setting at 50%."
 * Paul, 2026-09-19: "Does the brightness level persist? How does it survive
 * hard reload??" — which is what T4547 is about.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BRIGHTNESS_DEFAULT, BRIGHTNESS_MIN, BRIGHTNESS_MAX,
  CONTRAST_DEFAULT, CONTRAST_MIN, CONTRAST_MAX,
  BRIGHTNESS_KEY, CONTRAST_KEY,
  DISPLAY_DEFAULTS, DISPLAY_FILTER_VAR,
  brightnessFactor, contrastFactor, clampBrightness, clampContrast,
  displayFilter, isDisplayDefault, displayBootScript,
  readBrightness, readContrast,
} from "@/app/lib/ui/screenDisplay";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("T4544 — each default means 'leave the screen as it is'", () => {
  it("changes nothing at the defaults", () => {
    expect(BRIGHTNESS_DEFAULT).toBe(80);
    expect(CONTRAST_DEFAULT).toBe(50);
    expect(brightnessFactor(BRIGHTNESS_DEFAULT)).toBe(1);
    expect(contrastFactor(CONTRAST_DEFAULT)).toBe(1);
    expect(displayFilter(DISPLAY_DEFAULTS), "no overlay at all at the defaults").toBeNull();
    expect(isDisplayDefault(DISPLAY_DEFAULTS)).toBe(true);
    // Either slider off its default means "not default" — a reset that only
    // watched brightness would grey itself out with the contrast still altered.
    expect(isDisplayDefault({ brightness: 40, contrast: CONTRAST_DEFAULT })).toBe(false);
    expect(isDisplayDefault({ brightness: BRIGHTNESS_DEFAULT, contrast: 70 })).toBe(false);
  });

  it("brightness goes a bit brighter and a long way darker", () => {
    expect(brightnessFactor(BRIGHTNESS_MAX), "a bit brighter").toBe(1.25);
    expect(brightnessFactor(BRIGHTNESS_MIN), "lots darker").toBe(0.25);
  });

  it("contrast sits in the middle of its range, so it reads both ways", () => {
    expect((CONTRAST_MIN + CONTRAST_MAX) / 2).toBe(CONTRAST_DEFAULT);
    expect(contrastFactor(CONTRAST_MAX)).toBe(1.8);
    expect(contrastFactor(CONTRAST_MIN)).toBe(0.2);
  });

  it("is monotonic on both scales", () => {
    for (let p = BRIGHTNESS_MIN; p < BRIGHTNESS_MAX; p++) {
      expect(brightnessFactor(p + 1)).toBeGreaterThan(brightnessFactor(p));
    }
    for (let p = CONTRAST_MIN; p < CONTRAST_MAX; p++) {
      expect(contrastFactor(p + 1)).toBeGreaterThan(contrastFactor(p));
    }
  });

  it("names only the setting that has actually moved", () => {
    // A 1x no-op in the filter string would cost a composited layer for nothing.
    expect(displayFilter({ brightness: 100, contrast: CONTRAST_DEFAULT })).toBe("brightness(1.25)");
    expect(displayFilter({ brightness: BRIGHTNESS_DEFAULT, contrast: 90 })).toBe("contrast(1.8)");
    expect(displayFilter({ brightness: 20, contrast: 10 })).toBe("brightness(0.25) contrast(0.2)");
  });

  it("keeps both sliders inside their ranges", () => {
    expect(clampBrightness(0)).toBe(BRIGHTNESS_MIN);
    expect(clampBrightness(999)).toBe(BRIGHTNESS_MAX);
    expect(clampBrightness(63.4)).toBe(63);
    expect(clampBrightness(NaN)).toBe(BRIGHTNESS_DEFAULT);
    expect(clampContrast(0)).toBe(CONTRAST_MIN);
    expect(clampContrast(999)).toBe(CONTRAST_MAX);
    expect(clampContrast(NaN)).toBe(CONTRAST_DEFAULT);
  });

  it("falls back to the defaults on anything unreadable in storage", () => {
    // localStorage can come back empty or junk (a private window, cleared site
    // data, a hand-edited value). None of those should black out the screen.
    expect(readBrightness(null)).toBe(BRIGHTNESS_DEFAULT);
    expect(readBrightness("")).toBe(BRIGHTNESS_DEFAULT);
    expect(readBrightness("dark")).toBe(BRIGHTNESS_DEFAULT);
    expect(readBrightness("0"), "out of range is clamped, not honoured").toBe(BRIGHTNESS_MIN);
    expect(readBrightness("45")).toBe(45);
    expect(readContrast(null)).toBe(CONTRAST_DEFAULT);
    expect(readContrast("nonsense")).toBe(CONTRAST_DEFAULT);
    expect(readContrast("72")).toBe(72);
  });
});

describe("T4545 — it dims the whole window, and nothing else moves", () => {
  const overlay = read("app", "components", "ScreenBrightness.tsx");

  it("is mounted at the app root, not inside the editor", () => {
    // "the whole Diagramatix browser screen" — nav, panels and dialogs too, so
    // the overlay has to live above everything in the root layout.
    expect(read("app", "layout.tsx")).toContain("<ScreenBrightness />");
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

  it("filters nothing when the custom property is unset", () => {
    // The sheet is always in the markup (that is what lets the boot script
    // paint before hydration), so at the defaults it has to be inert.
    // BOTH the standard and the -webkit- property: hard-coding one and leaving
    // the other reading the variable looks fine to a single toContain.
    expect(overlay.split("var(${DISPLAY_FILTER_VAR}, none)").length - 1).toBe(2);
    expect(DISPLAY_FILTER_VAR).toBe("--dgx-display-filter");
  });

  it("survives storage being unavailable", () => {
    // Accessing localStorage THROWS in some contexts, so an unguarded read
    // would take the whole app down rather than just lose the setting.
    const reads = overlay.match(/window\.localStorage\.(get|set)Item/g) ?? [];
    expect(reads.length, "the component both reads and writes storage").toBeGreaterThan(1);
    expect((overlay.match(/catch\s*\{/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("T4546 — the controls live in System ▸ Display, with a way back", () => {
  const dash = read("app", "(dashboard)", "dashboard", "DashboardClient.tsx");

  it("is a System menu item on the dashboard", () => {
    // Matched on the title, not the label: the source spells its ellipsis
    // as an escape, which makes a label match easy to get subtly wrong.
    expect(dash).toContain(String.raw`title="Brightness and contrast for the whole Diagramatix screen."`);
    expect(dash).toContain("setShowDisplay(true)");
  });

  it("offers both sliders and a reset to the defaults", () => {
    expect(dash).toContain("Reset to default");
    expect(dash).toContain("apply(DISPLAY_DEFAULTS)");
    expect(dash).toContain('row("Brightness"');
    expect(dash).toContain('row("Contrast"');
  });

  it("greys the reset out when there is nothing to reset", () => {
    expect(dash).toContain("const atDefault = isDisplayDefault(displayDraft)");
    expect(dash).toContain("disabled={atDefault}");
  });

  it("no longer sits on the canvas toolbar", () => {
    // Paul: "Move the brightness control to the System menu Dashboard Screen."
    // Moved, not copied — two places to set one thing is how they drift.
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    expect(canvas).not.toMatch(/brightness/i);
    expect(canvas, "and the zoom bar is back to being the only pill there")
      .toContain('right: "calc(0.5rem + 156px + 6px + 130px + 6px)"');
  });
});

describe("T4547 — a stored setting is in force at the first paint of a reload", () => {
  // Paul asked how it survives a hard reload. localStorage does survive one,
  // but React cannot read it until after hydration — so without a blocking
  // boot script a user sitting at 20% gets a full-brightness flash on every
  // load, which is the exact thing they turned the brightness down to avoid.
  const runBoot = (stored: Record<string, string>) => {
    let painted: string | null = null;
    const localStorage = { getItem: (k: string) => (k in stored ? stored[k] : null) };
    const document = {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) => {
            expect(name).toBe(DISPLAY_FILTER_VAR);
            painted = value;
          },
        },
      },
    };
    new Function("localStorage", "document", displayBootScript())(localStorage, document);
    return painted;
  };

  it("is shipped in the document head", () => {
    const layout = read("app", "layout.tsx");
    expect(layout).toContain("displayBootScript()");
    expect(layout, "in <head>, so it runs before the body paints").toMatch(/<head>[\s\S]*displayBootScript\(\)[\s\S]*<\/head>/);
    expect(layout, "and not deferred").not.toMatch(/<script[^>]*\b(defer|async)\b[^>]*displayBootScript/);
  });

  it("paints exactly what the runtime would", () => {
    // The boot script re-implements `pct / default` in plain ES5 because it
    // cannot import. This is the guard that the two never drift.
    for (const brightness of [BRIGHTNESS_MIN, 40, 63, BRIGHTNESS_DEFAULT, 95, BRIGHTNESS_MAX]) {
      for (const contrast of [CONTRAST_MIN, 33, CONTRAST_DEFAULT, 71, CONTRAST_MAX]) {
        const stored = { [BRIGHTNESS_KEY]: String(brightness), [CONTRAST_KEY]: String(contrast) };
        expect(runBoot(stored), `${brightness}/${contrast}`).toBe(displayFilter({ brightness, contrast }));
      }
    }
  });

  it("paints nothing on a fresh browser", () => {
    expect(runBoot({})).toBeNull();
  });

  it("paints nothing when both settings are at their default", () => {
    expect(runBoot({
      [BRIGHTNESS_KEY]: String(BRIGHTNESS_DEFAULT),
      [CONTRAST_KEY]: String(CONTRAST_DEFAULT),
    })).toBeNull();
  });

  it("ignores junk rather than blacking out the screen before anything can fix it", () => {
    expect(runBoot({ [BRIGHTNESS_KEY]: "dark", [CONTRAST_KEY]: "" })).toBeNull();
    expect(runBoot({ [BRIGHTNESS_KEY]: "-500" })).toBe(displayFilter({ brightness: BRIGHTNESS_MIN, contrast: CONTRAST_DEFAULT }));
  });

  it("cannot throw, whatever the browser does", () => {
    // A throw here runs before anything else on the page and would take the
    // whole app with it.
    const ok = { getItem: () => "20" };
    const boom = { getItem: () => { throw new Error("blocked site data"); } };
    const goodDoc = { documentElement: { style: { setProperty: () => {} } } };
    // Storage that throws on read...
    expect(() => new Function("localStorage", "document", displayBootScript())(boom, goodDoc)).not.toThrow();
    // ...and a document that throws when painted. Both need catching: this
    // script runs before anything else on the page, so a throw here is fatal.
    const badDoc = { documentElement: { style: { setProperty: () => { throw new Error("nope"); } } } };
    expect(() => new Function("localStorage", "document", displayBootScript())(ok, badDoc)).not.toThrow();
  });
});
