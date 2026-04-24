/**
 * ArchiMate category theme configuration.
 *
 * Each category (Business, Motivation, Strategy, Application, etc.) has a
 * default fill colour that matches the ArchiMate 3.1 convention. Users can
 * override these in Diagram Settings per diagram, and admins can change
 * the defaults globally in Admin → ArchiMate Themes.
 *
 * The renderer picks a shape's fill in this order of precedence:
 *   1. Element's own `properties.fill` (user-set on that specific shape)
 *   2. The diagram's theme override for that shape's category
 *   3. This file's default for the category
 *   4. The raw fill extracted from the Visio stencil (fallback)
 *
 * Defaults below are set for the five categories we're shipping in phase 1
 * (Business, Motivation, Strategy, Application, Composite). The remaining
 * categories are listed with `null` for you to fill in.
 */

export interface ArchimateCategoryTheme {
  id: string;
  name: string;
  /** Fill colour for the main shape body (hex, lowercase). */
  fill: string | null;
  /** Stroke colour (hex, lowercase). null → inherit global default. */
  stroke: string | null;
  /** Colour used for the element's icon overlay. */
  iconColour: string | null;
}

/** Default theme for each stencil category.
 *
 * Values set from the ArchiMate 3.1 convention:
 *   Business    — canary yellow
 *   Motivation  — mauve / lavender
 *   Strategy    — peach / apricot
 *   Application — cyan
 *   Technology  — mint green
 *   Physical    — lilac
 *   Implementation & Migration — pink
 *   Composite   — neutral grey (elements inherit from children)
 */
export const DEFAULT_ARCHIMATE_THEMES: ArchimateCategoryTheme[] = [
  // Filled in by us (phase 1 scope)
  { id: "business",    name: "Business",    fill: "#ffff00", stroke: "#b49b00", iconColour: "#6b5b00" },
  { id: "motivation",  name: "Motivation",  fill: "#e5d9ff", stroke: "#7a5db3", iconColour: "#4b2e89" },
  { id: "strategy",    name: "Strategy",    fill: "#f5deaa", stroke: "#b38037", iconColour: "#6b4a0e" },
  { id: "application", name: "Application", fill: "#b5ffff", stroke: "#2a7a91", iconColour: "#0b4d5e" },
  { id: "composite",   name: "Composite",   fill: "#eeeeee", stroke: "#888888", iconColour: "#444444" },
  // Placeholders — fill in when those categories are added
  { id: "technology",                name: "Technology",                fill: "#c5e0b4", stroke: "#4f7a3a", iconColour: "#2d4a1f" },
  { id: "physical",                  name: "Physical",                  fill: null, stroke: null, iconColour: null },
  { id: "implementation-migration",  name: "Implementation & Migration", fill: null, stroke: null, iconColour: null },
];

export function getThemeFor(categoryId: string, overrides?: Partial<Record<string, ArchimateCategoryTheme>>): ArchimateCategoryTheme | undefined {
  const override = overrides?.[categoryId];
  if (override) return override;
  return DEFAULT_ARCHIMATE_THEMES.find(t => t.id === categoryId);
}
