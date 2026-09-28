/**
 * Region dividers of a composite state: the fractional (0–1) positions along
 * the split axis of each of the (regionCount − 1) dashed boundaries. Even
 * spacing when none are stored. Shared by the canvas (the shape, its drag
 * handles, the region-membership checks) and the phone viewer / partner PDF.
 *
 * Pure (moved out of SymbolRenderer, a client component, 2026-09-28).
 */
import type { DiagramElement } from "./types";

export function compositeRegions(el: DiagramElement): { count: number; orientation: "horizontal" | "vertical"; fracs: number[] } {
  const count = Math.max(1, Math.min(5, Math.round(Number(el.properties?.regionCount) || 1)));
  const orientation = (el.properties?.regionOrientation as string) === "vertical" ? "vertical" : "horizontal";
  const stored = el.properties?.regionDividers;
  const fracs = Array.isArray(stored) && stored.length === count - 1
    ? (stored as number[]).map((f) => Math.max(0.05, Math.min(0.95, Number(f))))
    : Array.from({ length: count - 1 }, (_, i) => (i + 1) / count);
  return { count, orientation, fracs };
}
