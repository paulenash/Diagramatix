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

/** Optional base glyph-box size (px) — e.g. an assigned custom icon's preferred
 *  size — replacing the 27/36 category default. Null/undefined fields fall back. */
export interface IconBaseSize { width?: number | null; height?: number | null; }

/** The built-in default layout for an icon, from its category. Mirrors the
 *  geometry ArchimateShape used before overrides existed (category size + the
 *  10px top-right nudge for compact categories + the Technology 2px-left tweak).
 *  A `baseSize` (e.g. an assigned custom icon's preferred size) replaces the
 *  category default box; offsets recompute from it with the same formula so the
 *  glyph stays anchored near the top-right corner as it grows. */
export function defaultIconLayout(category: string | undefined, baseSize?: IconBaseSize): IconLayout {
  const large = !!category && LARGE_GLYPH_CATEGORIES.has(category);
  const size = large ? 36 : 27;
  const nudge = large ? 10 : 0;
  const xTweak = category === "technology" ? -2 : 0;
  const w = baseSize?.width != null && baseSize.width > 0 ? baseSize.width : size;
  const h = baseSize?.height != null && baseSize.height > 0 ? baseSize.height : size;
  return {
    xOffset: w / 2 + 6 - nudge - xTweak,
    yOffset: h / 2 + 6 - nudge,
    width: w,
    height: h,
  };
}

/** The effective layout for an icon = its default (optionally re-based to an
 *  assigned custom icon's preferred size), overlaid with any per-element
 *  override. Keyed by the catalogue element `key`. Precedence: per-element
 *  override > baseSize > category default. */
export function effectiveIconLayout(
  shapeKey: string | undefined,
  category: string | undefined,
  overrides: IconLayoutOverrides | undefined,
  baseSize?: IconBaseSize,
): IconLayout {
  const d = defaultIconLayout(category, baseSize);
  const o = (shapeKey && overrides?.[shapeKey]) || {};
  return {
    xOffset: o.xOffset ?? d.xOffset,
    yOffset: o.yOffset ?? d.yOffset,
    width: o.width ?? d.width,
    height: o.height ?? d.height,
  };
}
