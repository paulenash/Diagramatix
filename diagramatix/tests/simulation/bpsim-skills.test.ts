/**
 * Skills through BPSim — Phase 7 slice 4.
 *
 * BPSim 1.0 has NO concept of who is qualified to do what. The choice was to drop
 * the skill requirements on export or to carry them in an extension namespace.
 *
 * Dropping silently is the worse option and the reason for this file: the exported
 * file would then produce DIFFERENT results in another tool, with nothing anywhere
 * saying why. Carrying them means a Diagramatix → BPSim → Diagramatix round trip
 * is lossless, other tools ignore a namespace they do not know, and the export
 * says out loud that they will.
 */
import { describe, it, expect } from "vitest";
import { buildBpsimData } from "@/app/lib/simulation/bpsim/exportBpsim";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";
import type { BpsimScenario } from "@/app/lib/simulation/bpsim/types";

const scenario = (requiredSkills?: string[]): BpsimScenario => ({
  id: "s1",
  name: "Baseline",
  elements: {
    task1: {
      processingTime: { kind: "fixed", value: 5 },
      selection: "getResource('Claims')",
      ...(requiredSkills ? { requiredSkills } : {}),
    },
  },
});

/** The exporter emits a BPSimData fragment; the importer reads one back. */
const roundTrip = (sc: BpsimScenario) => parseBpsimScenarios(buildBpsimData([sc], "minute"), "minute");

describe("skills through BPSim", () => {
  it("T3540 - skills survive a Diagramatix → BPSim → Diagramatix round trip", () => {
    const back = roundTrip(scenario(["assess", "approve limits"]));
    expect(back[0].elements.task1.requiredSkills).toEqual(["assess", "approve limits"]);
  });

  it("T3541 - they travel in OUR namespace, declared on the root so the file stays well-formed", () => {
    const xml = buildBpsimData([scenario(["assess"])], "minute");
    expect(xml).toContain('xmlns:dgx="https://diagramatix.com/schemas/bpsim-extensions/1.0"');
    expect(xml).toContain("<dgx:RequiredSkills>");
    expect(xml).toContain('<dgx:Skill name="assess"/>');
  });

  it("T3542 - a scenario with no skills emits no extension at all", () => {
    const xml = buildBpsimData([scenario()], "minute");
    expect(xml).not.toContain("dgx:RequiredSkills");
    // ...and still round-trips as an ordinary BPSim scenario.
    expect(roundTrip(scenario())[0].elements.task1.requiredSkills).toBeUndefined();
  });

  it("T3543 - a file from another tool simply has none, which reads as no constraint", () => {
    const foreign = [
      '<bpsim:BPSimData xmlns:bpsim="http://www.bpsim.org/schemas/1.0">',
      '<bpsim:Scenario id="s1" name="Theirs">',
      '<bpsim:ElementParameters elementRef="task1">',
      "<bpsim:ResourceParameters>",
      '<bpsim:Quantity><bpsim:NumericParameter value="3"/></bpsim:Quantity>',
      "</bpsim:ResourceParameters>",
      "</bpsim:ElementParameters>",
      "</bpsim:Scenario></bpsim:BPSimData>",
    ].join("");
    const parsed = parseBpsimScenarios(foreign, "minute");
    expect(parsed[0].elements.task1.quantity).toBe(3);
    expect(parsed[0].elements.task1.requiredSkills).toBeUndefined();
  });

  it("T3544 - skill NAMES are escaped, so a stray quote cannot break the document", () => {
    const xml = buildBpsimData([scenario(['say "no"', "a & b"])], "minute");
    expect(xml).not.toContain('name="say "no""');
    expect(xml).toContain("&amp;");
    // and it still comes back intact
    const back = parseBpsimScenarios(xml, "minute");
    expect(back[0].elements.task1.requiredSkills).toHaveLength(2);
  });
});
