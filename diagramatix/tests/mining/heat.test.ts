/**
 * Phase 0.4 — a test floor under `heat.ts`.
 *
 * The heat map is the Insights view's flagship, and it works by returning a
 * COPY of the discovered diagram with fill colours set. Two things about it are
 * easy to break without noticing: the copy (mutating in place would silently
 * repaint the user's saved diagram), and the normalisation (a broken scale still
 * produces a colourful, plausible-looking picture).
 */
import { describe, it, expect } from "vitest";
import { applyHeat, heatColor, HEAT_METRICS } from "@/app/lib/mining/heat";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { LogMapping } from "@/app/lib/mining/types";

const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts" };
const HEADERS = ["case", "act", "ts"];

/** The blue channel of an "rgb(r,g,b)" string — the honest temperature probe. */
const blue = (c: string) => Number(c.slice(0, -1).split(",")[2]);

/** Two cases where "Slow" takes ten hours and "Quick" takes one. */
function analytics() {
  const rows: string[][] = [];
  for (const c of ["c1", "c2"]) {
    rows.push([c, "Quick", "2026-01-01T00:00:00Z"]);
    rows.push([c, "Slow", "2026-01-01T01:00:00Z"]);
    rows.push([c, "End", "2026-01-01T11:00:00Z"]);
  }
  return computeAnalytics(buildEventLog(HEADERS, rows, MAPPING));
}

const diagram = (labels: string[]): DiagramData => ({
  elements: labels.map((label, i) => ({
    id: `e${i}`, type: "task", label, x: 0, y: 0, width: 100, height: 60, properties: { note: "keep me" },
  })),
  connectors: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

describe("Phase 0.4 — heat is applied to a COPY", () => {
  it("T3705 - the diagram passed in is not touched", () => {
    // The Insights view renders the returned copy read-only. Mutating in place
    // would repaint the saved discovered diagram, and nothing would say so.
    const original = diagram(["Quick", "Slow", "End"]);
    const before = JSON.stringify(original);
    applyHeat(original, analytics(), "totalTime");
    expect(JSON.stringify(original)).toBe(before);
  });

  it("T3706 - existing element properties survive the repaint", () => {
    const out = applyHeat(diagram(["Quick", "Slow"]), analytics(), "totalTime");
    expect(out.elements[0].properties?.note).toBe("keep me");
    expect(out.elements[0].properties?.fillColor).toBeTruthy();
  });

  it("T3707 - an element whose label is not an activity is left alone entirely", () => {
    // A gateway or an annotation must not acquire a colour that says nothing.
    const out = applyHeat(diagram(["Quick", "Not an activity"]), analytics(), "totalTime");
    expect(out.elements[1].properties?.fillColor).toBeUndefined();
  });
});

describe("Phase 0.4 — the scale means something", () => {
  it("T3708 - the slowest step is hotter than the quickest", () => {
    // NOT probed via the red channel: the ramp runs pale blue → amber → red, so
    // red PEAKS at the amber midpoint (251) and comes back down at the hot end
    // (220). Blue is the channel that falls as things get hotter.
    const out = applyHeat(diagram(["Quick", "Slow"]), analytics(), "totalTime");
    const [quick, slow] = out.elements.map((e) => e.properties?.fillColor as string);
    expect(slow).toBe(heatColor(1));                 // the maximum sits on the hot stop
    expect(quick).not.toBe(heatColor(1));
    expect(blue(slow)).toBeLessThan(blue(quick));
  });

  it("T3709 - every metric is offered and each one colours something", () => {
    for (const m of HEAT_METRICS) {
      const out = applyHeat(diagram(["Quick", "Slow"]), analytics(), m.key);
      expect(out.elements.some((e) => e.properties?.fillColor)).toBe(true);
    }
  });

  it("T3710 - the gradient is clamped, hits its stops, and cools monotonically", () => {
    expect(heatColor(-5)).toBe(heatColor(0));
    expect(heatColor(5)).toBe(heatColor(1));
    expect(heatColor(0)).toBe("rgb(219,234,254)");     // pale blue
    expect(heatColor(0.5)).toBe("rgb(251,191,36)");    // amber
    expect(heatColor(1)).toBe("rgb(220,38,38)");       // red
    const blues = [0, 0.25, 0.5].map((t) => blue(heatColor(t)));
    for (let i = 1; i < blues.length; i++) expect(blues[i]).toBeLessThan(blues[i - 1]);
    expect(new Set([0, 0.25, 0.5, 0.75, 1].map(heatColor)).size).toBe(5);
  });

  it("T3711 - an unknown metric falls back rather than colouring everything the same", () => {
    const out = applyHeat(diagram(["Quick", "Slow"]), analytics(), "nonsense" as never);
    expect(out.elements[0].properties?.fillColor).toBeTruthy();
    expect(out.elements[0].properties?.fillColor).not.toBe(out.elements[1].properties?.fillColor);
  });
});
