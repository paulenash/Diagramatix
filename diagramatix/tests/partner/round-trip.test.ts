/**
 * BPMN → SOP → (the API) → BPMN: the measurement.
 *
 * The reason this exists at all: "is a small model good enough here?" currently
 * gets answered by impression. Running the same fixed input against two models
 * and comparing a number is the only honest way to answer it, and a Diagramatix
 * SOP records the diagram it came from, so the source is ground truth.
 *
 * T3009 is the one that keeps the number worth having. A model that INVENTS a
 * plausible step must be caught inventing it, not quietly credited — a scorer
 * that only measures recall would rate a hallucinating model perfect.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { scoreRoundTrip, normaliseLabel } from "@/app/lib/partner/roundTrip";

/** A three-step, two-lane process. `steps` lets a test drop or add one. */
function build(steps: { name: string; lane: "l1" | "l2" }[]) {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Acme", poolType: "white-box" },
    { id: "l1", type: "lane", label: "AP Clerk", parentPool: "p" },
    { id: "l2", type: "lane", label: "Approver", parentPool: "p" },
    { id: "s", type: "start-event", label: "Invoice received", pool: "p", lane: "l1" },
  ];
  const conns: AiConnection[] = [];
  let prev = "s";
  steps.forEach((st, i) => {
    const id = `t${i}`;
    els.push({ id, type: "task", label: st.name, taskType: "user", pool: "p", lane: st.lane });
    conns.push({ sourceId: prev, targetId: id });
    prev = id;
  });
  els.push({ id: "e", type: "end-event", label: "Done", pool: "p", lane: "l2" });
  conns.push({ sourceId: prev, targetId: "e" });
  return layoutBpmnDiagram(els, conns);
}

const THREE = [
  { name: "Receive Invoice", lane: "l1" as const },
  { name: "Check Against Purchase Order", lane: "l1" as const },
  { name: "Approve Payment", lane: "l2" as const },
];

describe("scoreRoundTrip", () => {
  it("T3007 — an identical diagram scores 100 with nothing lost or invented", () => {
    const r = scoreRoundTrip(build(THREE), build(THREE));
    expect(r.matched).toHaveLength(3);
    expect(r.missing).toHaveLength(0);
    expect(r.invented).toHaveLength(0);
    expect(r.orderPreserved).toBe(true);
    expect(r.score).toBe(100);
  });

  it("T3008 — a dropped step is reported as MISSING, and the score falls", () => {
    const r = scoreRoundTrip(build(THREE), build([THREE[0], THREE[2]]));
    expect(r.missing.map((m) => m.name)).toEqual(["Check Against Purchase Order"]);
    expect(r.matched).toHaveLength(2);
    expect(r.score).toBeLessThan(100);
  });

  it("T3009 — an INVENTED step is counted as invented, not silently credited", () => {
    // A scorer that only measured recall would rate a hallucinating model
    // perfect. This is what stops the number flattering the thing it measures.
    const r = scoreRoundTrip(
      build(THREE),
      build([...THREE, { name: "Notify The Regulator", lane: "l2" as const }]),
    );
    expect(r.matched).toHaveLength(3);
    expect(r.invented.map((m) => m.name)).toEqual(["Notify The Regulator"]);
    expect(r.score).toBeLessThan(100);
  });

  it("T3010 — a step that comes back in the wrong lane is flagged", () => {
    const moved = THREE.map((s, i) => (i === 1 ? { ...s, lane: "l2" as const } : s));
    const r = scoreRoundTrip(build(THREE), build(moved));
    expect(r.movedLane.map((m) => m.name)).toEqual(["Check Against Purchase Order"]);
    expect(r.movedLane[0].from).toBe("AP Clerk");
    expect(r.movedLane[0].to).toBe("Approver");
  });

  it("T3011 — reordering the surviving steps is detected", () => {
    const reversed = [THREE[2], THREE[1], THREE[0]];
    const r = scoreRoundTrip(build(THREE), build(reversed));
    expect(r.matched).toHaveLength(3);
    expect(r.orderPreserved).toBe(false);
  });

  it("T3012 — matching folds away case, punctuation and the generator's line breaks", () => {
    // The generator hard-wraps names, so "Check Against\nPurchase Order" and
    // "check against the purchase order." are the same step.
    expect(normaliseLabel("Check Against\nPurchase Order"))
      .toBe(normaliseLabel("check against the purchase order."));
    const wrapped = THREE.map((s) => ({ ...s, name: s.name.replace(" ", "\n") }));
    const r = scoreRoundTrip(build(THREE), build(wrapped));
    expect(r.missing, "a hard-wrapped name is the same activity").toHaveLength(0);
  });

  it("T3013 — the caveat about label matching is not hidden", () => {
    // A renamed step scores as one lost and one invented. That is the
    // conservative direction, and a caller has to know it to read the number.
    const renamed = [THREE[0], { name: "Verify Invoice Against PO", lane: "l1" as const }, THREE[2]];
    const r = scoreRoundTrip(build(THREE), build(renamed));
    expect(r.missing).toHaveLength(1);
    expect(r.invented).toHaveLength(1);
    expect(r.summary).toMatch(/lost|invented/);
  });
});
