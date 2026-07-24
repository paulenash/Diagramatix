import { describe, it, expect } from "vitest";
import {
  defaultIconLayout,
  effectiveIconLayout,
  LARGE_GLYPH_CATEGORIES,
  type IconLayoutOverrides,
} from "@/app/lib/archimate/iconLayout";

describe("ArchiMate icon layout (Icon Maintenance)", () => {
  // T0999 — default layout mirrors the historical ArchimateShape geometry:
  // small categories → 27px box at (6+13.5) from the corner; large (compact)
  // categories → 36px box nudged 10px toward the corner.
  it("T0999: default layout matches the built-in per-category geometry", () => {
    const business = defaultIconLayout("business");
    expect(business).toEqual({ xOffset: 27 / 2 + 6, yOffset: 27 / 2 + 6, width: 27, height: 27 });

    const motivation = defaultIconLayout("motivation");
    // size 36, nudge 10 → offset = 18 + 6 - 10 = 14
    expect(motivation).toEqual({ xOffset: 14, yOffset: 14, width: 36, height: 36 });
  });

  // T1000 — Technology keeps its 2px-left tweak baked into the default xOffset.
  it("T1000: technology default nudges the glyph 2px further right (xTweak)", () => {
    const tech = defaultIconLayout("technology");
    const composite = defaultIconLayout("composite"); // large, no xTweak
    expect(tech.xOffset).toBe(composite.xOffset + 2);
    expect(LARGE_GLYPH_CATEGORIES.has("technology")).toBe(true);
  });

  // T1001 — an override overlays only the fields it sets; the rest fall back to
  // the category default. Keyed by element `key`, not iconType.
  it("T1001: effective layout overlays a partial override on the default", () => {
    const overrides: IconLayoutOverrides = { "business-object": { width: 40, xOffset: 20 } };
    const eff = effectiveIconLayout("business-object", "business", overrides);
    const def = defaultIconLayout("business");
    expect(eff.width).toBe(40);
    expect(eff.xOffset).toBe(20);
    expect(eff.height).toBe(def.height); // untouched → default
    expect(eff.yOffset).toBe(def.yOffset);
  });

  // T1002 — an override on one element key does not leak to another element that
  // happens to share the same drawer/iconType.
  it("T1002: overrides are per element key, not shared by iconType", () => {
    const overrides: IconLayoutOverrides = { "business-collaboration": { width: 50 } };
    expect(effectiveIconLayout("business-collaboration", "business", overrides).width).toBe(50);
    expect(effectiveIconLayout("technology-collaboration", "technology", overrides).width).toBe(
      defaultIconLayout("technology").width,
    );
  });
});
