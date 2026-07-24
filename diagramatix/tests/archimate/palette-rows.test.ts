import { describe, it, expect } from "vitest";
import { buildElementRows } from "@/app/lib/archimate/paletteRows";
import type { ArchimateShapeEntry } from "@/app/lib/archimate/catalogue";

const mk = (name: string, key: string, variant: "box" | "icon"): ArchimateShapeEntry => ({
  key, name, variant, category: "business", defaultWidth: 120, defaultHeight: 70, shapeFamily: "rectangle", iconType: "x",
});

describe("Symbols-panel element rows (Icon Library)", () => {
  const shapes = [mk("Business Actor", "a-box", "box"), mk("Business Actor", "a-icon", "icon"), mk("Business Object", "bo", "box")];

  // T1016 — one row per element (box preferred); a separate icon-only row appears
  // only for names in the configured set + that have an icon counterpart.
  it("T1016: buildElementRows = one row per element + configurable icon rows", () => {
    const none = buildElementRows(shapes, new Set());
    expect(none.map((r) => r.label)).toEqual(["Business Actor", "Business Object"]); // no icon rows
    expect(none[0].hasIconCounterpart).toBe(true);   // actor HAS an icon master
    expect(none[1].hasIconCounterpart).toBe(false);  // object does not

    const withActor = buildElementRows(shapes, new Set(["Business Actor"]));
    expect(withActor.map((r) => `${r.label}:${r.iconOnly}`)).toEqual([
      "Business Actor:false", "Business Actor (icon):true", "Business Object:false",
    ]);
    // the primary row keeps the box key; the icon row uses the icon key
    expect(withActor[0].entry.key).toBe("a-box");
    expect(withActor[1].entry.key).toBe("a-icon");
  });
});
