import { describe, it, expect } from "vitest";
import { effectiveCustomIcon, type CustomIconsById } from "@/app/lib/archimate/customIcon";
import { defaultIconLayout, effectiveIconLayout } from "@/app/lib/archimate/iconLayout";
import type { IconPrimitive } from "@/app/lib/archimate/iconShapes";

const prims: IconPrimitive[] = [{ type: "circle", cx: 50, cy: 50, r: 10, z: 0, strokeWidth: 6, filled: false }];
const iconsById: CustomIconsById = { id1: { primitives: prims, defaultWidth: 50, defaultHeight: 50 } };

describe("Custom icon assignment", () => {
  // T1008 — resolver returns the assigned icon or null (fallback to built-in).
  it("T1008: effectiveCustomIcon returns primitives when mapped, else null", () => {
    expect(effectiveCustomIcon("business-object", { "business-object": "id1" }, iconsById)?.primitives).toBe(prims);
    expect(effectiveCustomIcon("business-object", {}, iconsById)).toBeNull();               // unassigned
    expect(effectiveCustomIcon("business-object", { "business-object": "missing" }, iconsById)).toBeNull(); // dangling
  });

  // T1009 — assignments are per element key, not shared by iconType.
  it("T1009: assignment is per element key", () => {
    const a = { "business-collaboration": "id1" };
    expect(effectiveCustomIcon("business-collaboration", a, iconsById)?.primitives).toBe(prims);
    expect(effectiveCustomIcon("technology-collaboration", a, iconsById)).toBeNull();
  });

  // T1011 — baseSize replaces the category default; per-element override wins.
  it("T1011: defaultIconLayout baseSize + precedence", () => {
    expect(defaultIconLayout("business").width).toBe(27);
    const based = defaultIconLayout("business", { width: 50, height: 50 });
    expect(based.width).toBe(50);
    expect(based.xOffset).toBe(50 / 2 + 6);
    // baseSize beats category default when there's no per-element override
    expect(effectiveIconLayout("k", "business", {}, { width: 50, height: 50 }).width).toBe(50);
    // per-element override beats baseSize
    expect(effectiveIconLayout("k", "business", { k: { width: 99 } }, { width: 50, height: 50 }).width).toBe(99);
  });
});
