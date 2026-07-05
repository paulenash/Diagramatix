/**
 * The ready-made Order-to-Cash GRC sample must be internally consistent so the
 * seed can't build a broken library: unique codes, every link references real
 * items, every kind present, and monitor signatures are well-formed.
 */
import { describe, it, expect } from "vitest";
import { O2C_SAMPLE, O2C_ATTACH } from "@/app/lib/riskControls/o2cSample";
import { RISK_CONTROL_KINDS } from "@/app/lib/riskControls/types";
import { validateRiskControlExamplePackage, summarizeRiskControlPackage, type RiskControlExamplePackage } from "@/app/lib/riskControls/examplePackage";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import { deviationSignature } from "@/app/lib/riskControls/controlEffectiveness";
import { STARTER_MINING_EXAMPLES } from "@/app/lib/mining/exampleSeeds";

const CONFORMANCE_RULES = new Set(["undocumented-transition", "unknown-state", "unexpected-entry", "unexpected-exit", "dead-transition"]);

describe("Order-to-Cash sample GRC library", () => {
  it("T0636 — is internally consistent (codes, links, kinds, monitor signatures)", () => {
    const items = O2C_SAMPLE.items;
    const codes = new Set(items.map((i) => i.code));

    // Unique codes.
    expect(codes.size).toBe(items.length);

    // Every kind is represented (a full traceability demo).
    for (const kind of RISK_CONTROL_KINDS) {
      expect(items.some((i) => i.kind === kind), `has a ${kind}`).toBe(true);
    }

    // Every link references two real, distinct items.
    for (const ln of O2C_SAMPLE.links) {
      expect(codes.has(ln.source), `link source ${ln.source} exists`).toBe(true);
      expect(codes.has(ln.target), `link target ${ln.target} exists`).toBe(true);
      expect(ln.source).not.toBe(ln.target);
    }

    // Every Control→Risk mitigation points at a real Risk; every Risk is mitigated.
    const byCode = new Map(items.map((i) => [i.code, i]));
    const mitigatedRisks = new Set(
      O2C_SAMPLE.links.filter((l) => byCode.get(l.source)?.kind === "Control" && byCode.get(l.target)?.kind === "Risk").map((l) => l.target),
    );
    for (const r of items.filter((i) => i.kind === "Risk")) {
      expect(mitigatedRisks.has(r.code), `${r.code} has a mitigating control`).toBe(true);
    }

    // The governance chain exists: at least one Policy→Control and Regulation→Policy.
    const hasEdge = (sk: string, tk: string) => O2C_SAMPLE.links.some((l) => byCode.get(l.source)?.kind === sk && byCode.get(l.target)?.kind === tk);
    expect(hasEdge("Policy", "Control")).toBe(true);
    expect(hasEdge("Regulation", "Policy")).toBe(true);
    expect(hasEdge("KRI", "Risk")).toBe(true);

    // Monitor signatures are well-formed and only on Controls; at least one exists.
    const monitored = items.filter((i) => i.monitorSignature);
    expect(monitored.length).toBeGreaterThan(0);
    for (const c of monitored) {
      expect(c.kind).toBe("Control");
      const [rule, ...rest] = c.monitorSignature!.split("|");
      expect(CONFORMANCE_RULES.has(rule), `${c.code} rule "${rule}" valid`).toBe(true);
      expect(rest.length === 1 || rest.length === 2, `${c.code} signature shape`).toBe(true);
    }
  });

  it("T0637 — the O2C mining example's deviations match the library's control monitor signatures (self-contained demo)", () => {
    const ex = STARTER_MINING_EXAMPLES.find((e) => e.slug === "order-to-cash-lifecycle");
    expect(ex, "O2C mining example is shipped").toBeTruthy();
    const ref = ex!.package.diagrams[0].data;
    const sl = ex!.package.sampleLog!;
    const log = buildEventLog(sl.headers, sl.rows, sl.mapping);
    const conf = checkTransitionConformance(log.variants, { elements: ref.elements, connectors: ref.connectors } as unknown as ReferenceSm);
    expect(conf.totalCases).toBe(200);

    // Every control that monitors a deviation actually finds it in the mined log
    // (cases > 0), so operating-effectiveness is meaningful out of the box.
    const observed = new Map(conf.violations.map((v) => [deviationSignature(v), v.cases]));
    const monitored = O2C_SAMPLE.items.filter((i) => i.monitorSignature);
    expect(monitored.length).toBeGreaterThanOrEqual(4);
    for (const c of monitored) {
      expect(observed.get(c.monitorSignature!) ?? 0, `${c.code} ${c.monitorSignature} observed`).toBeGreaterThan(0);
    }
  });

  it("T0638 — O2C_ATTACH references only real library codes + the example package validates/summarizes", () => {
    // Every code in the step-attachment map exists in the library, so adopt resolves them.
    const codes = new Set(O2C_SAMPLE.items.map((i) => i.code));
    for (const [label, m] of Object.entries(O2C_ATTACH)) {
      for (const c of [...(m.risks ?? []), ...(m.controls ?? [])]) {
        expect(codes.has(c), `${label} → ${c} exists`).toBe(true);
      }
    }

    // The example-package validator catches the real failure modes…
    expect(validateRiskControlExamplePackage(null).length).toBeGreaterThan(0);
    expect(validateRiskControlExamplePackage({ version: 2 })).toContain("Unsupported or missing package version");
    const bad = { version: 1, diagrams: [{ name: "d", type: "bpmn", data: { elements: [], connectors: [] } }], library: { name: "L", items: [{ code: "R-01", kind: "Risk", name: "x" }], links: [{ source: "R-01", target: "NOPE" }] }, attach: {} };
    expect(validateRiskControlExamplePackage(bad).some((e) => e.includes("R-01→NOPE"))).toBe(true);

    // …and accepts a minimal valid package built from the sample.
    const good: RiskControlExamplePackage = {
      version: 1,
      diagrams: [{ name: "Value Chain", type: "value-chain", data: { elements: [], connectors: [] } as never }],
      library: { name: O2C_SAMPLE.name, items: O2C_SAMPLE.items, links: O2C_SAMPLE.links },
      attach: O2C_ATTACH,
    };
    expect(validateRiskControlExamplePackage(good)).toEqual([]);
    const s = summarizeRiskControlPackage(good);
    expect(s.diagrams).toBe(1);
    expect(s.risks).toBe(10);
    expect(s.controls).toBe(11);
    expect(s.hasMining).toBe(false);
  });
});
