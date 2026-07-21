/**
 * Feature-tile contrast guarantee. `readableTextOn` keeps a palette's chosen text
 * when it's legible, but rescues an unreadable combination (e.g. dark text on a
 * dark customised background) so admin tiles can never render dark-on-dark.
 */
import { describe, it, expect } from "vitest";
import { readableTextOn, contrastRatio, DEFAULT_FEATURE_COLORS } from "@/app/lib/theme/featureColors";

describe("readableTextOn — tile contrast guarantee", () => {
  it("T0957 — the default palette keeps its configured text (already legible)", () => {
    for (const { bg, text } of Object.values(DEFAULT_FEATURE_COLORS)) {
      expect(readableTextOn(bg, text)).toBe(text); // unchanged for a sane palette
      expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("T0958 — dark text on a dark customised bg is rescued to a light colour", () => {
    // e.g. someone sets Risk & Control to near-black bg but leaves dark-blue text.
    const out = readableTextOn("#0b1220", "#075985");
    expect(out).not.toBe("#075985");
    expect(contrastRatio(out, "#0b1220")).toBeGreaterThanOrEqual(4.5); // now readable
  });

  it("T0959 — light text on a light bg is rescued to a dark colour", () => {
    const out = readableTextOn("#eef2ff", "#f5f3ff");
    expect(out).not.toBe("#f5f3ff");
    expect(contrastRatio(out, "#eef2ff")).toBeGreaterThanOrEqual(4.5);
  });
});
