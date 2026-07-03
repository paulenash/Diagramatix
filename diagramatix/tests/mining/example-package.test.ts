/**
 * MiningExample catalog — the portable package (validate/summarize/empty) and
 * the shipped starter example. The starter is generated deterministically by
 * scripts/gen-mining-examples.ts into miningExampleData.json, so its conformance
 * against the two baked reference state machines is a fixed oracle: a permissive
 * reference (rework allowed) and a strict one (no On Hold → In Progress rework).
 */
import { describe, it, expect } from "vitest";
import {
  emptyMiningPackage,
  validateMiningExamplePackage,
  summarizeMiningPackage,
  type MiningExamplePackage,
} from "@/app/lib/mining/examplePackage";
import { STARTER_MINING_EXAMPLES } from "@/app/lib/mining/exampleSeeds";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";

const toRef = (d: MiningExamplePackage["diagrams"][number]): ReferenceSm =>
  ({ elements: d.data.elements as ReferenceSm["elements"], connectors: d.data.connectors as ReferenceSm["connectors"] });

describe("mining example package", () => {
  it("T0604 — emptyMiningPackage is a version-1 scaffold (not yet adoptable)", () => {
    const p = emptyMiningPackage();
    expect(p.version).toBe(1);
    expect(p.diagrams).toEqual([]);
    // A blank scaffold has no log yet, so it isn't adoptable until filled.
    expect(validateMiningExamplePackage(p).length).toBeGreaterThan(0);
  });

  it("T0605 — validate catches the real failure modes", () => {
    expect(validateMiningExamplePackage(null)).toContain("Package is not an object");
    expect(validateMiningExamplePackage({ version: 2 })).toContain("Unsupported or missing package version");
    // dangling referenceSmKey + missing mapping fields
    const bad: unknown = {
      version: 1,
      diagrams: [{ key: "a", name: "A", type: "state-machine", data: { elements: [], connectors: [] } }],
      run: { name: "x", mapping: { caseId: "c" }, variants: [], performance: { clockUnit: "hour" }, referenceSmKey: "nope" },
    };
    const errs = validateMiningExamplePackage(bad);
    expect(errs.some((e) => e.includes("mapping"))).toBe(true);
    expect(errs.some((e) => e.includes("non-empty array"))).toBe(true);
    expect(errs.some((e) => e.includes('referenceSmKey "nope"'))).toBe(true);
  });

  it("T0606 — summarize counts references/cases/variants/states", () => {
    const s = summarizeMiningPackage(STARTER_MINING_EXAMPLES[0].package);
    expect(s).toEqual({ references: 2, cases: 200, variants: 10, states: 7 });
  });
});

describe("the shipped Accounts Payable starter example", () => {
  const ex = STARTER_MINING_EXAMPLES[0];

  it("T0607 — is a valid, self-consistent bundle", () => {
    expect(ex.slug).toBe("accounts-payable-invoice-lifecycle");
    expect(validateMiningExamplePackage(ex.package)).toEqual([]);
    expect(ex.package.diagrams).toHaveLength(2);
    // referenceSmKey resolves to a carried diagram
    expect(ex.package.diagrams.some((d) => d.key === ex.package.run.referenceSmKey)).toBe(true);
    // the run can drive discovery + calibration
    expect(ex.package.run.variants.length).toBeGreaterThan(0);
    expect(ex.package.run.performance.clockUnit).toBe("hour");
    expect(ex.package.run.stats.states).toEqual(
      ["Approved", "Cancelled", "In Progress", "On Hold", "Paid", "Ready to Pay", "Received"],
    );
  });

  it("T0608 — conformance is the fixed oracle: permissive clean, strict flags rework", () => {
    const byKey = Object.fromEntries(ex.package.diagrams.map((d) => [d.key, d]));
    const permissive = checkTransitionConformance(ex.package.run.variants, toRef(byKey["ap-reference"]));
    const strict = checkTransitionConformance(ex.package.run.variants, toRef(byKey["ap-strict"]));

    // Permissive reference: only in-flight (unexpected-exit) deviations — no undocumented transitions.
    expect(permissive.conformingCases).toBe(181);
    expect(permissive.totalCases).toBe(200);
    expect(permissive.violations.every((v) => v.rule === "unexpected-exit")).toBe(true);

    // Strict reference (no rework loop): the On Hold → In Progress resume is now undocumented.
    expect(strict.conformingCases).toBe(144);
    const undoc = strict.violations.find((v) => v.rule === "undocumented-transition");
    expect(undoc?.message).toBe("Undocumented transition: On Hold → In Progress");
    expect(undoc?.cases).toBe(39);
    // Strict is strictly less conforming than permissive.
    expect(strict.conformingCases).toBeLessThan(permissive.conformingCases);
  });
});
