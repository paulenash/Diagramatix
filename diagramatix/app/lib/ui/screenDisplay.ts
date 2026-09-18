/**
 * Screen brightness and contrast — a viewer-side adjustment for the whole
 * Diagramatix window, set from System ▸ Display on the dashboard.
 *
 * Paul, 2026-09-18: "…controls the brightness of the whole Diagramatix browser
 * screen. The default should be as it currently is with the slider set showing
 * 80%. The user can then make it a bit brighter or lots darker."
 * Paul, 2026-09-19: "Move the brightness control to the System menu Dashboard
 * Screen. Add a way to return to the default setting. Add a Contrast control
 * with similar features on the menu as well. Default setting at 50%."
 *
 * Both sliders share one idea: the default position means "leave the screen
 * exactly as it is", so each scale is `pct / default`.
 *   • Brightness 80 → 1×. 100 is the bit brighter the range allows (1.25×) and
 *     20 is a long way down (0.25×) — the asymmetry Paul asked for.
 *   • Contrast 50 → 1×, centred in 10–90 so it reads either way (0.2×–1.8×).
 * At both defaults the app renders NO overlay at all, so the feature costs
 * nothing until somebody moves a slider.
 *
 * Why an overlay rather than a filter on <html> or <body>: a CSS filter on an
 * ancestor makes that element the containing block for every `position: fixed`
 * descendant, which quietly re-anchors modals and floating toolbars to the
 * document rather than the viewport. A fixed, pointer-events-none overlay
 * carrying `backdrop-filter` tints everything painted behind it and changes no
 * layout at all.
 *
 * Pure — the component reads these, and stores the settings per browser.
 */

export const BRIGHTNESS_MIN = 20;
export const BRIGHTNESS_MAX = 100;
/** The current appearance. The slider shows this on a fresh browser. */
export const BRIGHTNESS_DEFAULT = 80;

export const CONTRAST_MIN = 10;
export const CONTRAST_MAX = 90;
/** Paul's number, and the centre of its range so it reads both ways. */
export const CONTRAST_DEFAULT = 50;

/** Per-browser, like the other viewer conveniences. */
export const BRIGHTNESS_KEY = "dgx-screen-brightness";
export const CONTRAST_KEY = "dgx-screen-contrast";
/** The dialog lives on the dashboard; the overlay lives at the app root. */
export const DISPLAY_EVENT = "dgx-screen-display";

export interface ScreenDisplay {
  brightness: number;
  contrast: number;
}

export const DISPLAY_DEFAULTS: ScreenDisplay = {
  brightness: BRIGHTNESS_DEFAULT,
  contrast: CONTRAST_DEFAULT,
};

const clampTo = (min: number, max: number, fallback: number) => (pct: number): number => {
  if (!Number.isFinite(pct)) return fallback;
  return Math.max(min, Math.min(max, Math.round(pct)));
};

export const clampBrightness = clampTo(BRIGHTNESS_MIN, BRIGHTNESS_MAX, BRIGHTNESS_DEFAULT);
export const clampContrast = clampTo(CONTRAST_MIN, CONTRAST_MAX, CONTRAST_DEFAULT);

const factor = (pct: number, dflt: number) => Math.round((pct / dflt) * 1000) / 1000;

/** Multiplier for `brightness()`. 1 at the default, so nothing changes there. */
export function brightnessFactor(pct: number): number {
  return factor(clampBrightness(pct), BRIGHTNESS_DEFAULT);
}

/** Multiplier for `contrast()`. 1 at the default. */
export function contrastFactor(pct: number): number {
  return factor(clampContrast(pct), CONTRAST_DEFAULT);
}

/** True when both sliders sit where they started. */
export function isDisplayDefault(d: ScreenDisplay): boolean {
  return brightnessFactor(d.brightness) === 1 && contrastFactor(d.contrast) === 1;
}

/**
 * The `backdrop-filter` value, or null when both settings are at their default
 * and the overlay should not be rendered at all. A setting that IS at its
 * default is left out of the filter rather than written as a 1× no-op.
 */
export function displayFilter(d: ScreenDisplay): string | null {
  const b = brightnessFactor(d.brightness);
  const c = contrastFactor(d.contrast);
  const parts: string[] = [];
  if (b !== 1) parts.push(`brightness(${b})`);
  if (c !== 1) parts.push(`contrast(${c})`);
  return parts.length === 0 ? null : parts.join(" ");
}

/** Parse a stored value, falling back to the default on anything unusable. */
function readPct(raw: string | null | undefined, clamp: (n: number) => number, dflt: number): number {
  if (raw === null || raw === undefined || raw.trim() === "") return dflt;
  // `clamp` already answers NaN with the default, so junk needs no second check.
  return clamp(Number(raw));
}

export function readBrightness(raw: string | null | undefined): number {
  return readPct(raw, clampBrightness, BRIGHTNESS_DEFAULT);
}

export function readContrast(raw: string | null | undefined): number {
  return readPct(raw, clampContrast, CONTRAST_DEFAULT);
}

/** The CSS custom property the overlay's `backdrop-filter` reads. */
export const DISPLAY_FILTER_VAR = "--dgx-display-filter";

/**
 * A blocking script for <head>, so a stored setting is in force at the FIRST
 * paint of a hard reload.
 *
 * Without it the overlay is a React component reading localStorage in an
 * effect, which cannot run until after hydration — so a user sitting at 20%
 * brightness gets a full-strength white flash on every page load, which is
 * exactly the thing they turned the brightness down to avoid.
 *
 * The constants are interpolated from the values above rather than retyped, so
 * the two implementations of `pct / default` cannot drift; `tests/ui` runs this
 * script against `displayFilter` to prove they agree.
 */
export function displayBootScript(): string {
  return [
    "(function(){try{",
    "var g=function(k,d,lo,hi){try{var v=Number(localStorage.getItem(k));",
    "return isFinite(v)&&v!==0?Math.max(lo,Math.min(hi,Math.round(v))):d}catch(e){return d}};",
    `var b=g(${JSON.stringify(BRIGHTNESS_KEY)},${BRIGHTNESS_DEFAULT},${BRIGHTNESS_MIN},${BRIGHTNESS_MAX});`,
    `var c=g(${JSON.stringify(CONTRAST_KEY)},${CONTRAST_DEFAULT},${CONTRAST_MIN},${CONTRAST_MAX});`,
    `var r=function(n){return Math.round(n*1000)/1000};`,
    `var p=[];var bf=r(b/${BRIGHTNESS_DEFAULT});var cf=r(c/${CONTRAST_DEFAULT});`,
    "if(bf!==1)p.push('brightness('+bf+')');if(cf!==1)p.push('contrast('+cf+')');",
    `if(p.length)document.documentElement.style.setProperty(${JSON.stringify(DISPLAY_FILTER_VAR)},p.join(' '));`,
    "}catch(e){}})();",
  ].join("");
}
