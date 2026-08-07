/**
 * Visio export — master registry integrity (Error 275 regression net).
 *
 * A .vsdx is an OPC package: every <Master ID> and every relationship Id must be
 * UNIQUE, and every page shape's Master='N' must resolve to exactly one master
 * part. A duplicate (e.g. the Pool/Lane path once allocated master IDs as
 * `200 + shapeId`, colliding with createInstanceMaster's 1000+ IDs when a Pool
 * landed on shapeId 800 → 1000) makes Visio reject the file:
 *   "Error 275: Visio cannot open the file ... because it is corrupt."
 * This pins the invariant on the real diagram that first tripped it, plus the
 * shared scenario matrix.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { buildVsdxBytes } from "./_helpers/vsdx";
import { SCENARIOS, build } from "./_helpers/scenarios";
import type { DiagramData } from "@/app/lib/diagram/types";

async function registryViolations(data: DiagramData): Promise<string[]> {
  const zip = await JSZip.loadAsync(await buildVsdxBytes(data));
  const mastersXml = await zip.file("visio/masters/masters.xml")!.async("string");
  const rels = await zip.file("visio/masters/_rels/masters.xml.rels")!.async("string");
  const pageXml = await zip.file("visio/pages/page1.xml")!.async("string");
  const v: string[] = [];

  const ids = [...mastersXml.matchAll(/<Master\b[^>]*\bID='(\d+)'/g)].map(m => m[1]);
  for (const d of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) v.push(`duplicate Master ID '${d}'`);

  const relIds = [...rels.matchAll(/Id="([^"]+)"/g)].map(m => m[1]);
  for (const d of new Set(relIds.filter((x, i) => relIds.indexOf(x) !== i))) v.push(`duplicate relationship Id '${d}'`);

  const declared = new Set(ids);
  for (const m of pageXml.matchAll(/\bMaster='(\d+)'/g)) {
    if (!declared.has(m[1])) v.push(`page references undeclared Master '${m[1]}'`);
  }
  return v;
}

describe("Visio export — master registry integrity (Error 275)", () => {
  it("real 'Pools and Lanes with elements' diagram has a clean master registry", async () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures", "pools-lanes-with-elements.json"), "utf8"),
    ) as DiagramData;
    const v = await registryViolations(data);
    expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
  });

  for (const sc of SCENARIOS) {
    it(`${sc.name} — clean master registry`, async () => {
      const v = await registryViolations(build(sc));
      expect(v, `\n  - ${v.join("\n  - ")}`).toEqual([]);
    });
  }
});
