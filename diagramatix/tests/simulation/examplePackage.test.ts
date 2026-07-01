/**
 * Example-package validation: the structural guard that stops a malformed
 * bundle from half-creating a project on adopt.
 */
import { describe, it, expect } from "vitest";
import { emptyPackage, validateExamplePackage, summarizePackage, type ExamplePackage } from "@/app/lib/simulation/examplePackage";

const good: ExamplePackage = {
  version: 1,
  teams: [{ name: "ops", capacity: 3 }],
  diagrams: [{ key: "d1", name: "Intake", type: "bpmn", data: { viewport: { x: 0, y: 0, zoom: 1 }, elements: [], connectors: [] } }],
  study: { name: "Demo", rootKeys: ["d1"] },
  scenarios: [{ name: "Baseline", isBaseline: true, runConfig: { clockUnit: "minute", horizon: 480, warmUp: 0, replications: 5, seed: 1, collectQueues: true } }],
};

describe("validateExamplePackage", () => {
  it("accepts a well-formed package", () => {
    expect(validateExamplePackage(good)).toEqual([]);
  });

  it("rejects a wrong/missing version", () => {
    expect(validateExamplePackage({ ...good, version: 2 } as unknown)).toContain("Unsupported or missing package version");
  });

  it("flags a study root that doesn't match a diagram key", () => {
    const errs = validateExamplePackage({ ...good, study: { name: "Demo", rootKeys: ["nope"] } });
    expect(errs.some((e) => e.includes('Study root "nope"'))).toBe(true);
  });

  it("flags duplicate diagram keys and team names", () => {
    const dupD = validateExamplePackage({ ...good, diagrams: [good.diagrams[0], good.diagrams[0]] });
    expect(dupD.some((e) => e.includes("Duplicate diagram key"))).toBe(true);
    const dupT = validateExamplePackage({ ...good, teams: [good.teams[0], good.teams[0]] });
    expect(dupT.some((e) => e.includes("Duplicate team name"))).toBe(true);
  });

  it("requires at least one diagram and at most one baseline", () => {
    expect(validateExamplePackage({ ...good, diagrams: [], study: { name: "D", rootKeys: [] } })).toContain("At least one diagram is required");
    const twoBase = validateExamplePackage({
      ...good,
      scenarios: [{ ...good.scenarios[0] }, { ...good.scenarios[0], name: "B2" }],
    });
    expect(twoBase).toContain("At most one baseline scenario");
  });

  it("T0543 — accepts a scenario variant root that matches a diagram key, rejects one that doesn't", () => {
    const twoDiagrams: ExamplePackage = {
      ...good,
      diagrams: [good.diagrams[0], { ...good.diagrams[0], key: "d2", name: "To-be" }],
      study: { name: "Compare", rootKeys: ["d1", "d2"] },
      scenarios: [
        { name: "As-is", isBaseline: true, runConfig: good.scenarios[0].runConfig, variantRootKeys: ["d1"] },
        { name: "To-be", runConfig: good.scenarios[0].runConfig, variantRootKeys: ["d2"] },
      ],
    };
    expect(validateExamplePackage(twoDiagrams)).toEqual([]);
    const bad = validateExamplePackage({
      ...twoDiagrams,
      scenarios: [{ name: "As-is", runConfig: good.scenarios[0].runConfig, variantRootKeys: ["ghost"] }],
    });
    expect(bad.some((e) => e.includes('variant root "ghost"'))).toBe(true);
  });

  it("emptyPackage is structurally sound except for the no-diagram rule", () => {
    expect(summarizePackage(emptyPackage())).toEqual({ diagrams: 0, teams: 0, scenarios: 0, roots: 0 });
    expect(summarizePackage({})).toEqual({ diagrams: 0, teams: 0, scenarios: 0, roots: 0 });
  });
});
