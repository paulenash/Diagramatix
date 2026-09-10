/**
 * Cost through BPSim.
 *
 * The activity `fixedCost` — a charge incurred each time a step runs, whatever
 * its duration — was added to the engine without a way out of the product. A
 * priced model exported to BPSim arrived somewhere else unpriced, and came back
 * from a round trip through our own exporter unpriced too, which is the worse
 * half: the loss was ours and silent.
 *
 * Unlike the skills extension, this needs no invented namespace.
 * `CostParameters/FixedCost` is part of BPSim 1.0, so a priced model survives a
 * trip through any conforming tool rather than only through this one.
 */
import { describe, it, expect } from "vitest";
import { buildBpsimData } from "@/app/lib/simulation/bpsim/exportBpsim";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";
import type { BpsimScenario } from "@/app/lib/simulation/bpsim/types";

const scenario = (fixedCost?: number): BpsimScenario => ({
  id: "s1",
  name: "Baseline",
  elements: {
    task1: {
      processingTime: { kind: "fixed", value: 5 },
      selection: "getResource('Credit')",
      ...(fixedCost !== undefined ? { fixedCost } : {}),
    },
  },
});

const roundTrip = (s: BpsimScenario) => parseBpsimScenarios(buildBpsimData([s], "hour"));

describe("activity cost through BPSim", () => {
  it("T4042 - a per-run charge survives a Diagramatix → BPSim → Diagramatix round trip", () => {
    const back = roundTrip(scenario(12.5));
    expect(back[0]?.elements.task1?.fixedCost).toBe(12.5);
  });

  it("T4043 - it is emitted as STANDARD BPSim, not an extension", () => {
    // The distinction matters commercially: a cost in our own namespace would be
    // invisible to every other tool, so a customer exporting a priced model to
    // one would get a different answer with nothing saying why.
    const xml = buildBpsimData([scenario(12.5)], "hour");
    expect(xml).toContain("CostParameters");
    expect(xml).toContain("FixedCost");
    expect(xml).not.toMatch(/dgx:[A-Za-z]*Cost/);
  });

  it("T4044 - an unpriced model emits NO cost block at all", () => {
    // Absent, not zero. Emitting `0` would tell a receiving tool the work is
    // free, which is a different claim from not having priced it.
    const xml = buildBpsimData([scenario()], "hour");
    expect(xml).not.toContain("CostParameters");
    expect(roundTrip(scenario())[0]?.elements.task1?.fixedCost).toBeUndefined();
  });

  it("T4045 - a file from another tool that prices nothing reads as unpriced", () => {
    const foreign = buildBpsimData([scenario()], "hour");
    const back = parseBpsimScenarios(foreign);
    expect(back[0]?.elements.task1?.processingTime).toBeTruthy();
    expect(back[0]?.elements.task1?.fixedCost).toBeUndefined();
  });

  it("T4046 - a zero price is UNPRICED, consistently with the engine", () => {
    // The first draft of this test asserted the opposite — that a typed 0 means
    // "this step is free" and should be carried. It passed, and it was wrong:
    // the engine itself ignores a zero (`fixedCost > 0`), so carrying one
    // through BPSim would have exported a claim the simulation does not act on,
    // and a round trip would have produced a model that priced a step the
    // original did not. Zero and absent mean the same thing here, and now they
    // mean it in all three places.
    const xml = buildBpsimData([scenario(0)], "hour");
    expect(xml).not.toContain("CostParameters");
    expect(parseBpsimScenarios(xml)[0]?.elements.task1?.fixedCost).toBeUndefined();
  });
});
