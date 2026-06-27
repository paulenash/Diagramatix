/**
 * Visio export — BPMN structure matrix (layer 2).
 *
 * Runs a spread of representative BPMN structures through the real Visio export
 * and asserts the VSDX is structurally sound (every element → exactly one shape,
 * no dangling masters, no duplicate/replicated shapes). This is the regression
 * net to build BEFORE re-attempting Pool/Lane: a change that "replicates pools
 * onto tasks" — or drops/duplicates any shape for any structure — fails here
 * instead of reaching main.
 */
import { describe, it, expect } from "vitest";
import { exportToVsdx, findVsdxViolations } from "./_helpers/vsdx";
import { SCENARIOS, build } from "./_helpers/scenarios";

describe("Visio export — BPMN structure matrix", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} — exports a structurally valid VSDX`, async () => {
      const data = build(sc);
      const parsed = await exportToVsdx(data);
      const violations = findVsdxViolations(parsed, data);
      expect(violations, `\n  - ${violations.join("\n  - ")}`).toEqual([]);
    });
  }
});
