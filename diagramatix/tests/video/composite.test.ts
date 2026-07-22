/**
 * Screencast webcam-inset geometry (pure) — app/lib/video/composite.ts.
 */
import { describe, it, expect } from "vitest";
import { insetRect, coverCrop } from "@/app/lib/video/composite";

describe("insetRect / coverCrop", () => {
  it("T0972 — pins the inset to the chosen corner with the given margin", () => {
    const m = 24;
    const br = insetRect(1920, 1080, "br", 0.2, m);
    // 0.2 * 1920 = 384 wide, 16:9 → 216 tall
    expect(br.w).toBe(384);
    expect(br.h).toBe(216);
    expect(br.x).toBe(1920 - 384 - m);
    expect(br.y).toBe(1080 - 216 - m);
    const tl = insetRect(1920, 1080, "tl", 0.2, m);
    expect(tl.x).toBe(m);
    expect(tl.y).toBe(m);
    const tr = insetRect(1920, 1080, "tr", 0.2, m);
    expect(tr.x).toBe(1920 - 384 - m);
    expect(tr.y).toBe(m);
  });

  it("T0973 — stays fully inside the frame (clamps scale + never exceeds bounds)", () => {
    // Absurd scale is clamped, and the inset still fits a small frame.
    const r = insetRect(320, 240, "br", 5, 10);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.x + r.w).toBeLessThanOrEqual(320);
    expect(r.y + r.h).toBeLessThanOrEqual(240);
  });

  it("T0974 — coverCrop crops the long axis to fill the destination without distortion", () => {
    // Source wider than dest → crop the sides (x offset > 0, full height).
    const wide = coverCrop(1280, 720, 100, 100);
    expect(wide.h).toBe(720);
    expect(wide.x).toBeGreaterThan(0);
    expect(Math.round(wide.w / wide.h)).toBe(1); // 1:1 dest → square crop
    // Source taller than dest → crop top/bottom (y offset > 0, full width).
    const tall = coverCrop(480, 640, 160, 90);
    expect(tall.w).toBe(480);
    expect(tall.y).toBeGreaterThan(0);
  });
});
