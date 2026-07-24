import { describe, it, expect } from "vitest";
import { buildElementRows } from "@/app/lib/archimate/paletteRows";
import type { ArchimateShapeEntry } from "@/app/lib/archimate/catalogue";

const mk = (name: string, key: string, variant: "box" | "icon"): ArchimateShapeEntry => ({
  key, name, variant, category: "business", defaultWidth: 120, defaultHeight: 70, shapeFamily: "rectangle", iconType: "x",
});

describe("Symbols-panel element rows (Icon Library)", () => {
  const shapes = [mk("Business Actor", "a-box", "box"), mk("Business Actor", "a-icon", "icon"), mk("Node", "node-box", "box")];

  // T1016 — one row per element (box preferred); a separate icon-only row appears
  // for names in the configured set. Icon row uses the dedicated icon master if
  // present, else reuses the element's own key (so any element can be icon-only).
  it("T1016: buildElementRows = one row per element + configurable icon rows", () => {
    const none = buildElementRows(shapes, new Set());
    expect(none.map((r) => r.label)).toEqual(["Business Actor", "Node"]); // no icon rows

    const both = buildElementRows(shapes, new Set(["Business Actor", "Node"]));
    expect(both.map((r) => `${r.label}:${r.iconOnly}`)).toEqual([
      "Business Actor:false", "Business Actor (icon):true", "Node:false", "Node (icon):true",
    ]);
    expect(both[0].entry.key).toBe("a-box");    // primary = box
    expect(both[1].entry.key).toBe("a-icon");   // icon row uses the dedicated icon master
    expect(both[3].entry.key).toBe("node-box"); // no icon master → reuses the element's own key
  });
});
