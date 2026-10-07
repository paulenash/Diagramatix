/**
 * T5245 — Paul's capture 2026-10-05, “AI Generate test”:
 *   a) the flow from the Start Event to the first (merge) gateway left from the Start's BOTTOM and entered the gateway's TOP,
 *      looping up through the Start itself, though both sat on one row and the gateway's left point was free (R8.44);
 *   b) a sequence flow never passes through another element — the loop-back from “Customer details confirmed” ran down
 *      through the task “Flag order as validated” (R8.43).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { findRoutingViolations } from "../editor/_helpers/routing";
import type { DiagramData } from "@/app/lib/diagram/types";

const stored = JSON.parse(readFileSync("tests/fixtures/endpoint-heal/ai-generate-test.json", "utf8")).diagrams[0].data as DiagramData & { aiGeneration: { plan: { elements: never[]; connections: never[] } } };
const regenerate = () => {
  const g = layoutBpmnDiagram(stored.aiGeneration.plan.elements, stored.aiGeneration.plan.connections);
  return { elements: g.elements, connectors: g.connectors } as DiagramData;
};

describe("T5245 R8.44 — a Start Event leaves by its right-hand point", () => {
  const d = regenerate();
  it("the Start's flow leaves right and enters the level gateway at its LEFT point, in a straight line", () => {
    const c = d.connectors.find((x) => x.sourceId === "e1")!;
    expect(c.sourceSide).toBe("right");
    expect(c.targetSide).toBe("left");
    const ys = new Set(c.waypoints.map((p) => Math.round(p.y)));
    expect(ys.size).toBe(1);
  });
  it("the stored diagram had it the wrong way (so the test above is a real test)", () => {
    const c = stored.connectors.find((x) => x.sourceId === "e1")!;
    expect(c.sourceSide).toBe("bottom");
  });
  it("every Start Event with one flow to something on its right leaves by the right (over the layout corpus)", async () => {
    const fs = await import("node:fs"), path = await import("node:path");
    const dir = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
    const bad: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".plan.json")).sort()) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      const g = layoutBpmnDiagram(plan.elements, plan.connections);
      const byId = new Map(g.elements.map((e) => [e.id, e]));
      for (const s of g.elements) {
        if (s.type !== "start-event" || s.boundaryHostId) continue;
        const outs = g.connectors.filter((c) => c.type === "sequence" && c.sourceId === s.id);
        if (outs.length !== 1) continue;
        const t = byId.get(outs[0].targetId);
        if (t && t.type !== "pool" && t.type !== "lane" && t.x >= s.x + s.width && outs[0].sourceSide !== "right") bad.push(`${f}: ${s.id} leaves ${outs[0].sourceSide}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("T5245 R8.43 — a sequence flow never passes through another element", () => {
  it("the regenerated diagram has no flow through an element (the loop-back no longer cuts the task)", () => {
    expect(findRoutingViolations(regenerate()).filter((v) => /crosses/.test(v))).toEqual([]);
  });
  it("Paul's stored diagram did (so the test above is a real test)", () => {
    expect(findRoutingViolations(stored).filter((v) => /crosses/.test(v)).join(";")).toMatch(/conn-ie1-g0-16 crosses task t6/);
  });
  it("R8.43 and R8.44 are in the seeded BPMN rules after R8.42 and in an idempotent patch that says the same thing", () => {
    const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
    const sql = readFileSync("scripts/sql/patch-rule-r8-43-r8-44-pass-through-and-start.sql", "utf8");
    const at = seed.indexOf("R8.43:");
    expect(at).toBeGreaterThan(seed.indexOf("R8.42:"));
    const text = (JSON.parse(`"${seed.slice(at, seed.indexOf('"', at))}"`) as string).split("\nR8.45:")[0];   // R8.45 is appended to the same string
    for (const line of text.split("\n")) expect(sql).toContain(line.trim());
    expect(sql).toContain("AND rules NOT LIKE '%R8.43:%'");
    expect(sql).toContain("LIKE 'Group 8: Auto-Layout Placement%'");
    expect(sql).not.toContain("DELETE FROM");
  });
  it("the rules are named in the code", () => {
    const src = readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8");
    expect(src).toContain("R8.44");
    expect(src).toContain("R8.43");
  });
});
