"use client";

import { useEffect, useState } from "react";
import {
  BRIGHTNESS_DEFAULT,
  BRIGHTNESS_EVENT,
  BRIGHTNESS_KEY,
  brightnessFilter,
  readBrightness,
} from "@/app/lib/ui/screenBrightness";

/**
 * The dimmer itself: one fixed, pointer-events-none sheet above everything,
 * tinting what is painted behind it. Mounted once at the app root so it covers
 * the whole window — nav, panels, dialogs and canvas alike — while the slider
 * that drives it sits down on the canvas toolbar.
 *
 * Nothing is rendered at the default setting, so this costs nothing until
 * somebody moves the slider.
 */
export function ScreenBrightness() {
  const [pct, setPct] = useState(BRIGHTNESS_DEFAULT);

  useEffect(() => {
    // localStorage can throw outright (private windows, blocked site data), so
    // every read and write is guarded and the default stands if it fails.
    try {
      setPct(readBrightness(window.localStorage.getItem(BRIGHTNESS_KEY)));
    } catch { /* keep the default */ }

    const onChange = (e: Event) => setPct(readBrightness(String((e as CustomEvent).detail)));
    // `storage` fires in the app's OTHER tabs, so a change follows the user
    // around their open diagrams rather than only the tab they set it in.
    const onStorage = (e: StorageEvent) => {
      if (e.key === BRIGHTNESS_KEY) setPct(readBrightness(e.newValue));
    };
    window.addEventListener(BRIGHTNESS_EVENT, onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(BRIGHTNESS_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const filter = brightnessFilter(pct);
  if (!filter) return null;
  return (
    <div
      aria-hidden
      data-screen-brightness
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 2147483000,
        backdropFilter: filter,
        WebkitBackdropFilter: filter,
      }}
    />
  );
}

/** Set the brightness: persist it, and tell the overlay in this tab. */
export function setScreenBrightness(pct: number): void {
  try {
    window.localStorage.setItem(BRIGHTNESS_KEY, String(pct));
  } catch { /* the setting just won't survive a reload */ }
  window.dispatchEvent(new CustomEvent(BRIGHTNESS_EVENT, { detail: pct }));
}
