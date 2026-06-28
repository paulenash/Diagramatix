/**
 * BPSim interop: faithful import of the official OMG/WfMC examples (Car Repair,
 * Technical Support) covering every parameter category we model, plus a lossless
 * export → re-import round-trip.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";
import { buildBpsimData } from "@/app/lib/simulation/bpsim/exportBpsim";
import type { BpsimScenario } from "@/app/lib/simulation/bpsim/types";
import { isoToUnit } from "@/app/lib/simulation/duration";

// Fixtures live in the tracked test tree — the source `new features/BPsim/Examples`
// folder is gitignored, so it isn't present in a CI checkout. Copy new fixtures
// here when adding cases.
const EX = "tests/simulation/fixtures";
const read = (f: string) => readFileSync(join(process.cwd(), EX, f), "utf8");
const richest = (ss: BpsimScenario[]) => ss.reduce((a, b) => (Object.keys(b.elements).length > Object.keys(a.elements).length ? b : a));
const elems = (s: BpsimScenario) => Object.values(s.elements);
const allElems = (ss: BpsimScenario[]) => ss.flatMap(elems);

describe("BPSim import — Car Repair (property/condition-driven)", () => {
  const scenarios = parseBpsimScenarios(read("Car Repair Process v2.0.0.bpmn"), "minute");
  const s = richest(scenarios);

  it("reads the scenario run config", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(1);
    expect(s.replication).toBe(3);
    expect(s.horizon).toBeCloseTo(isoToUnit("PT60H", "minute"), 5); // 3600 min
  });

  it("reads the InterTriggerTimer as an inter-arrival (PT24M → 24 min)", () => {
    const arr = elems(s).find((e) => e.interArrival);
    expect(arr?.interArrival).toEqual({ kind: "fixed", value: 24 });
  });

  it("reads a TruncatedNormal property init (noOfIssues ~ N(2, 1))", () => {
    const init = elems(s).flatMap((e) => e.assignments ?? []).find((a) => a.init);
    expect(init?.property).toBe("noOfIssues");
    expect(init?.init).toEqual({ kind: "normal", mean: 2, sd: 1 });
  });

  it("reads expression assignments + a routing Condition", () => {
    const exprs = elems(s).flatMap((e) => e.assignments ?? []).map((a) => a.expr).filter(Boolean);
    expect(exprs).toContain("getProperty('noOfIssues') - 1");
    const conds = elems(s).map((e) => e.condition).filter(Boolean);
    expect(conds).toContain("getProperty('noOfIssues') > 0");
  });

  it("reads branch probabilities (FloatingParameter)", () => {
    const probs = elems(s).map((e) => e.probability).filter((p) => p !== undefined);
    expect(probs).toContain(0.25);
    expect(probs).toContain(0.75);
  });
});

describe("BPSim import — Technical Support (time/resource-driven)", () => {
  const all = allElems(parseBpsimScenarios(read("Technical Support Process v2.0.0.bpmn"), "minute"));

  it("reads ProcessingTime distributions (TruncatedNormal + Duration)", () => {
    const procs = all.map((e) => e.processingTime).filter(Boolean);
    expect(procs.length).toBeGreaterThan(5);
    expect(procs).toContainEqual({ kind: "normal", mean: 4, sd: 0.5 });
    // PT30S processing time → 0.5 minutes.
    expect(procs).toContainEqual({ kind: "fixed", value: 0.5 });
  });

  it("reads resource Quantity and a Selection expression", () => {
    // (This file's WaitTime entries are output ResultRequests, not input
    // distributions — correctly skipped; WaitTime-as-input is covered by the
    // round-trip test.)
    expect(all.some((e) => (e.quantity ?? 0) >= 3)).toBe(true);
    const sel = all.map((e) => e.selection).find(Boolean);
    expect(sel).toMatch(/getResource\(/);
  });
});

describe("BPSim export → re-import round-trip", () => {
  it("preserves every parameter category losslessly", () => {
    const original: BpsimScenario = {
      id: "S1", name: "Round trip", author: "Test",
      replication: 5, horizon: 480, warmUp: 60,
      elements: {
        start: { interArrival: { kind: "fixed", value: 24 }, assignments: [{ property: "n", type: "int", init: { kind: "normal", mean: 2, sd: 1 } }] },
        task1: { processingTime: { kind: "triangular", min: 1, mode: 2, max: 5 }, waitTime: { kind: "fixed", value: 3 }, quantity: 4, selection: "getResource('ops', 1)" },
        flowA: { probability: 0.25 },
        gate: { condition: "getProperty('n') > 0" },
        upd: { assignments: [{ property: "n", expr: "getProperty('n') - 1" }] },
      },
    };
    const xml = buildBpsimData([original], "minute");
    const [back] = parseBpsimScenarios(xml, "minute");

    expect(back.replication).toBe(5);
    expect(back.horizon).toBeCloseTo(480, 5);
    expect(back.warmUp).toBeCloseTo(60, 5);
    expect(back.elements.start.interArrival).toEqual({ kind: "fixed", value: 24 });
    expect(back.elements.start.assignments?.[0]).toEqual({ property: "n", type: "int", init: { kind: "normal", mean: 2, sd: 1 } });
    expect(back.elements.task1.processingTime).toEqual({ kind: "triangular", min: 1, mode: 2, max: 5 });
    expect(back.elements.task1.waitTime).toEqual({ kind: "fixed", value: 3 });
    expect(back.elements.task1.quantity).toBe(4);
    expect(back.elements.task1.selection).toBe("getResource('ops', 1)");
    expect(back.elements.flowA.probability).toBe(0.25);
    expect(back.elements.gate.condition).toBe("getProperty('n') > 0");
    expect(back.elements.upd.assignments?.[0]).toEqual({ property: "n", expr: "getProperty('n') - 1" });
  });

  it("emits a valid BPSimData wrapper", () => {
    const xml = buildBpsimData([{ elements: {} }], "minute");
    expect(xml).toContain("<bpsim:BPSimData");
    expect(xml).toContain("</bpsim:BPSimData>");
  });
});
