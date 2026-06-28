/**
 * ArchiMate connector-type registry.
 *
 * Pins the per-type visual style for all 11 ArchiMate relationship types so a
 * connector can't silently render wrong or collide with another type. The known
 * concern (memory: ArchiMate connector review) was that some connectors are
 * wrong/incomplete — "influence" specifically. This registry asserts:
 *   • every one of the 11 types resolves to a DEFINED style (no fall-through),
 *   • no two types collapse to the SAME rendering (line dash + start/end marker),
 *   • "influence" is a dashed line + open arrowhead (and is distinct from the
 *     visually-similar "access", which is dotted).
 *
 * styleFor() is the pure lookup the renderer uses (ArchimateConnectorRenderer
 * imports it verbatim), so testing it here covers what actually paints.
 */
import { describe, it, expect } from "vitest";
import type { ArchimateConnectorType } from "@/app/lib/diagram/types";
import { styleFor, type ArchimateStyle } from "@/app/lib/diagram/archimateConnectorStyle";

// The canonical 11 relationship types, kept in lockstep with the union in
// types.ts. If a type is added/removed there, this list must change too — that
// is the point: it forces a deliberate registry update.
const ALL_TYPES: ArchimateConnectorType[] = [
  "archi-composition",
  "archi-aggregation",
  "archi-assignment",
  "archi-realisation",
  "archi-serving",
  "archi-access",
  "archi-influence",
  "archi-association",
  "archi-triggering",
  "archi-flow",
  "archi-specialisation",
];

/** A stable fingerprint of the *visual* identity of a connector style:
 *  line dash pattern + which marker sits at each end. Stroke colour/width are
 *  selection-state cosmetics, not the type's identity, so they're excluded. */
const visualKey = (s: ArchimateStyle) =>
  JSON.stringify({ dash: s.dash ?? null, start: s.startMarker, end: s.endMarker });

describe("ArchiMate connector registry", () => {
  it("has exactly 11 relationship types", () => {
    expect(ALL_TYPES.length).toBe(11);
    expect(new Set(ALL_TYPES).size).toBe(11);
  });

  it("every type resolves to a defined style (no fall-through to undefined)", () => {
    for (const t of ALL_TYPES) {
      const s = styleFor(t, false);
      expect(s, `styleFor(${t}) returned nothing`).toBeDefined();
      // A drawable line always has a stroke colour + width.
      expect(typeof s.strokeColor).toBe("string");
      expect(s.strokeWidth).toBeGreaterThan(0);
      // At least one decoration distinguishes most types; association is the
      // only marker-less one, so we only require the object be well-formed.
      expect(s.startMarker === null || typeof s.startMarker === "string").toBe(true);
      expect(s.endMarker === null || typeof s.endMarker === "string").toBe(true);
    }
  });

  it("no two types collapse to the same visual rendering", () => {
    const seen = new Map<string, ArchimateConnectorType>();
    const collisions: string[] = [];
    for (const t of ALL_TYPES) {
      const key = visualKey(styleFor(t, false));
      const prev = seen.get(key);
      if (prev) collisions.push(`${t} renders identically to ${prev} (${key})`);
      else seen.set(key, t);
    }
    expect(collisions, `\n  - ${collisions.join("\n  - ")}`).toEqual([]);
    expect(seen.size).toBe(ALL_TYPES.length);
  });

  it("influence is a dashed line + open arrowhead", () => {
    const s = styleFor("archi-influence", false);
    expect(s.endMarker).toBe("arrow-open");
    expect(s.startMarker).toBeNull();
    // Dashed (a gapped pattern), NOT solid.
    expect(s.dash, "influence must be a dashed line").toBeTruthy();
    expect(s.dash).toBe("6 3");
  });

  it("influence is visually distinct from access (dashed vs dotted)", () => {
    const inf = styleFor("archi-influence", false);
    const acc = styleFor("archi-access", false);
    // Both use an open arrowhead, so the line pattern is what separates them.
    expect(inf.endMarker).toBe(acc.endMarker);
    expect(inf.dash).not.toBe(acc.dash);
    expect(visualKey(inf)).not.toBe(visualKey(acc));
  });

  it("structural relationships carry their canonical diamonds/triangle", () => {
    expect(styleFor("archi-composition", false).endMarker).toBe("diamond-filled");
    expect(styleFor("archi-aggregation", false).endMarker).toBe("diamond-open");
    expect(styleFor("archi-realisation", false).endMarker).toBe("triangle-open");
    expect(styleFor("archi-specialisation", false).endMarker).toBe("triangle-open");
    // assignment has a ball at the source and a filled arrow at the target.
    const asg = styleFor("archi-assignment", false);
    expect(asg.startMarker).toBe("circle-filled");
    expect(asg.endMarker).toBe("arrow-filled");
    // association has no end decoration.
    expect(styleFor("archi-association", false).endMarker).toBeNull();
  });

  it("selection only changes cosmetics (colour/width), never the visual identity", () => {
    for (const t of ALL_TYPES) {
      const off = styleFor(t, false);
      const on = styleFor(t, true);
      expect(visualKey(on)).toBe(visualKey(off));
      // Selected is highlighted blue + thicker.
      expect(on.strokeColor).toBe("#2563eb");
      expect(on.strokeWidth).toBeGreaterThan(off.strokeWidth);
    }
  });
});
