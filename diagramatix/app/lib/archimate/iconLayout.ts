/**
 * Per-icon layout overrides for ArchiMate element corner glyphs.
 *
 * Each element's corner icon has a default position (offset from the element's
 * TOP-RIGHT corner to the glyph centre) and a default size (width × height).
 * A SuperAdmin can override any of these per iconType in ArchiMate Icon
 * Maintenance; the overrides live in AppSetting["archimate.icon.layout"] and are
 * applied by ArchimateShape.tsx. Absent values fall back to the computed default.
 */

export const ARCHIMATE_ICON_LAYOUT_KEY = "archimate.icon.layout";

/** Categories whose (compact) glyphs render at the larger default box. */
export const LARGE_GLYPH_CATEGORIES = new Set([
  "motivation", "technology", "implementation-migration", "composite",
]);

export interface IconLayout {
  /** Horizontal distance from the element's RIGHT edge to the glyph centre. */
  xOffset: number;
  /** Vertical distance from the element's TOP edge to the glyph centre. */
  yOffset: number;
  /** Glyph box width. */
  width: number;
  /** Glyph box height. */
  height: number;
}

/** Sparse per-element-key overrides (any subset of IconLayout fields).
 *  Keyed by the catalogue element `key` (unique), NOT the shared iconType, so two
 *  elements that reuse the same drawer (e.g. Business vs Technology Collaboration,
 *  which have different default sizes) can be positioned independently. */
export type IconLayoutOverrides = Record<string, Partial<IconLayout>>;

/** The built-in default layout for an icon, from its category. Mirrors the
 *  geometry ArchimateShape used before overrides existed (category size + the
 *  10px top-right nudge for compact categories + the Technology 2px-left tweak). */
export function defaultIconLayout(category: string | undefined): IconLayout {
  const large = !!category && LARGE_GLYPH_CATEGORIES.has(category);
  const size = large ? 36 : 27;
  const nudge = large ? 10 : 0;
  const xTweak = category === "technology" ? -2 : 0;
  return {
    xOffset: size / 2 + 6 - nudge - xTweak,
    yOffset: size / 2 + 6 - nudge,
    width: size,
    height: size,
  };
}

/** The effective layout for an icon = its default, overlaid with any override.
 *  Keyed by the catalogue element `key`. */
export function effectiveIconLayout(
  shapeKey: string | undefined,
  category: string | undefined,
  overrides: IconLayoutOverrides | undefined,
): IconLayout {
  const d = defaultIconLayout(category);
  const o = (shapeKey && overrides?.[shapeKey]) || {};
  return {
    xOffset: o.xOffset ?? d.xOffset,
    yOffset: o.yOffset ?? d.yOffset,
    width: o.width ?? d.width,
    height: o.height ?? d.height,
  };
}
