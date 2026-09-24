/**
 * Paul, 2026-09-16: "Surround selected with an Expanded Subprocess called X" —
 * room is made in the lane (neighbouring lanes untouched, the pool grows to the
 * right), the EP wraps the selection exactly as it was, the ONE flow in and the
 * ONE flow out are re-pointed at the EP, and a Start / End sit inside it on
 * short straight flows. "Delete selected" on an EP is the exact reverse, and
 * the two round-trip without undo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { resolveSelectionRefs } from "@/app/lib/assist/resolveRef";
import { planWrapInSubprocess, planUnwrapSubprocess, EP_WRAP, type Shape } from "@/app/lib/diagram/subprocessWrap";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramElement, DiagramData, Connector } from "@/app/lib/diagram/types";
import { editorWithApplyLayer } from "./assistApplySource";

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8");
const el = (id: string, type: string, label: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x, y, width: w, height: h, properties: {}, ...extra });
const flow = (id: string, sourceId: string, targetId: string, sourceSide = "right", targetSide = "left"): Connector =>
  ({ id, sourceId, targetId, sourceSide, targetSide, type: "sequence", directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [], sourceOffsetAlong: 0.5, targetOffsetAlong: 0.5 } as Connector);

/** Pool with two lanes; lane 1 holds S → A → B → C → D → E, lane 2 holds F under B (must never move). */
function fixture(): Shape {
  const elements = [
    el("P", "pool", "Warehouse", 0, 0, 1200, 300, { properties: { poolType: "white-box" } }),
    el("L1", "lane", "Picking", 36, 0, 1164, 150, { parentId: "P" }),
    el("L2", "lane", "Packing", 36, 150, 1164, 150, { parentId: "P" }),
    el("S", "start-event", "", 80, 57, 36, 36, { parentId: "L1" }),
    el("A", "task", "Receive", 150, 42, 102, 65, { parentId: "L1" }),
    el("B", "task", "Pick", 300, 42, 102, 65, { parentId: "L1" }),
    el("C", "task", "Check", 450, 42, 102, 65, { parentId: "L1" }),
    el("D", "task", "Pack", 600, 42, 102, 65, { parentId: "L1" }),
    el("E", "end-event", "", 760, 57, 36, 36, { parentId: "L1" }),
    el("F", "task", "Label", 300, 192, 102, 65, { parentId: "L2" }),
  ];
  const connectors = [flow("c0", "S", "A"), flow("c1", "A", "B"), flow("c2", "B", "C"), flow("c3", "C", "D"), flow("c4", "D", "E")];
  return { elements, connectors };
}
const ids = (n: string) => ({ epId: `ep${n}`, startId: `st${n}`, endId: `en${n}`, startConnId: `cs${n}`, endConnId: `ce${n}` });
const byId = (s: Shape) => new Map(s.elements.map((e) => [e.id, e] as const));
const ok = (p: ReturnType<typeof planWrapInSubprocess>) => { if ("error" in p) throw new Error(p.error); return p; };

describe("surround the selection with an expanded subprocess", () => {
  it("T4419 — the grammar, validation, the hold-for-the-rest rule and 'the selected subprocess' as a reference", () => {
    expect(parseCommand("surround selected with an expanded subprocess called Check Stock")).toEqual([{ op: "wrapInSubprocess", label: "Check Stock" }]);
    expect(parseCommand("Surround the selected elements with an Expanded Subprocess called Check Stock.")).toEqual([{ op: "wrapInSubprocess", label: "Check Stock" }]);
    expect(parseCommand("wrap these in a subprocess")).toEqual([{ op: "wrapInSubprocess" }]);
    expect(parseCommand("put an expanded subprocess around the selected elements called Pick")).toEqual([{ op: "wrapInSubprocess", label: "Pick" }]);
    expect(parseCommand("put an expanded subprocess called Pick around these")).toEqual([{ op: "wrapInSubprocess", label: "Pick" }]);
    expect(parseCommand("put a pool around everything"), "the pool wrap is untouched").toEqual([{ op: "wrapInPool" }]);
    expect(parseCommand("unwrap the selected subprocess")).toEqual([{ op: "unwrapSubprocess" }]);
    expect(parseCommand("dissolve the EP")).toEqual([{ op: "unwrapSubprocess" }]);
    expect(parseCommand("delete selected"), "delete stays delete — the editor routes an EP to the unwrap").toEqual([{ op: "delete", ref: "selected" }]);
    expect(validateOps([{ op: "wrapInSubprocess", label: " X " }, { op: "unwrapSubprocess" }])).toEqual([{ op: "wrapInSubprocess", label: "X" }, { op: "unwrapSubprocess" }]);
    for (const s of ["surround selected", "Surround the selected elements", "surround selected with an expanded subprocess called", "unwrap", "wrap these"]) expect(isIncompleteCommand(s), s).toBe(true);
    for (const s of ["surround selected with an expanded subprocess called Check Stock", "unwrap the selected subprocess", "wrap everything in a pool", "wrap these in a subprocess"]) expect(isIncompleteCommand(s), s).toBe(false);
    const els = [el("ep", "subprocess-expanded", "Check", 0, 0, 180, 108), el("sp", "subprocess", "Old", 0, 0, 108, 72), el("t", "task", "T", 0, 0, 102, 65)];
    expect(resolveSelectionRefs("the selected subprocess", els, ["ep", "sp", "t"])).toEqual(["ep", "sp"]);
    expect(resolveSelectionRefs("the selected expanded subprocess", els, ["ep", "sp", "t"])).toEqual(["ep"]);
    expect(resolveSelectionRefs("the selected EP", els, ["ep", "sp", "t"])).toEqual(["ep"]);
  });

  it("T4420 — the plan: room in the lane only, the EP around the group as it was, one flow in / one out re-pointed, Start and End inside; the guards", () => {
    const base = fixture();
    const plan = ok(planWrapInSubprocess(base, ["B", "C"], "Check Stock", ids("1")));
    const m = byId(plan);
    const { PAD_LEFT: L, PAD_RIGHT: R } = EP_WRAP;
    const ep = m.get("ep1")!;
    expect(ep.type).toBe("subprocess-expanded");
    expect(ep.label).toBe("Check Stock");
    expect(ep.parentId, "lives in the selection's lane").toBe("L1");
    expect([ep.x, ep.y, ep.width, ep.height]).toEqual([300, 42 - 36, (552 - 300) + L + R, 65 + 36 + 24]);
    // The group moved right by the Start's share and became the EP's children, as it was.
    expect([m.get("B")!.x, m.get("C")!.x]).toEqual([300 + L, 450 + L]);
    expect([m.get("B")!.y, m.get("C")!.y]).toEqual([42, 42]);
    expect([m.get("B")!.parentId, m.get("C")!.parentId]).toEqual(["ep1", "ep1"]);
    // Everything right of the group in the SAME lane moved by the whole width the shell adds; the left and the other lane did not move.
    expect([m.get("D")!.x, m.get("E")!.x]).toEqual([600 + L + R, 760 + L + R]);
    expect([m.get("S")!.x, m.get("A")!.x, m.get("F")!.x, m.get("F")!.parentId]).toEqual([80, 150, 300, "L2"]);
    expect([m.get("L1")!.width, m.get("L2")!.y], "lanes are not touched by the plan (the editor widens the pools)").toEqual([1164, 150]);
    // Start faces the entry element, End faces the exit element, both on the centre line.
    const st = m.get("st1")!, en = m.get("en1")!;
    expect([st.type, st.parentId, st.x, st.y]).toEqual(["start-event", "ep1", ep.x + EP_WRAP.EVENT_INSET, 74.5 - 18]);
    expect([en.type, en.parentId, en.x, en.y]).toEqual(["end-event", "ep1", ep.x + ep.width - EP_WRAP.EVENT_INSET - 36, 74.5 - 18]);
    // Flows: the one in now enters the EP, the one out now leaves it, the inner one is kept, two short new ones.
    const c = new Map(plan.connectors.map((x) => [x.id, x] as const));
    expect(plan.connectors).toHaveLength(7);
    expect([c.get("c1")!.sourceId, c.get("c1")!.targetId, c.get("c1")!.targetSide]).toEqual(["A", "ep1", "left"]);
    expect([c.get("c3")!.sourceId, c.get("c3")!.targetId, c.get("c3")!.sourceSide]).toEqual(["ep1", "D", "right"]);
    expect([c.get("c2")!.sourceId, c.get("c2")!.targetId]).toEqual(["B", "C"]);
    expect([c.get("cs1")!.sourceId, c.get("cs1")!.targetId, c.get("cs1")!.type]).toEqual(["st1", "B", "sequence"]);
    expect([c.get("ce1")!.sourceId, c.get("ce1")!.targetId]).toEqual(["C", "en1"]);
    expect(c.get("cs1")!.waypoints.length, "routed, not left empty").toBeGreaterThan(1);
    expect(plan.contentRight).toBe(760 + L + R + 36);
    expect(plan.summary).toBe("surrounded 2 elements with the expanded subprocess Check Stock, moving 2 to the right");
    // The EP is drawn beneath its children.
    const order = plan.elements.map((e) => e.id);
    expect(order.indexOf("ep1")).toBeLessThan(order.indexOf("B"));

    // Guards — each names the problem.
    expect(planWrapInSubprocess(base, [], "X", ids("2"))).toEqual({ error: "select the elements to surround first" });
    // A swimlane is still refused: a lane says WHO does the work, so it cannot
    // be moved inside a step of the work. Subprocesses are not refused any more
    // — see T4479.
    expect(planWrapInSubprocess(base, ["L1"], "X", ids("2"))).toMatchObject({ error: expect.stringContaining("can't include a pool or a lane") });
    expect(planWrapInSubprocess(base, ["B", "F"], "X", ids("2"))).toMatchObject({ error: expect.stringContaining("one lane or pool") });
    expect(planWrapInSubprocess(base, ["A", "C"], "X", ids("2")), "two in, two out").toMatchObject({ error: expect.stringContaining("it has 2 in and 2 out") });
    expect(planWrapInSubprocess(base, ["S"], "X", ids("2")), "nothing flows into the start").toMatchObject({ error: expect.stringContaining("it has 0 in and 1 out") });
    const withG = { ...base, elements: [...base.elements, el("G", "task", "Weigh", 450, 80, 102, 65, { parentId: "L1" })] };
    expect(planWrapInSubprocess(withG, ["B", "C"], "X", ids("2")), "an unselected element inside the area is never adopted silently").toMatchObject({ error: expect.stringContaining("Weigh sits in that area") });

    // The reducer applies the plan verbatim and leaves the state alone when the plan fails.
    const state = { ...base, viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData;
    const next = reducer(state, { type: "WRAP_IN_SUBPROCESS", payload: { selectedIds: ["B", "C"], label: "Check Stock", ids: ids("1") } } as never);
    expect(next.elements.find((e) => e.id === "ep1")!.width).toBe(ep.width);
    expect(reducer(state, { type: "WRAP_IN_SUBPROCESS", payload: { selectedIds: ["A", "C"], label: "X", ids: ids("3") } } as never)).toBe(state);
  });

  it("T4421 — 'delete selected' on the EP is the exact reverse: every x, y and parent restored, the flow re-spliced; and it works on an EP the layout engine made", () => {
    const base = fixture();
    const wrapped = ok(planWrapInSubprocess(base, ["B", "C"], "Check Stock", ids("1")));
    const back = ok(planUnwrapSubprocess(wrapped, "ep1"));
    const geo = (s: Shape) => s.elements.map((e) => [e.id, e.x, e.y, e.parentId ?? null]).sort();
    expect(geo(back), "positions and lanes exactly as before the wrap").toEqual(geo(base));
    const c = new Map(back.connectors.map((x) => [x.id, x] as const));
    expect(back.connectors.map((x) => x.id).sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect([c.get("c1")!.sourceId, c.get("c1")!.targetId]).toEqual(["A", "B"]);
    expect([c.get("c3")!.sourceId, c.get("c3")!.targetId]).toEqual(["C", "D"]);
    expect(back.summary).toBe("dissolved Check Stock — its 2 elements are back in the flow");
    // Round trip again, later, with fresh ids: the same shape as the first time.
    const again = ok(planWrapInSubprocess(back, ["B", "C"], "Check Stock", ids("9")));
    const e1 = byId(wrapped).get("ep1")!, e9 = byId(again).get("ep9")!;
    expect([e9.x, e9.y, e9.width, e9.height]).toEqual([e1.x, e1.y, e1.width, e1.height]);
    expect(geo(ok(planUnwrapSubprocess(again, "ep9")))).toEqual(geo(base));
    // The reducer path.
    const state = { ...wrapped, viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData;
    expect(reducer(state, { type: "UNWRAP_SUBPROCESS", payload: { epId: "ep1" } } as never).elements.find((e) => e.id === "D")!.x).toBe(600);
    // Guards.
    expect(planUnwrapSubprocess(base, "B")).toEqual({ error: "select an expanded subprocess first" });
    const empty = { ...base, elements: [...base.elements, el("epx", "subprocess-expanded", "Empty", 900, 20, 180, 108, { parentId: "L1" })] };
    expect(planUnwrapSubprocess(empty, "epx")).toEqual({ error: "Empty has nothing inside it" });

    // An EP that did not come from "surround" (no Start/End, its own padding): the
    // flow re-enters at the leftmost element and leaves from the rightmost, and
    // the room the shell used is still given back.
    const foreign: Shape = {
      elements: [
        el("X", "task", "Before", 0, 40, 102, 65), el("Y", "task", "After", 700, 40, 102, 65),
        el("ep", "subprocess-expanded", "Made", 200, 6, 380, 133),
        el("A2", "task", "One", 224, 40, 102, 65, { parentId: "ep" }), el("B2", "task", "Two", 400, 40, 102, 65, { parentId: "ep" }),
      ],
      connectors: [flow("k1", "X", "ep"), flow("k2", "A2", "B2"), flow("k3", "ep", "Y")],
    };
    const out = ok(planUnwrapSubprocess(foreign, "ep"));
    const fm = byId(out);
    expect(fm.has("ep")).toBe(false);
    expect([fm.get("A2")!.x, fm.get("B2")!.x, fm.get("A2")!.parentId ?? null], "contents slide to where the shell's left edge was").toEqual([200, 376, null]);
    expect(fm.get("Y")!.x, "the element after moves left by the width the shell added").toBe(700 - (380 - (502 - 224)));
    const fc = new Map(out.connectors.map((x) => [x.id, x] as const));
    expect([fc.get("k1")!.targetId, fc.get("k3")!.sourceId]).toEqual(["A2", "B2"]);
  });

  it("T4422 — the editor wires both: the op handlers, 'delete' routing an EP with contents to the unwrap, the reducer cases, the AI prompt and the card", () => {
    const ed = editorWithApplyLayer();
    expect(ed).toContain('if (op.op === "wrapInSubprocess") {');
    expect(ed).toContain("const plan = planWrapInSubprocess({ elements: els, connectors: data.connectors }, selectedIds, label, ids);");
    expect(ed).toContain("wrapInSubprocess([...selectedIds], label, ids);");
    expect(ed, "the pools widen to fit the room taken").toContain("if (els.some((e) => e.type === \"pool\" && e.x + e.width < plan.contentRight + 40)) extendPools();");
    expect(ed).toContain('if (op.op === "unwrapSubprocess") {');
    expect(ed, "delete of an EP with contents dissolves it").toContain('if (e.type === "subprocess-expanded" && els.some((k) => k.parentId === e.id)) { if (!unwrapEp(e)) anyFail = true; continue; }');
    expect(ed.match(/setSelectedElementIds\(new Set\(\)\); \/\/ selection protocol/g)?.length ?? 0, "neither leaves anything selected").toBeGreaterThanOrEqual(2);
    const hook = read("app", "hooks", "useDiagram.ts");
    expect(hook).toContain('case "WRAP_IN_SUBPROCESS": {');
    expect(hook).toContain('case "UNWRAP_SUBPROCESS": {');
    expect(hook).toMatch(/const plan = planWrapInSubprocess\(state, action\.payload\.selectedIds, action\.payload\.label, action\.payload\.ids\);\s*if \("error" in plan\) return state;/);
    const route = read("app", "api", "ai", "command", "route.ts");
    expect(route).toContain('{ "op":"wrapInSubprocess"');
    expect(route).toContain('{ "op":"unwrapSubprocess"');
    expect(route).toContain("surround selected with an expanded subprocess called <name>");
    const card = read("app", "lib", "assist", "commandCatalog.ts");
    expect(card).toContain("surround selected with an expanded subprocess called Check Stock");
    expect(card).toContain("unwrap the selected subprocess");
  });
});
