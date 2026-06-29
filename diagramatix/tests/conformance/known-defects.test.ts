/**
 * Known router/layout defects — deterministic repro fixtures captured from real
 * AI generations (via the conformance harness, scripts/ai-conformance-report.ts).
 * These are NOT yet fixed; the tests RATCHET the current issue count so it can't
 * get WORSE, and will be tightened to 0 (assert clean) when each cause is fixed.
 *
 *   Cause A — layout coincidence: the layout stacks rework-loop control nodes on
 *     the same cell, so connectors cross coincident nodes (clinical-trial-intake).
 *   Cause B — router-detour gap: in a dense column, connectors cut through
 *     legitimately-placed neighbours instead of bowing around them (billing-claims).
 *
 * See [[project_ai_conformance_harness]] for the diagnosis (R6.25 merge-gateway
 * repositioning for Cause A; buildOrthogonalPath detour for Cause B).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { findConnectorConformance, summariseConformance } from "@/app/lib/diagram/checks/connectorConformance";
import causeA from "./fixtures/cause-a-clinical-trial.json";
import causeB from "./fixtures/cause-b-billing-claims.json";

type Plan = { elements: AiElement[]; connections: AiConnection[] };
const issues = (p: Plan) => findConnectorConformance(layoutBpmnDiagram(p.elements, p.connections));
const fnodes = (p: Plan) => issues(p).filter((i) => i.rule === "sequence-clips-foreign-node").length;

describe("known router/layout defects (ratchets — lower the bound to 0 when fixed)", () => {
  // FIX TARGET (Cause A): the layout gives rework-loop control gateways the same
  // (column,row) so they coincide; tighten to 0 once the placement is fixed.
  it("Cause A — clinical-trial-intake: loop-node coincidence crossings ≤ 4", () => {
    const p = causeA as Plan;
    expect(fnodes(p), JSON.stringify(summariseConformance(issues(p)))).toBeLessThanOrEqual(4);
  });

  // FIX TARGET (Cause B): the router routes through legitimately-placed
  // neighbours in a dense column instead of detouring; tighten to 0 when fixed.
  it("Cause B — billing-claims: dense-column crossings ≤ 5", () => {
    const p = causeB as Plan;
    expect(fnodes(p), JSON.stringify(summariseConformance(issues(p)))).toBeLessThanOrEqual(5);
  });
});
