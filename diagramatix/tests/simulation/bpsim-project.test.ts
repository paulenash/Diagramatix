/**
 * BPSim → project setup: the team/calendar library + run config derived from a
 * BPSim scenario, which is what makes an imported .bpmn runnable rather than
 * just annotated. Driven by the official OMG/WfMC example files.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";
import { applyBpsimToDiagram } from "@/app/lib/simulation/bpsim/applyBpsimToDiagram";
import { bpsimLibraryFrom, bpsimRunConfig, richestScenario } from "@/app/lib/simulation/bpsim/bpsimProject";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { BpsimScenario } from "@/app/lib/simulation/bpsim/types";

const EX = "tests/simulation/fixtures";
const read = (f: string) => readFileSync(join(process.cwd(), EX, f), "utf8");

/** The full import pipeline a user gets when uploading a BPSim .bpmn. */
async function importWithBpsim(file: string) {
  const xml = read(file);
  const parsed = await importBpmnXml(xml, file);
  const scenarios = parseBpsimScenarios(xml, "minute");
  const scenario = richestScenario(scenarios)!;
  const data = applyBpsimToDiagram(parsed.data, parsed.idMap, scenario);
  return { data, scenario, scenarios };
}

describe("richestScenario", () => {
  it("picks the scenario with the most element parameters", () => {
    const thin: BpsimScenario = { id: "a", elements: { x: {} } };
    const fat: BpsimScenario = { id: "b", elements: { x: {}, y: {}, z: {} } };
    expect(richestScenario([thin, fat])?.id).toBe("b");
  });

  it("ignores scenarios with no element parameters, and returns null for none", () => {
    expect(richestScenario([{ id: "empty", elements: {} }])).toBeNull();
    expect(richestScenario([])).toBeNull();
  });
});

describe("bpsimLibraryFrom", () => {
  // Technical Support is the fixture that actually names resources
  // (ResourceParameters/Selection); Car Repair states quantities but never a
  // resource, so it has no teams to derive — covered separately below.
  it("derives a team per resource named in the file", async () => {
    const { data, scenario } = await importWithBpsim("Technical Support Process v2.0.0.bpmn");
    const lib = bpsimLibraryFrom(data, scenario);

    // Every team referenced by an annotated element appears in the library.
    const referenced = new Set(
      data.elements.map((e) => getSimParams(e).teamId).filter((t): t is string => !!t),
    );
    expect(referenced.size).toBeGreaterThan(0);
    for (const t of referenced) {
      expect(lib.teams.map((x) => x.name)).toContain(t);
    }
    // Names are unique and capacity is always a usable pool size.
    expect(new Set(lib.teams.map((t) => t.name)).size).toBe(lib.teams.length);
    for (const t of lib.teams) expect(t.capacity).toBeGreaterThanOrEqual(1);
    // The four resources the file names, all present.
    expect(lib.teams.map((t) => t.name)).toEqual([
      "resource_1st_Level_Techical_Support_Agent",
      "resource_2nd_Level_Techical_Support_Agent",
      "resource_Front_Office",
      "resource_Supplier",
    ]);
  });

  it("yields no teams for a file that states quantities but names no resource", async () => {
    const { data, scenario } = await importWithBpsim("Car Repair Process v2.0.0.bpmn");
    // Car Repair models times/properties/conditions but no ResourceParameters
    // Selection, so there is nothing to attribute a pool to. Better an empty
    // library than teams invented from unattributable quantities.
    expect(bpsimLibraryFrom(data, scenario).teams).toEqual([]);
  });

  it("defaults capacity to 1 when the file states no Quantity", () => {
    const lib = bpsimLibraryFrom(
      { elements: [], connectors: [] } as never,
      { elements: { t1: { selection: "getResource('Mechanic')" } } },
    );
    expect(lib.teams).toEqual([{ name: "Mechanic", capacity: 1 }]);
  });

  it("takes the stated Quantity as the pool size, largest wins across tasks", () => {
    const lib = bpsimLibraryFrom(
      { elements: [], connectors: [] } as never,
      {
        elements: {
          t1: { selection: "getResource('Mechanic', 1)", quantity: 2 },
          t2: { selection: "getResource('Mechanic', 1)", quantity: 5 },
          t3: { selection: "getResource('Advisor', 1)", quantity: 3 },
        },
      },
    );
    expect(lib.teams).toEqual([
      { name: "Advisor", capacity: 3 },
      { name: "Mechanic", capacity: 5 },
    ]);
  });

  it("carries scenario calendars, naming an unnamed one by its id", () => {
    const pattern = { intervals: [] };
    const lib = bpsimLibraryFrom(
      { elements: [], connectors: [] } as never,
      { elements: {}, calendars: [{ id: "cal-1", name: "Day shift", pattern }, { id: "cal-2", pattern }] },
    );
    expect(lib.calendars).toEqual([
      { name: "Day shift", pattern },
      { name: "cal-2", pattern },
    ]);
  });

  it("omits `calendars` entirely when the file defines none", () => {
    const lib = bpsimLibraryFrom({ elements: [], connectors: [] } as never, { elements: {} });
    expect(lib.calendars).toBeUndefined();
  });
});

describe("bpsimRunConfig", () => {
  it("takes horizon + replications from the scenario", async () => {
    const { scenario } = await importWithBpsim("Car Repair Process v2.0.0.bpmn");
    const cfg = bpsimRunConfig(scenario);
    expect(cfg.replications).toBe(3);      // the file's @replication
    expect(cfg.horizon).toBe(3600);        // PT60H in minutes
    expect(cfg.clockUnit).toBe("minute");
    expect(cfg.collectQueues).toBe(true);
  });

  it("defaults warm-up to 10% of the horizon when the file omits it", () => {
    expect(bpsimRunConfig({ elements: {}, horizon: 1000 }).warmUp).toBe(100);
  });

  it("never lets warm-up swallow more than half the horizon", () => {
    expect(bpsimRunConfig({ elements: {}, horizon: 1000, warmUp: 9999 }).warmUp).toBe(500);
  });

  it("clamps an absurd horizon rather than wedging the run", () => {
    expect(bpsimRunConfig({ elements: {}, horizon: 10_000_000 }).horizon).toBe(100_000);
    expect(bpsimRunConfig({ elements: {}, horizon: 1 }).horizon).toBe(800);
  });

  it("clamps replications to a runnable count", () => {
    expect(bpsimRunConfig({ elements: {}, replication: 5000 }).replications).toBe(50);
    expect(bpsimRunConfig({ elements: {}, replication: 0 }).replications).toBe(1);
  });
});
