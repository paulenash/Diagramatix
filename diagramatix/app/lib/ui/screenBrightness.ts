/**
 * Screen brightness — a viewer-side dimmer for the whole Diagramatix window.
 *
 * Paul, 2026-09-18: "Add a new Brightness slider next to the Zoom slider on the
 * right that controls the brightness of the whole Diagramatix browser screen.
 * The default should be as it currently is with the slider set showing 80%. The
 * user can then make it a bit brighter or lots darker."
 *
 * So 80 is "unchanged", which makes the scale `pct / 80`: 100 is the little bit
 * brighter the range allows (1.25×), and 20 is a long way down (0.25×). At the
 * default the app renders NO overlay at all, so the feature costs nothing until
 * somebody moves the slider.
 *
 * Why an overlay rather than a filter on <html> or <body>: a CSS filter on an
 * ancestor makes that element the containing block for every `position: fixed`
 * descendant, which quietly re-anchors modals and floating toolbars to the
 * document rather than the viewport. A fixed, pointer-events-none overlay
 * carrying `backdrop-filter` tints everything painted behind it and changes no
 * layout at all.
 *
 * Pure — the component reads these, and stores the setting per browser.
 */

export const BRIGHTNESS_MIN = 20;
export const BRIGHTNESS_MAX = 100;
/** The current appearance. The slider shows this on a fresh browser. */
export const BRIGHTNESS_DEFAULT = 80;

/** Per-browser, like the other viewer conveniences. */
export const BRIGHTNESS_KEY = "dgx-screen-brightness";
/** The slider lives on the canvas; the overlay lives at the app root. */
export const BRIGHTNESS_EVENT = "dgx-screen-brightness";

export function clampBrightness(pct: number): number {
  if (!Number.isFinite(pct)) return BRIGHTNESS_DEFAULT;
  return Math.max(BRIGHTNESS_MIN, Math.min(BRIGHTNESS_MAX, Math.round(pct)));
}

/** Multiplier for `brightness()`. 1 at the default, so nothing changes there. */
export function brightnessFactor(pct: number): number {
  return Math.round((clampBrightness(pct) / BRIGHTNESS_DEFAULT) * 1000) / 1000;
}

/**
 * The `backdrop-filter` value, or null when the setting is the default and the
 * overlay should not be rendered at all.
 */
export function brightnessFilter(pct: number): string | null {
  const factor = brightnessFactor(pct);
  return factor === 1 ? null : `brightness(${factor})`;
}

/** Parse a stored value, falling back to the default on anything unusable. */
export function readBrightness(raw: string | null | undefined): number {
  if (raw === null || raw === undefined || raw.trim() === "") return BRIGHTNESS_DEFAULT;
  // `clampBrightness` already answers NaN with the default, so junk needs no
  // second check here — one that could not change any outcome would only read
  // as though it were doing something.
  return clampBrightness(Number(raw));
}
