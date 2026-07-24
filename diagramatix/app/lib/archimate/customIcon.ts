/**
 * Custom-icon → element-type ASSIGNMENT model.
 *
 * A SuperAdmin can assign a library icon (ArchimateIconLibrary row) to an
 * ArchiMate element type, so it renders as that element's corner glyph. The
 * assignment map lives in AppSetting["archimate.icon.custom"] and is keyed by the
 * catalogue element `key` (not the shared iconType — same rationale as
 * iconLayout.ts, so two elements sharing a drawer can be assigned independently).
 *
 * Render surfaces fetch a denormalised bundle { assignments, iconsById } via
 * useArchimateCustomIcon() and call effectiveCustomIcon(); a null result means
 * "fall back to the built-in ICON_DRAWERS drawer".
 */

import type { IconPrimitive } from "./iconShapes";

export const ARCHIMATE_ICON_CUSTOM_KEY = "archimate.icon.custom";

/** elementKey → ArchimateIconLibrary id. */
export type CustomIconAssignments = Record<string, string>;

export interface CustomIconData {
  primitives: IconPrimitive[];
  /** Preferred corner-glyph box size (px) when assigned; null = category default. */
  defaultWidth?: number | null;
  defaultHeight?: number | null;
}
export type CustomIconsById = Record<string, CustomIconData>;

/** The custom icon to render for an element, or null to use the built-in drawer. */
export function effectiveCustomIcon(
  elementKey: string | undefined,
  assignments: CustomIconAssignments | undefined,
  iconsById: CustomIconsById | undefined,
): CustomIconData | null {
  if (!elementKey || !assignments || !iconsById) return null;
  const id = assignments[elementKey];
  if (!id) return null;
  return iconsById[id] ?? null;
}
