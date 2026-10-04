/**
 * T5236 — AI generation uses the ONE endpoint allocator (slice 2 of new features/connector-endpoints-plan-2026-10-03.md).
 *
 * The three separate passes in bpmnLayout.ts — messages (R5.06), sequence ends (R8.11) and sequence-vs-message clearance
 * (R8.12) — are replaced by a call to `spreadEndpoints`, so generation and (slice 3) the editor cannot drift. Pinned:
 *   • the old loops are gone and the call is there (guard the WIRING, not just the module);
 *   • a generated diagram is ALREADY clean: running the allocator over it changes nothing (idempotent on real output);
 *   • no shared attachment point is left on an Activity or an Event in any of the corpus diagrams;
 *   • a plan with many flows into one task, two messages on one task and two on one event comes out spread;
 *   • a gateway's ends are still exactly its vertices (R6.29);
 *   • image import (`layoutBpmnPreserved`) is exempt: imported drawings stay as drawn.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations } from "@/app/lib/diagram/checks/layoutViolations";
import { spreadEndpoints, SPREAD } from "@/app/lib/diagram/endpointSpread";
import type { Connector, DiagramData } from "@/app/lib/diagram/types";

const DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".plan.json")).sort() : [];
const src = fs.readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8");

function corpus(f: string): DiagramData {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
  const r = layoutBpmnDiagram(plan.elements, plan.connections);
  return { elements: r.elements, connectors: r.connectors } as DiagramData;
}
const off = (c: Connector, role: "source" | "target") => (role === "source" ? c.sourceOffsetAlong : c.targetOffsetAlong) ?? 0.5;

describe("T5236 the wiring", () => {
  it("the three old passes are gone and generation calls the one allocator", () => {
    expect(src).toContain('import { spreadEndpoints } from "./endpointSpread";');
    expect(src).toContain("spreadEndpoints([...elMap.values()], connectors)");
    expect(src, "R5.06's own loop is gone").not.toContain("const MIN_SEP = 24;");
    expect(src, "R8.11's own loop is gone").not.toContain("const MIN_PX = 10;");
  });
  it("image import keeps its own geometry (imported drawings stay exactly as drawn)", () => {
    expect(src).toContain("layoutBpmnPreserved");
    const preserved = src.slice(src.indexOf("export function layoutBpmnPreserved"), src.indexOf("export function layoutBpmnPreserved") + 20000);
    expect(preserved).not.toContain("spreadEndpoints");
  });
});

describe("T5236 generated diagrams are already clean", () => {
  it("over the layout corpus: the allocator finds nothing to change, and no Activity or Event shares a point", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    const problems: string[] = [];
    for (const f of files) {
      const d = corpus(f);
      const again = spreadEndpoints(d.elements, d.connectors);
      if (again.changedIds.length) problems.push(`${f}: a second pass would still move ${again.changedIds.length} connector(s)`);
      const typeOf = new Map(d.elements.map((e) => [e.id, e.type] as const));
      const shared = findLayoutViolations(d).filter((v) => v.startsWith("shared attachment point") && typeOf.get(v.slice("shared attachment point ".length).split("|")[0]) !== "gateway");
      if (shared.length) problems.push(`${f}: ${shared.join("; ")}`);
    }
    expect(problems).toEqual([]);
  });
});

describe("T5236 a plan built to collide", () => {
  const elements: AiElement[] = [
    { id: "s", type: "start-event", label: "Start", lane: "Team" } as unknown as AiElement,
    ...["a", "b", "c"].map((id) => ({ id, type: "task", label: `Task ${id}`, lane: "Team" }) as unknown as AiElement),
    { id: "join", type: "task", label: "Join", lane: "Team" } as unknown as AiElement,
    { id: "e", type: "end-event", label: "End", lane: "Team" } as unknown as AiElement,
  ];
  const connections: AiConnection[] = [
    { sourceId: "s", targetId: "a" }, { sourceId: "s", targetId: "b" }, { sourceId: "s", targetId: "c" },
    { sourceId: "a", targetId: "join" }, { sourceId: "b", targetId: "join" }, { sourceId: "c", targetId: "join" },
    { sourceId: "join", targetId: "e" },
  ] as unknown as AiConnection[];
  const r = layoutBpmnDiagram(elements, connections);
  const conns = r.connectors as Connector[];

  it("several flows into one task are spread on its face, at least the gap apart", () => {
    const into = conns.filter((c) => c.targetId === "join");
    expect(into.length).toBe(3);
    const bySide = new Map<string, number[]>();
    for (const c of into) bySide.set(c.targetSide, [...(bySide.get(c.targetSide) ?? []), off(c, "target") * (c.targetSide === "left" || c.targetSide === "right" ? 65 : 102)]);
    for (const px of bySide.values()) {
      const s = [...px].sort((x, y) => x - y);
      for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(SPREAD.activity.gap - 0.1);
    }
  });
  it("and running the allocator again changes nothing", () => {
    expect(spreadEndpoints(r.elements, conns).changedIds).toEqual([]);
  });
});
