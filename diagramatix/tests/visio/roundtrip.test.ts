/**
 * Visio export → import round-trip (layer 5).
 *
 * The final layer: a diagram exported to .vsdx and re-imported via importVisioV3
 * must survive — same element type-histogram, same connector count, same labels,
 * and no data-loss warnings. Catches a regression on EITHER side (export drops a
 * shape / mistypes it, or import fails to reconstruct it) — the round-trip pins
 * them as a matched pair.
 *
 * (Empirically the round-trip is lossless for the matrix scenarios incl. the
 * implicit pool + lanes; this locks that in.)
 */
import { describe, it, expect } from "vitest";
import { roundTrip } from "./_helpers/vsdx";
import { SCENARIOS, build } from "./_helpers/scenarios";

type El = { type: string; label?: string };
const typeHist = (els: El[]) => {
  const m: Record<string, number> = {};
  for (const e of els) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};
const labels = (els: El[]) => els.map((e) => (e.label ?? "").trim()).filter(Boolean).sort();

describe("Visio export → import round-trip", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} — survives export → import`, async () => {
      const data = build(sc);
      const { data: back, warnings } = await roundTrip(data);

      // Same elements (count + per-type histogram) and same connector count.
      expect(back.elements.length).toBe(data.elements.length);
      expect(typeHist(back.elements as El[])).toEqual(typeHist(data.elements as El[]));
      expect(back.connectors.length).toBe(data.connectors.length);

      // Every label survives the round-trip.
      expect(labels(back.elements as El[])).toEqual(labels(data.elements as El[]));

      // No data-loss warnings (the only expected warning is the informational
      // "Element types imported: …" summary).
      const lossy = warnings.filter((w) => /skipped|dropped|missing|error|fail/i.test(w));
      expect(lossy, `\n  - ${lossy.join("\n  - ")}`).toEqual([]);
    });
  }
});
