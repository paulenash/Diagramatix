/**
 * A white-box pool with no lanes still owns its elements.
 *
 * Paul, 2026-09-13, "New vtt Process": "Misplaced Duplicated Tasks at top right
 * of diagram that duplicate on being moved. No connectors connecting them to
 * the process?" and "Task errors in bottom left of diagram. No connectors".
 *
 * Both are one defect. The plan had a second process — "Intake Compounder", a
 * white-box pool with a timer start, three tasks and an end, and NO lanes. The
 * lane-assignment pass found `pool` set but no lanes for it and filed the five
 * elements as UNASSIGNED; the fallback then pushed every unassigned element into
 * the first white-box pool's first lane. Later the pool loop reached the
 * compounder, saw no lanes, and placed its elements directly in the pool. Two
 * copies, same ids. Moving one "duplicates" it because the editor addresses
 * elements by id; the connectors resolve to whichever copy wins the lookup, so
 * the other copy has none — which is exactly what he saw at both ends of the
 * diagram.
 *
 * "Unassigned" means no pool. An element whose pool merely has no lanes is not
 * unassigned; it is in that pool.
 *
 * Written BEFORE the fix; T4359 and T4360 fail on today's engine.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const layout = (elements: AiElement[], connections: AiConnection[]) =>
  layoutBpmnDiagram(elements, connections) as DiagramData;

const duplicateIds = (data: DiagramData): string[] => {
  const seen = new Map<string, number>();
  for (const e of data.elements) seen.set(e.id, (seen.get(e.id) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
};

/** The pool (transitively) enclosing an element, or null. */
const poolOf = (data: DiagramData, e: DiagramElement): DiagramElement | null => {
  const byId = new Map(data.elements.map((x) => [x.id, x]));
  let cur: DiagramElement | undefined = e;
  for (let g = 0; cur && g < 16; g++) {
    if (cur.type === "pool") return cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
};

describe("a lane-less white-box pool keeps its own elements", () => {
  it("T4359 — Paul's transcript-generated plan: no element is drawn twice", () => {
    const file = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "VTT01.plan.json");
    const plan = JSON.parse(fs.readFileSync(file, "utf8")).diagrams[0].data.aiGeneration.plan;
    const data = layout(plan.elements, plan.connections);
    expect(duplicateIds(data), "an id drawn twice is a shape that duplicates when moved").toEqual([]);
    // …and every compounder element sits in the compounder, not the main pool.
    const comp = data.elements.find((e) => e.type === "pool" && /Compounder/.test(e.label ?? ""))!;
    expect(comp).toBeDefined();
    for (const id of ["s_c", "t_c1", "t_c2", "t_c3", "e_c"]) {
      const e = data.elements.find((x) => x.id === id)!;
      expect(e, `${id} must still exist once`).toBeDefined();
      expect(poolOf(data, e)?.id, `${id} drawn in the wrong pool`).toBe(comp.id);
    }
    // Every element keeps its connectors: nothing is stranded.
    const deg = new Map<string, number>();
    for (const c of data.connectors) { deg.set(c.sourceId, (deg.get(c.sourceId) ?? 0) + 1); deg.set(c.targetId, (deg.get(c.targetId) ?? 0) + 1); }
    const stranded = data.elements
      .filter((e) => !["pool", "lane", "text-annotation", "data-object", "data-store", "group"].includes(e.type))
      .filter((e) => !deg.get(e.id)).map((e) => e.id);
    expect(stranded, "flow shapes with no connector at all").toEqual([]);
  });

  it("T4360 — the isolated shape: a second white-box pool with no lanes", () => {
    const elements = [
      { id: "pA", type: "pool", label: "Main", poolType: "white-box" },
      { id: "lA", type: "lane", label: "Team", pool: "pA" },
      { id: "sA", type: "start-event", label: "Go", pool: "pA", lane: "lA" },
      { id: "tA", type: "task", label: "Work", pool: "pA", lane: "lA" },
      { id: "eA", type: "end-event", label: "Done", pool: "pA", lane: "lA" },
      // The second process: a pool, no lanes, its own start → task → end.
      { id: "pB", type: "pool", label: "Nightly", poolType: "white-box" },
      { id: "sB", type: "start-event", label: "Every night", eventType: "timer", pool: "pB" },
      { id: "tB", type: "task", label: "Compile", pool: "pB" },
      { id: "eB", type: "end-event", label: "Compiled", pool: "pB" },
    ] as AiElement[];
    const connections = [
      { sourceId: "sA", targetId: "tA", type: "sequence" },
      { sourceId: "tA", targetId: "eA", type: "sequence" },
      { sourceId: "sB", targetId: "tB", type: "sequence" },
      { sourceId: "tB", targetId: "eB", type: "sequence" },
    ] as AiConnection[];
    const data = layout(elements, connections);
    expect(duplicateIds(data)).toEqual([]);
    for (const id of ["sB", "tB", "eB"]) {
      expect(poolOf(data, data.elements.find((x) => x.id === id)!)?.id, `${id} in the wrong pool`).toBe("pB");
    }
    expect(data.elements.filter((e) => e.parentId === "lA").map((e) => e.id).sort(), "the main lane holds only its own")
      .toEqual(["eA", "sA", "tA"]);
  });

  it("T4361 — a GENUINELY unassigned element (no pool at all) still lands somewhere visible", () => {
    // The fallback exists for a reason — a model that forgets `pool` on a task
    // must not lose it. Narrowing "unassigned" to "no pool" has to keep this.
    const elements = [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "l", type: "lane", label: "Team", pool: "p" },
      { id: "s", type: "start-event", label: "Go", pool: "p", lane: "l" },
      { id: "t", type: "task", label: "Forgot my pool" }, // no pool, no lane
      { id: "e", type: "end-event", label: "Done", pool: "p", lane: "l" },
    ] as AiElement[];
    const connections = [
      { sourceId: "s", targetId: "t", type: "sequence" },
      { sourceId: "t", targetId: "e", type: "sequence" },
    ] as AiConnection[];
    const data = layout(elements, connections);
    expect(duplicateIds(data)).toEqual([]);
    const t = data.elements.find((x) => x.id === "t")!;
    expect(t, "the orphan must still be drawn").toBeDefined();
    expect(t.parentId, "adopted by the first white-box pool's first lane").toBe("l");
  });
});
