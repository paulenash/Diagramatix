/**
 * Feature Colours registry helpers (app/lib/theme/featureColors.ts).
 * Pure functions shared by the admin editor, dashboard/admin tiles, and the
 * diagram editor's drift ring — so one source of truth for shade/merge/defaults.
 */
import { describe, it, expect } from "vitest";
import {
  shade, highlightOf, resolveFeatureScheme, tonesFor, featureVars,
  DEFAULT_FEATURE_COLORS, DEFAULT_HIGHLIGHT_PCT, FEATURE_KEYS,
} from "@/app/lib/theme/featureColors";

describe("feature colours helpers", () => {
  it("T0918 — shade darkens a hex by a percentage, clamped", () => {
    expect(shade("#ffffff", 0)).toBe("#ffffff");
    expect(shade("#ffffff", 100)).toBe("#000000");
    expect(shade("#808080", 50)).toBe("#404040");
    expect(shade("#ffffff", 8)).toBe("#ebebeb");   // 255*0.92 = 234.6 → 235 = 0xeb
    expect(shade("bad", 10)).toBe("bad");          // non-hex passes through
    expect(highlightOf("#3366cc", 10)).toBe(shade("#3366cc", 10));
  });

  it("T0919 — resolveFeatureScheme fills defaults, merges valid overrides, ignores junk", () => {
    // Empty → full defaults.
    const def = resolveFeatureScheme(undefined);
    expect(def.highlightPct).toBe(DEFAULT_HIGHLIGHT_PCT);
    expect(def.colors.ai).toEqual(DEFAULT_FEATURE_COLORS.ai);
    expect(Object.keys(def.colors).sort()).toEqual([...FEATURE_KEYS].sort());

    // Partial override: valid bg kept, invalid text falls back to default.
    const merged = resolveFeatureScheme({
      highlightPct: 15,
      colors: { ai: { bg: "#123456", text: "not-a-hex" }, bogusKey: { bg: "#000000" } },
    });
    expect(merged.highlightPct).toBe(15);
    expect(merged.colors.ai.bg).toBe("#123456");
    expect(merged.colors.ai.text).toBe(DEFAULT_FEATURE_COLORS.ai.text);
    expect((merged.colors as Record<string, unknown>).bogusKey).toBeUndefined();

    // highlightPct clamped to 0–40.
    expect(resolveFeatureScheme({ highlightPct: 999 }).highlightPct).toBe(40);
    expect(resolveFeatureScheme({ highlightPct: -5 }).highlightPct).toBe(0);
  });

  it("T0920 — tonesFor + featureVars expose bg/text/highlight", () => {
    const scheme = resolveFeatureScheme({ highlightPct: 10 });
    const t = tonesFor(scheme, "entityLists");
    expect(t.bg).toBe(DEFAULT_FEATURE_COLORS.entityLists.bg);
    expect(t.text).toBe(DEFAULT_FEATURE_COLORS.entityLists.text);
    expect(t.hi).toBe(shade(DEFAULT_FEATURE_COLORS.entityLists.bg, 10));
    const vars = featureVars(scheme, "entityLists");
    expect(vars["--fb"]).toBe(t.bg);
    expect(vars["--ft"]).toBe(t.text);
    expect(vars["--fh"]).toBe(t.hi);
  });
});
