/**
 * T5224 — "collapse this subprocess to a new diagram" (Paul, 2026-10-03).
 *
 * The expanded subprocess's interior moves into a NEW linked BPMN diagram: named after the EP (made unique with " (n)"),
 * one white-box pool with the default name and no lanes, the Event EPs stacked down its left, everything else to their
 * right; the EP becomes a collapsed subprocess linked to it. Undo puts the EP back and drops the link — the new diagram stays.
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { needsConfirmation } from "@/app/lib/assist/confirm";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { buildCollapsedEpDiagram, COLLAPSED_POOL_NAME, uniqueDiagramName } from "@/app/lib/diagram/epToDiagram";
import { reducer } from "@/app/hooks/useDiagram";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label = "", parentId?: string, props: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: props, ...(parentId ? { parentId } : {}) }) as DiagramElement;

/** EP "Review" holding Start → Check → End, plus TWO Event EPs (the lower one listed first). */
function world(): DiagramData {
  return {
    ...EMPTY_DIAGRAM,
    elements: [
      el("EP", "subprocess-expanded", 300, 100, 700, 500, "Review"),
      el("s", "start-event", 340, 160, 36, 36, "", "EP"),
      el("t", "task", 420, 150, 102, 65, "Check", "EP"),
      el("e", "end-event", 570, 160, 36, 36, "", "EP"),
      el("evB", "subprocess-expanded", 650, 420, 260, 140, "Cancelled", "EP", { subprocessType: "event" }),
      el("evBs", "start-event", 670, 470, 36, 36, "Event occurs", "evB"),
      el("evA", "subprocess-expanded", 650, 250, 260, 140, "Timeout", "EP", { subprocessType: "event" }),
      el("evAs", "start-event", 670, 300, 36, 36, "Event occurs", "evA"),
    ],
    connectors: [{ id: "c1", sourceId: "s", targetId: "t", type: "sequence", directionType: "directed", routingType: "rectilinear", sourceSide: "right", targetSide: "left", waypoints: [] } as never],
  };
}

describe("T5224 the new diagram's name", () => {
  it("is the EP's name, with (n) when it is taken", () => {
    expect(uniqueDiagramName("Review", ["Other"])).toBe("Review");
    expect(uniqueDiagramName("Review", ["review"])).toBe("Review (2)");
    expect(uniqueDiagramName("Review", ["Review", "Review (2)"])).toBe("Review (3)");
    expect(uniqueDiagramName("  ", [])).toBe("Subprocess");
  });
});

describe("T5224 what goes into the new diagram", () => {
  const d = buildCollapsedEpDiagram(world(), "EP")!;
  const get = (id: string) => d.elements.find((e) => e.id === id)!;
  const pool = d.elements.find((e) => e.type === "pool")!;

  it("one white-box pool with the default name and NO lanes", () => {
    expect(d.elements.filter((e) => e.type === "pool")).toHaveLength(1);
    expect(pool.label).toBe(COLLAPSED_POOL_NAME);
    expect(pool.properties?.poolType).toBe("white-box");
    expect(d.elements.some((e) => e.type === "lane" || e.type === "sublane")).toBe(false);
  });
  it("everything that was in the EP is in the pool; the EP itself is not copied", () => {
    expect(d.elements.some((e) => e.id === "EP")).toBe(false);
    for (const id of ["s", "t", "e", "evA", "evB"]) expect(get(id).parentId).toBe(pool.id);
    expect(get("evAs").parentId).toBe("evA");
    for (const e of d.elements.filter((x) => x.id !== pool.id)) {
      const box = pool; expect(e.x).toBeGreaterThanOrEqual(box.x); expect(e.y).toBeGreaterThanOrEqual(box.y);
      expect(e.x + e.width).toBeLessThanOrEqual(box.x + box.width); expect(e.y + e.height).toBeLessThanOrEqual(box.y + box.height);
    }
  });
  it("the main flow is laid out as if the Event EPs were not there — top left of the pool, relative positions kept", () => {
    const flow = ["s", "t", "e"].map(get);
    expect(Math.min(...flow.map((e) => e.y))).toBe(30);                 // PAD from the pool's top
    expect(get("t").x - get("s").x).toBe(420 - 340);
    expect(get("e").x - get("t").x).toBe(570 - 420);
    expect(get("t").y - get("s").y).toBe(150 - 160);
  });
  it("the Event EPs are UNDER the main flow, one under another, left-justified, in their original order; the pool grew to hold them", () => {
    const flowBottom = Math.max(...["s", "t", "e"].map(get).map((e) => e.y + e.height));
    expect(get("evA").y).toBeGreaterThanOrEqual(flowBottom);
    expect(get("evB").y).toBeGreaterThanOrEqual(get("evA").y + get("evA").height);
    expect(get("evA").x).toBe(get("evB").x);
    expect(get("evA").x).toBe(get("s").x);                             // left-justified with the flow
    expect(pool.height).toBeGreaterThanOrEqual(get("evB").y + get("evB").height);
  });
  it("what is in an Event EP moves with it", () => {
    expect(get("evAs").x - get("evA").x).toBe(670 - 650);
    expect(get("evAs").y - get("evA").y).toBe(300 - 250);
  });
  it("the connector between them is kept; nothing else is invented", () => {
    expect(d.connectors).toHaveLength(1);
    expect(d.connectors[0].sourceId).toBe("s");
  });
  it("an EP with nothing inside, or a non-EP, builds nothing", () => {
    const w = world(); w.elements = w.elements.filter((e) => e.id === "EP");
    expect(buildCollapsedEpDiagram(w, "EP")).toBeNull();
    expect(buildCollapsedEpDiagram(world(), "t")).toBeNull();
  });
  it("with no Event EP the flow starts at the left of the pool", () => {
    const w = world(); w.elements = w.elements.filter((e) => !["evA", "evB", "evAs", "evBs"].includes(e.id));
    const n = buildCollapsedEpDiagram(w, "EP")!;
    const p = n.elements.find((e) => e.type === "pool")!;
    expect(Math.min(...n.elements.filter((e) => e.id !== p.id).map((e) => e.x))).toBeLessThan(p.x + 100);
  });
});

describe("T5224 the canvas side, and Undo", () => {
  it("the EP becomes a collapsed subprocess linked to the new diagram; the interior leaves", () => {
    const next = reducer(world(), { type: "CONVERT_EP_TO_SUBPROCESS", payload: { id: "EP", linkedDiagramId: "D2" } } as never);
    const ep = next.elements.find((e) => e.id === "EP")!;
    expect(ep.type).toBe("subprocess");
    expect(ep.properties?.linkedDiagramId).toBe("D2");
    expect(next.elements.map((e) => e.id)).toEqual(["EP"]);
  });
  it("Undo is the saved snapshot: the EP, its interior, and no link (the new diagram is not touched)", () => {
    const before = world();
    const snapshot = JSON.parse(JSON.stringify(before));       // what pushHistory(snapshotData()) keeps
    const after = reducer(before, { type: "CONVERT_EP_TO_SUBPROCESS", payload: { id: "EP", linkedDiagramId: "D2" } } as never);
    expect(after.elements.length).toBeLessThan(snapshot.elements.length);
    expect(snapshot.elements.find((e: DiagramElement) => e.id === "EP").type).toBe("subprocess-expanded");
    expect(snapshot.elements.find((e: DiagramElement) => e.id === "EP").properties?.linkedDiagramId).toBeUndefined();
  });
});

describe("T5224 “called <new diagram name>”, the Help popup, the back-link marker", () => {
  it("“… called X” names the new diagram (title-cased), and is optional", () => {
    expect(parseCommand("collapse this subprocess to a new diagram called handle error process")).toEqual([{ op: "collapseToDiagram", label: "handle error process" }]);
    expect(parseCommand("move this into a new diagram named Cancel Order")).toEqual([{ op: "collapseToDiagram", label: "Cancel Order" }]);
    expect(parseCommand("collapse this subprocess to a new diagram")).toEqual([{ op: "collapseToDiagram" }]);
  });
  it("the question and the hook carry the name", () => {
    const ask = needsConfirmation([{ op: "collapseToDiagram", label: "Cancel Order" }], world().elements, null, ["EP"]);
    expect(ask?.what).toMatch(/called “Cancel Order”/);
    const h = headlessDiagram(world());
    const ctx = h.context({ selectedIds: ["EP"] });
    const seen: Array<[string, string | undefined]> = [];
    ctx.refs.collapseEpRef = { current: (id: string, name?: string) => { seen.push([id, name]); } };
    const r = applyAssistOps([{ op: "collapseToDiagram", label: "cancel order" }], ctx);
    expect(r.ok, r.summary).toBe(true);
    expect(seen).toEqual([["EP", "Cancel Order"]]);
  });
  it("the Help popup lists “collapse” as its own word when an expanded subprocess is selected", async () => {
    const { resolveAssistHelp } = await import("@/app/lib/assist/commandTree");
    const { computePanel } = await import("@/app/lib/assist/commandTree");
    const tree = resolveAssistHelp({ patterns: null, conventions: null }).tree!;
    const view = computePanel(tree, { interim: "", ghost: false, flow: null, selectedKinds: ["expanded-subprocess"] });
    expect(view.groups?.map((g) => g.main)).toContain("collapse");
    const next = computePanel(tree, { interim: "collapse this subprocess to a new diagram", ghost: false, flow: null, selectedKinds: ["expanded-subprocess"] });
    expect(next.lines.join(" ")).toMatch(/called|named/);
  });
  it("the Start of an Event EP never carries the back-link marker", async () => {
    const { findDrillBackAnchor } = await import("@/app/lib/diagram/drillBackAnchor");
    const els = [
      el("evB", "subprocess-expanded", 10, 10, 260, 140, "Cancelled", undefined, { subprocessType: "event" }),
      el("evBs", "start-event", 30, 30, 36, 36, "Event occurs", "evB"),
      el("s", "start-event", 400, 400, 36, 36),
    ];
    expect(findDrillBackAnchor(els, [], "bpmn")).toBe("s");
  });
  it("the back-link chevrons are drawn twice the size", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/components/canvas/SymbolRenderer.tsx", "utf8");
    expect(src).toMatch(/translate\(\$\{element\.x - 2\},\$\{element\.y - 2\}\) scale\(2\)/);
  });
});

describe("T5224 by voice", () => {
  it("the words parse to collapseToDiagram", () => {
    for (const s of ["collapse this subprocess to a new diagram", "Collapse this expanded subprocess into a new diagram", "move this into a new diagram",
      "convert this subprocess to a linked diagram", "collapse the selected subprocess into its own diagram", "move it to a new diagram"]) {
      expect(parseCommand(s), s).toEqual([{ op: "collapseToDiagram" }]);
    }
  });
  it("other collapse / move phrasings are NOT taken for it", () => {
    expect(parseCommand("compress the pool")?.[0]?.op).not.toBe("collapseToDiagram");
    expect(parseCommand("move this left")?.[0]?.op).not.toBe("collapseToDiagram");
    expect(parseCommand("convert this to a subprocess")?.[0]?.op).not.toBe("collapseToDiagram");
  });
  it("it asks first, naming the selected EP", () => {
    const ask = needsConfirmation([{ op: "collapseToDiagram" }], world().elements, null, ["EP"]);
    expect(ask?.what).toMatch(/Review/);
    expect(ask?.what).toMatch(/new linked diagram/);
  });
  it("it starts the collapse on the selected EP (and only through the editor's hook)", () => {
    const h = headlessDiagram(world());
    const ctx = h.context({ selectedIds: ["EP"] });
    const called: string[] = [];
    ctx.refs.collapseEpRef = { current: (id: string) => { called.push(id); } };
    const r = applyAssistOps([{ op: "collapseToDiagram" }], ctx);
    expect(r.ok, r.summary).toBe(true);
    expect(called).toEqual(["EP"]);
  });
  it("without the hook (the phone), a task, an empty EP: it says why and does nothing", () => {
    const h = headlessDiagram(world());
    const r1 = applyAssistOps([{ op: "collapseToDiagram" }], h.context({ selectedIds: ["EP"] }));
    expect(r1.ok).toBe(false);
    expect(r1.summary).toMatch(/not available/);
    const ctx2 = h.context({ selectedIds: ["t"] }); ctx2.refs.collapseEpRef = { current: () => { throw new Error("must not run"); } };
    expect(applyAssistOps([{ op: "collapseToDiagram" }], ctx2).ok).toBe(false);
    const w = world(); w.elements = w.elements.filter((e) => e.id === "EP");
    const ctx3 = headlessDiagram(w).context({ selectedIds: ["EP"] }); ctx3.refs.collapseEpRef = { current: () => { throw new Error("must not run"); } };
    const r3 = applyAssistOps([{ op: "collapseToDiagram" }], ctx3);
    expect(r3.ok).toBe(false);
    expect(r3.summary).toMatch(/empty/);
  });
});
