"use client";

import { useEffect } from "react";
import {
  BRIGHTNESS_KEY,
  CONTRAST_KEY,
  DISPLAY_DEFAULTS,
  DISPLAY_EVENT,
  DISPLAY_FILTER_VAR,
  displayFilter,
  readBrightness,
  readContrast,
  type ScreenDisplay,
} from "@/app/lib/ui/screenDisplay";

/**
 * The dimmer: one fixed, pointer-events-none sheet above everything, tinting
 * what is painted behind it. Mounted once at the app root so it covers the
 * whole window — nav, panels, dialogs and canvas alike — while the sliders that
 * drive it live in System ▸ Display on the dashboard.
 *
 * The sheet is always in the markup and reads its filter from a CSS custom
 * property, which the blocking boot script in <head> sets before the first
 * paint. That is what makes the setting survive a hard reload without a flash
 * of full-brightness screen: React cannot read localStorage until after
 * hydration, which is far too late. This component only keeps the property in
 * step afterwards.
 *
 * Unset, the property falls back to `none`, so at the defaults the sheet is an
 * empty div that filters nothing.
 */
export function ScreenBrightness() {
  useEffect(() => {
    const paint = (d: ScreenDisplay) => {
      const filter = displayFilter(d);
      const root = document.documentElement.style;
      if (filter) root.setProperty(DISPLAY_FILTER_VAR, filter);
      else root.removeProperty(DISPLAY_FILTER_VAR);
    };
    // The boot script already painted what was stored; this re-syncs in case
    // storage changed between that script and hydration.
    paint(loadScreenDisplay());

    const onChange = (e: Event) => {
      const d = (e as CustomEvent).detail as Partial<ScreenDisplay> | undefined;
      paint({
        brightness: readBrightness(String(d?.brightness ?? "")),
        contrast: readContrast(String(d?.contrast ?? "")),
      });
    };
    // `storage` fires in the app's OTHER tabs, so a change follows the user
    // around their open diagrams rather than only the tab they set it in.
    const onStorage = (e: StorageEvent) => {
      if (e.key === BRIGHTNESS_KEY || e.key === CONTRAST_KEY) paint(loadScreenDisplay());
    };
    window.addEventListener(DISPLAY_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DISPLAY_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <div
      aria-hidden
      data-screen-display
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483000,
        backdropFilter: `var(${DISPLAY_FILTER_VAR}, none)`,
        WebkitBackdropFilter: `var(${DISPLAY_FILTER_VAR}, none)`,
      }}
    />
  );
}

/**
 * Read the stored settings. localStorage can throw outright (private windows,
 * blocked site data), so a failure means the defaults stand rather than the
 * screen going dark or the app falling over.
 */
export function loadScreenDisplay(): ScreenDisplay {
  try {
    return {
      brightness: readBrightness(window.localStorage.getItem(BRIGHTNESS_KEY)),
      contrast: readContrast(window.localStorage.getItem(CONTRAST_KEY)),
    };
  } catch {
    return DISPLAY_DEFAULTS;
  }
}

/** Apply the settings: persist them, and tell the overlay in this tab. */
export function setScreenDisplay(display: ScreenDisplay): void {
  try {
    window.localStorage.setItem(BRIGHTNESS_KEY, String(display.brightness));
    window.localStorage.setItem(CONTRAST_KEY, String(display.contrast));
  } catch { /* the settings just won't survive a reload */ }
  window.dispatchEvent(new CustomEvent(DISPLAY_EVENT, { detail: display }));
}
