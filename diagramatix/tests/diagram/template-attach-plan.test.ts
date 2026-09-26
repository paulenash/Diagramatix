/**
 * T4846–T4855 — where an attached template goes, how it is joined, and how
 * the window swaps one pick for the next without leaving anything behind.
 *
 * Paul, 2026-09-25: "It should allow user to select a template then place the
 * selected template After the selected gateway." The placement is the mouse
 * attach's, moved into app/lib/diagram/templateAttach.ts so voice and mouse
 * cannot place a template differently; the join is drawn by the reducer's own
 * ADD_CONNECTOR inside APPLY_TEMPLATE; and the window's swap (templatePreview.ts)
 * restores the diagram the first pick was applied to rather than undoing and
 * applying in one tick — which put two templates on the diagram at the third
 * number and left the first behind after "cancel".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import { templateAttachData } from "@/app/lib/diagram/templates";
import {
  planTemplateAttach, checkTemplateAttach, planTemplateShow, whyTemplateCantFollow,
  type TemplateAttachPlan, type TemplateJoin,
} from "@/app/lib/diagram/templateAttach";
import {
  noteProduced, isStillShowing, isTemplateOnDiagram, previewBase, templateApplyHistory,
  runTemplateApply, runTemplateRemove,
  type ShownTemplate, type TemplateApplySteps, type TemplateIds, type TemplateSnapshot,
} from "@/app/lib/diagram/templatePreview";
import { planBoundaryFollowOn, HALF_TASK_W } from "@/app/lib/diagram/assistPlacement";
import { isLaneUnowned } from "@/app/lib/diagram/containment";
import { canAttachInline, templatesToOffer, hiddenTemplatesNote, templateWindowSummary } from "@/app/lib/assist/templatePick";
import { builtinTemplate, builtinTemplates } from "./_helpers/builtinTemplates";
import { paulsDiagram as boundaryDiagram } from "../routing/_helpers/block2Test3";
import type { Connector, DiagramData, DiagramElement, TemplateData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => ({ properties: {}, label: "", ...o }) as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");

/** Paul's Block 2 Test 3 diagram when he said "add template after selected". */
const paulsDiagram = () =>
  JSON.parse(readFileSync("tests/fixtures/block2-test3-template.json", "utf8")) as DiagramData;
const MERGE = "5njpff19";          // the merge gateway he had selected (nothing going out)
const DECISION = "qdzrmzy2";       // "Is it in stock?" — three branches out
const CHECK_STOCK = "opimkfkp";
const WAREHOUSE = "i3c0s3q2";

const plan = (t: TemplateData, anchorId: string, d: DiagramData): TemplateAttachPlan => {
  const p = planTemplateAttach(t, anchorId, d);
  if ("error" in p) throw new Error(p.error);
  return p;
};
const at = (d: { elements: DiagramElement[] }, id: string) => d.elements.find((e) => e.id === id)!;
const cy = (e: DiagramElement) => e.y + e.height / 2;

describe("T4846 — a template enters by a flow node with no sequence flow in (templateAttachData, hardened)", () => {
  const entryOf = (name: string) => {
    const a = templateAttachData(builtinTemplate(name));
    if (!a) return null;
    const e = a.data.elements.find((x) => x.id === a.entryId)!;
    return `${e.type} ${e.label}`;
  };

  it("a data object or an event sub-process is never the entry", () => {
    // Before: "Data Input / Output" entered by its data object and "Perform
    // Regular Task" by its event sub-process, and ADD_CONNECTOR refused both
    // joins with the template already placed.
    expect(entryOf("Data Input / Output")).toBe("task Transform");
    expect(entryOf("Perform Regular Task")).toBeNull();
    expect(entryOf("Automated Process"), "a pool template has nothing inline to join").toBeNull();
  });

  it("a start event with one flow out is still dropped, and a loop enters at its leftmost step", () => {
    expect(entryOf("Single Approval")).toBe("task Submit");
    expect(entryOf("Rework Loop")).toBe("task Do work");
    expect(entryOf("Approval with Rework Loop")).toBe("task Draft");
    expect(entryOf("Exclusive (XOR) Decision")).toBe("task Assess");
  });

  it("every other built-in keeps the entry it had", () => {
    // The old rule, for comparison: the first element with no incoming
    // connector of any kind, else the leftmost.
    const oldEntry = (t: TemplateData) => {
      const inc = new Set(t.connectors.map((c) => c.targetId));
      let e = t.elements.find((x) => !inc.has(x.id)) ?? [...t.elements].sort((a, b) => a.x - b.x)[0];
      if (e.type === "start-event") {
        const out = t.connectors.filter((c) => c.sourceId === e.id);
        if (out.length === 1) e = t.elements.find((x) => x.id === out[0].targetId) ?? e;
      }
      return e.id;
    };
    const changed = builtinTemplates().filter((t) => {
      const a = templateAttachData(t.data);
      return (a?.entryId ?? null) !== oldEntry(t.data);
    }).map((t) => t.name).sort();
    // Data Input / Output now enters at its task; Perform Regular Task and
    // Non-Interrupting Subprocess (event sub-processes only) have no entry;
    // Non-Interruptible Process Pattern enters at its subprocess, not at a
    // task INSIDE it (a flow from outside could never reach that); the rest
    // bring a pool of their own and are never attached inline at all.
    expect(changed).toEqual([
      "Automated Process", "Data Input / Output", "Initial Multi-Lane Process (2 Lanes)",
      "More Complex Document Request Loop", "Non-Interruptible Process Pattern",
      "Non-Interrupting Subprocess", "Perform Regular Task", "Simple Document Request Loop",
    ].sort());
    expect(entryOf("Non-Interruptible Process Pattern")).toBe("subprocess-expanded Main Subprocess");
  });
});

describe("T4847 — after Paul's merge gateway: inline, joined, in Warehouse", () => {
  const d = paulsDiagram();
  const gw = at(d, MERGE);
  const p = plan(builtinTemplate("Single Approval"), MERGE, d);
  const entry = p.elements.find((e) => e.id === p.entryId)!;

  it("the entry sits ½ Task width right of the gateway, centres aligned — the mouse's maths", () => {
    expect(entry.label).toBe("Submit");
    expect(p.elements.some((e) => e.type === "start-event"), "the template's start event is dropped").toBe(false);
    expect(entry.x).toBeCloseTo(gw.x + gw.width + HALF_TASK_W, 6);
    expect(cy(entry)).toBeCloseTo(cy(gw), 6);
    expect(Math.round(entry.x)).toBe(646);
    expect(Math.round(entry.y)).toBe(107);
  });

  it("the reducer places it inside Warehouse, grows the lane, and draws ONE join from the gateway", () => {
    const c = checkTemplateAttach(d, p);
    expect("error" in c ? c.error : null).toBeNull();
    const after = (c as { after: DiagramData }).after;
    for (const id of p.newIds) expect(at(after, id).parentId, at(after, id).label).toBe(WAREHOUSE);
    const lane = at(after, WAREHOUSE);
    expect(at(d, WAREHOUSE).height).toBeCloseTo(116.43, 1);
    expect(lane.height, "Warehouse grows to take the Rejected end").toBeGreaterThan(200);
    for (const id of p.newIds) {
      const e = at(after, id);
      expect(e.y + e.height, e.label).toBeLessThanOrEqual(lane.y + lane.height);
    }
    const added = after.connectors.filter((x) => !d.connectors.some((b) => b.id === x.id) && !p.connectors.some((t) => t.id === x.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ type: "sequence", sourceId: MERGE, targetId: p.entryId, sourceSide: "right", targetSide: "left", sourceOffsetAlong: 0.5 });
    expect(added[0].waypoints.length).toBeGreaterThan(2);
    expect(after.elements.some((e) => /^template$/i.test(e.label ?? ""))).toBe(false);
  });
});

describe("T4848 — the same placement the mouse attach made before it moved (task anchor, decision gateway)", () => {
  const d = paulsDiagram();

  it("after Check stock the fragment is nudged clear as one box, exactly as before", () => {
    const p = plan(builtinTemplate("Single Approval"), CHECK_STOCK, d);
    const entry = p.elements.find((e) => e.id === p.entryId)!;
    expect([Math.round(entry.x), Math.round(entry.y)]).toEqual([320, 391]);
    expect("error" in checkTemplateAttach(d, p)).toBe(false);
  });

  it("after a decision gateway with three branches it is INLINE — no fan-out (the verdict's blocker)", () => {
    const p = plan(builtinTemplate("Single Approval"), DECISION, d);
    const entry = p.elements.find((e) => e.id === p.entryId)!;
    // A fan-out row put Submit at (667,-89), between two pools, and the dry
    // run passed because the join existed. Inline, as the mouse always did:
    expect([Math.round(entry.x), Math.round(entry.y)]).toEqual([686, 107]);
    const c = checkTemplateAttach(d, p);
    expect("error" in c ? c.error : null).toBeNull();
    for (const id of p.newIds) expect(at((c as { after: DiagramData }).after, id).parentId).toBe(WAREHOUSE);
  });
});

describe("T4849 — after a boundary event: R7, the outer face, the host's own lane", () => {
  it("Paul's Event 4: below-right of the event, joined from its bottom point, in Sales — never in the subprocess", () => {
    const d = boundaryDiagram();
    const ev = at(d, "ev4");
    const p = plan(builtinTemplate("Single Approval"), "ev4", d);
    const entry = p.elements.find((e) => e.id === p.entryId)!;
    const want = planBoundaryFollowOn(ev, d.elements, entry.width, entry.height, []).center;
    expect(entry.x + entry.width / 2).toBeCloseTo(want.x, 6);
    expect(cy(entry)).toBeCloseTo(want.y, 6);
    for (const e of p.elements) expect(e.parentId, e.label).toBe("sales");

    const c = checkTemplateAttach(d, p);
    expect("error" in c ? c.error : null).toBeNull();
    const after = (c as { after: DiagramData }).after;
    // Placed below Sales' floor, it STAYS in Sales and Sales grows round it
    // (R7.07) — the lane pass used to hand it to Marketing, and the join ran
    // down across the lane line.
    const sales = at(after, "sales");
    for (const id of p.newIds) {
      const e = at(after, id);
      expect(e.parentId, e.label).toBe("sales");
      expect(e.y + e.height, e.label).toBeLessThanOrEqual(sales.y + sales.height);
    }
    expect(at(after, "marketing").y, "the lane below moves down").toBeGreaterThan(at(d, "marketing").y);
    expect(at(after, "rework").height, "the host does not grow round it").toBe(at(d, "rework").height);
    const join = after.connectors.find((x) => x.sourceId === "ev4" && x.targetId === p.entryId)!;
    expect(join).toMatchObject({ sourceSide: "bottom", sourceOffsetAlong: 0.5, targetSide: "left" });
    expect(join.waypoints[1].y, "the first visible point is below the event").toBeGreaterThan(ev.y + ev.height - 0.01);
  });
});

describe("T4850 — refused with the real reason, never placed half-joined", () => {
  it("an anchor no template can follow", () => {
    const d = boundaryDiagram();
    expect(planTemplateAttach(builtinTemplate("Single Approval"), "draft", d))
      .toEqual({ error: "templates can’t be attached inside an expanded subprocess yet", blame: "anchor" });
    expect(whyTemplateCantFollow(at(d, "draft"), d.elements)).toBe("templates can’t be attached inside an expanded subprocess yet");
    const withEnd = { ...d, elements: [...d.elements, E({ id: "end", type: "end-event", label: "Done", x: 1800, y: 130, width: 36, height: 36, parentId: "sales" })] };
    expect(whyTemplateCantFollow(at(withEnd, "end"), withEnd.elements)).toBe("a template can’t follow “Done” — no sequence flow can leave it");
    expect(whyTemplateCantFollow(at(d, "sales"), d.elements), "a lane is not a flow node").toContain("no sequence flow can leave it");
  });

  it("a template with nothing to join, or its own pool", () => {
    const d = paulsDiagram();
    expect(planTemplateAttach(builtinTemplate("Perform Regular Task"), MERGE, d))
      .toEqual({ error: "it has no step a sequence flow can enter", blame: "template" });
    expect(planTemplateAttach(builtinTemplate("Simple Document Request Loop"), MERGE, d))
      .toEqual({ error: "it brings a pool or lane of its own", blame: "template" });
  });

  it("a template reaching above its lane is no longer refused: the lane grows at its top, the join stays level (issue 6)", () => {
    // It was: "“Expanded 1” would stick out above “Warehouse”" — the lane only
    // grew down. Now Warehouse makes room at its top and its content moves
    // down with the template, so the gateway and the entry stay level.
    const d = paulsDiagram();
    const p = plan(builtinTemplate("Expanded Subprocess Template"), MERGE, d);
    const c = checkTemplateAttach(d, p);
    expect("error" in c ? c.error : null).toBeNull();
    const after = (c as { after: DiagramData }).after;
    expect(cy(at(after, p.entryId))).toBeCloseTo(cy(at(after, MERGE)), 6);
  });

  it("a loose anchor beside a pool: the fragment lands in the pool, away from its anchor, and says so", () => {
    // One piece, by overlap: the fragment lies over "Us" and goes into it
    // (it used to be refused as sticking out of Us's left edge); a join from
    // a task outside every pool into it is not one the rules draw.
    const d: DiagramData = {
      elements: [
        E({ id: "P", type: "pool", label: "Us", x: 300, y: 0, width: 800, height: 300, properties: { poolType: "white-box" } }),
        E({ id: "L", type: "lane", label: "Lane 1", x: 336, y: 0, width: 764, height: 300, parentId: "P" }),
        E({ id: "t", type: "task", label: "Loose", x: 100, y: 100, width: 102, height: 64 }),
      ],
      connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
    } as DiagramData;
    expect(whyTemplateCantFollow(at(d, "t"), d.elements), "a flow can leave it").toBeNull();
    const c = checkTemplateAttach(d, plan(builtinTemplate("Single Approval"), "t", d));
    expect("error" in c ? c.error : null).toBe("“Submit” would land in “Us”, away from “Loose”");
  });
});

describe("T4851 — APPLY_TEMPLATE draws the join with ADD_CONNECTOR's own rules, in the same action", () => {
  const d = paulsDiagram();
  const p = plan(builtinTemplate("Single Approval"), MERGE, d);
  const strip = (cs: Connector[]) => cs.map(({ id: _id, ...rest }) => rest);

  it("identical to placing the template and then connecting — minus the second undo entry", () => {
    const one = reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: p.elements, connectors: p.connectors, join: p.join } });
    const placed = reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: p.elements, connectors: p.connectors } });
    const two = reducer(placed, {
      type: "ADD_CONNECTOR",
      payload: { sourceId: MERGE, targetId: p.entryId, connectorType: "sequence", directionType: "directed", routingType: "rectilinear", sourceSide: "right", targetSide: "left" },
    });
    expect(one.elements).toEqual(two.elements);
    expect(strip(one.connectors)).toEqual(strip(two.connectors));
  });

  it("a join the rules refuse is not drawn; the template is still placed", () => {
    const withEnd = { ...d, elements: [...d.elements, E({ id: "end", type: "end-event", label: "Done", x: 600, y: 300, width: 36, height: 36, parentId: WAREHOUSE })] };
    const join: TemplateJoin = { sourceId: "end", targetId: p.entryId };
    const after = reducer(withEnd, { type: "APPLY_TEMPLATE", payload: { elements: p.elements, connectors: p.connectors, join } });
    for (const id of p.newIds) expect(at(after, id)).toBeTruthy();
    expect(after.connectors).toHaveLength(withEnd.connectors.length + p.connectors.length);
  });

  it("a parent the caller gave is kept, and that lane grows round the element", () => {
    const b = boundaryDiagram();
    const task = E({ id: "x", type: "task", label: "Below Sales", x: 1500, y: 290, width: 102, height: 64, parentId: "sales" });
    const after = reducer(b, { type: "APPLY_TEMPLATE", payload: { elements: [task], connectors: [] } });
    expect(at(after, "x").parentId).toBe("sales");
    const sales = at(after, "sales");
    expect(sales.y + sales.height).toBeGreaterThanOrEqual(290 + 64);
  });
});

describe("T4852 — each pick is planned on the diagram WITHOUT the pick before it", () => {
  it("planned over the old preview it is nudged away from it; planned on the base it lands where the first did", () => {
    const d = paulsDiagram();
    const first = plan(builtinTemplate("Single Approval"), MERGE, d);
    const withFirst = reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: first.elements, connectors: first.connectors, join: first.join } });
    const entryOf = (q: TemplateAttachPlan) => q.elements.find((e) => e.id === q.entryId)!;
    const onBase = plan(builtinTemplate("Rework Loop"), MERGE, d);
    const overOld = plan(builtinTemplate("Rework Loop"), MERGE, withFirst);
    expect([entryOf(onBase).x, entryOf(onBase).y]).toEqual([entryOf(first).x, entryOf(first).y]);
    expect([entryOf(overOld).x, entryOf(overOld).y]).not.toEqual([entryOf(first).x, entryOf(first).y]);
  });

  it("previewBase: restore while showing, strip when changed, fresh when gone", () => {
    const d = paulsDiagram();
    const base = { elements: d.elements, connectors: d.connectors };
    const p = plan(builtinTemplate("Single Approval"), MERGE, d);
    const shown = reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: p.elements, connectors: p.connectors, join: p.join } });
    const ids: TemplateIds = { elements: [...p.newIds], connectors: p.connectors.map((c) => c.id) };
    expect(previewBase({ base, ids }, true, shown)).toEqual({ mode: "restore", base });
    const stripped = previewBase({ base, ids }, false, shown);
    expect(stripped.mode).toBe("strip");
    expect(isTemplateOnDiagram(ids, stripped.base.elements)).toBe(false);
    expect(stripped.base.connectors.some((c) => c.sourceId === MERGE && ids.elements.includes(c.targetId)), "the join goes too").toBe(false);
    expect(stripped.base.elements.map((e) => e.id).sort()).toEqual(d.elements.map((e) => e.id).sort());
    expect(previewBase({ base, ids }, false, base)).toEqual({ mode: "fresh", base });
    expect(previewBase(null, false, shown)).toEqual({ mode: "fresh", base: shown });
  });
});

/**
 * useDiagram's history, as a model: the reducer's state, the last RENDERED
 * state (dataRef — the snapshot every helper reads), and the past stack. The
 * steps are the hook's own — runTemplateApply, runTemplateRemove, noteProduced,
 * isStillShowing — and the window's are planTemplateShow's. What is modelled
 * by hand is only React: a dispatch updates the state, and nothing is seen
 * until a render.
 */
function hookModel(initial: DiagramData) {
  let state = initial;
  let rendered = initial;
  const past: TemplateSnapshot[] = [];
  let shown: ShownTemplate | null = null;
  let stamps = 0;
  const snap = (): TemplateSnapshot => ({ elements: rendered.elements, connectors: rendered.connectors });
  const dispatch = (a: Action) => { state = reducer(state, a); };
  return {
    get data() { return rendered; },
    past,
    render() { rendered = state; noteProduced(shown, rendered); },
    applyTemplate(elements: DiagramElement[], connectors: Connector[], opts: { join?: TemplateJoin; over?: { base: TemplateSnapshot; entry: "kept" | "new" } } = {}) {
      const stamp = ++stamps;
      runTemplateApply(opts.over, stamp, {
        snapshot: snap,
        pushHistory: (s) => { past.push(s); },
        topOfHistory: () => past[past.length - 1],
        record: (s) => { shown = s; },
        restore: (s) => dispatch({ type: "SET_DATA", payload: { ...rendered, elements: s.elements, connectors: s.connectors } }),
        apply: () => dispatch({ type: "APPLY_TEMPLATE", payload: { elements, connectors, ...(opts.join ? { join: opts.join } : {}) } }),
      });
      return stamp;
    },
    stillShowing: (stamp: number) => isStillShowing(shown, stamp, rendered, past[past.length - 1]),
    undo() {
      const s = past.pop();
      if (s) dispatch({ type: "SET_DATA", payload: { ...rendered, elements: s.elements, connectors: s.connectors } });
    },
    /** A co-author's merge: the data replaced and the history cleared (useDiagram's setData). */
    setData(next: DiagramData) { past.length = 0; dispatch({ type: "SET_DATA", payload: next }); },
    removeTemplate(ids: TemplateIds) {
      runTemplateRemove(ids, {
        snapshot: snap,
        pushHistory: (s) => { past.push(s); },
        restore: (s) => dispatch({ type: "SET_DATA", payload: { ...rendered, elements: s.elements, connectors: s.connectors } }),
      });
    },
  };
}

/** The window, as the editor drives it: a pick, a cancel, a keep. */
function windowModel(hook: ReturnType<typeof hookModel>, anchorId?: string) {
  let prov: { stamp: number; base: TemplateSnapshot; ids: TemplateIds } | null = null;
  return {
    pick(t: TemplateData): string | null {
      const p = planTemplateShow(t, {
        data: hook.data, provisional: prov, showing: !!prov && hook.stillShowing(prov.stamp),
        ...(anchorId ? { anchorId } : {}), viewCentre: { x: 1500, y: 700 },
      });
      if ("refused" in p) return p.refused;
      const stamp = hook.applyTemplate(p.elements, p.connectors, { ...(p.join ? { join: p.join } : {}), ...(p.over ? { over: p.over } : {}) });
      prov = { stamp, base: p.base, ids: { elements: [...p.newIds], connectors: p.connectors.map((c) => c.id) } };
      hook.render();
      return null;
    },
    cancel() {
      if (prov) {
        if (hook.stillShowing(prov.stamp)) hook.undo();
        else hook.removeTemplate(prov.ids);
      }
      prov = null;
      hook.render();
    },
    keep() { prov = null; },
  };
}

const labels = (d: DiagramData) => new Set(d.elements.map((e) => e.label));
const SUBMIT = "Submit", DO_WORK = "Do work", BEFORE = "Before";

describe("T4853 — one undo entry per window, and nothing left behind (the swap bug)", () => {
  it("three numbers, then cancel: back to exactly the diagram it started from, lane height included", () => {
    const d = paulsDiagram();
    const hook = hookModel(d);
    const win = windowModel(hook, MERGE);
    expect(win.pick(builtinTemplate("Single Approval"))).toBeNull();
    expect(win.pick(builtinTemplate("Rework Loop"))).toBeNull();
    expect(win.pick(builtinTemplate("Collapsed Sub-process"))).toBeNull();
    // Only the last one is showing, joined once, and the history holds ONE entry.
    expect(labels(hook.data).has(BEFORE)).toBe(true);
    expect(labels(hook.data).has(SUBMIT)).toBe(false);
    expect(labels(hook.data).has(DO_WORK)).toBe(false);
    expect(hook.data.connectors.filter((c) => c.sourceId === MERGE)).toHaveLength(1);
    expect(hook.past).toHaveLength(1);
    win.cancel();
    expect(hook.data.elements).toEqual(d.elements);
    expect(hook.data.connectors).toEqual(d.connectors);
    expect(at(hook.data, WAREHOUSE).height).toBe(at(d, WAREHOUSE).height);
    expect(hook.past).toHaveLength(0);
  });

  it("“yes” keeps the one showing; one undo still takes it off", () => {
    const d = paulsDiagram();
    const hook = hookModel(d);
    const win = windowModel(hook, MERGE);
    win.pick(builtinTemplate("Single Approval"));
    win.pick(builtinTemplate("Rework Loop"));
    win.keep();
    expect(labels(hook.data).has(DO_WORK)).toBe(true);
    expect(labels(hook.data).has(SUBMIT)).toBe(false);
    hook.undo(); hook.render();
    expect(hook.data.elements).toEqual(d.elements);
  });

  it("Ctrl+Z in the middle: the next number is a fresh first pick, and cancel still leaves nothing", () => {
    const d = paulsDiagram();
    const hook = hookModel(d);
    const win = windowModel(hook, MERGE);
    win.pick(builtinTemplate("Single Approval"));
    hook.undo(); hook.render();
    expect(hook.data.elements).toEqual(d.elements);
    win.pick(builtinTemplate("Rework Loop"));
    expect(hook.past).toHaveLength(1);
    win.cancel();
    expect(hook.data.elements).toEqual(d.elements);
    expect(hook.data.connectors).toEqual(d.connectors);
  });

  it("a co-author's merge in the middle: their change survives the next number AND the cancel", () => {
    const d = paulsDiagram();
    const hook = hookModel(d);
    const win = windowModel(hook, MERGE);
    win.pick(builtinTemplate("Single Approval"));
    const theirs = E({ id: "co", type: "task", label: "Their task", x: 0, y: 300, width: 102, height: 64, parentId: "ap120lg0" });
    hook.setData({ ...hook.data, elements: [...hook.data.elements, theirs] });
    hook.render();
    // Restoring the stored base here would have thrown "Their task" away.
    win.pick(builtinTemplate("Rework Loop"));
    expect(labels(hook.data).has("Their task")).toBe(true);
    expect(labels(hook.data).has(SUBMIT)).toBe(false);
    expect(labels(hook.data).has(DO_WORK)).toBe(true);
    expect(hook.past, "the stripped diagram is the one undo entry").toHaveLength(1);
    // A second merge, and then cancel with an EMPTY history: an undo would do
    // nothing and leave the template on while the log said "cancelled". It is
    // taken off by its ids, and both merges survive.
    const second = E({ id: "co2", type: "task", label: "Their second task", x: 150, y: 300, width: 102, height: 64, parentId: "ap120lg0" });
    hook.setData({ ...hook.data, elements: [...hook.data.elements, second] });
    hook.render();
    expect(hook.past).toHaveLength(0);
    win.cancel();
    expect(labels(hook.data).has("Their task")).toBe(true);
    expect(labels(hook.data).has("Their second task")).toBe(true);
    expect(labels(hook.data).has(DO_WORK)).toBe(false);
    expect(hook.data.connectors.some((c) => c.sourceId === MERGE && !d.connectors.some((b) => b.id === c.id)), "the join went with it").toBe(false);
    expect(hook.past, "and the removal is itself one undo entry").toHaveLength(1);
    // The known limit (templatePreview.ts header): taken off by its ids, the
    // preview leaves the room it made — Warehouse stays grown, and the pools
    // it pushed and any lane content it carried down to keep the join level
    // stay moved. Pinned so that lifting the limit is a deliberate change to
    // this line.
    expect(at(hook.data, WAREHOUSE).height).toBeGreaterThan(at(d, WAREHOUSE).height);
  });

  it("the plain window (no anchor) — Paul's third-number bug is gone", () => {
    const d = paulsDiagram();
    // The OLD mechanism, for the record: undo() then applyTemplate() in one
    // tick, the snapshot read from the last render.
    const old = hookModel(d);
    let showing = false;
    const oldPick = (t: TemplateData) => {
      if (showing) old.undo();
      const p = planTemplateShow(t, { data: old.data, provisional: null, showing: false, viewCentre: { x: 1500, y: 700 } });
      if ("refused" in p) throw new Error(p.refused);
      old.applyTemplate(p.elements, p.connectors);
      old.render();
      showing = true;
    };
    oldPick(builtinTemplate("Single Approval"));
    oldPick(builtinTemplate("Rework Loop"));
    oldPick(builtinTemplate("Collapsed Sub-process"));
    expect(labels(old.data).has(SUBMIT) && labels(old.data).has(BEFORE), "the first and the third on the diagram together").toBe(true);

    const hook = hookModel(d);
    const win = windowModel(hook);
    win.pick(builtinTemplate("Single Approval"));
    win.pick(builtinTemplate("Rework Loop"));
    win.pick(builtinTemplate("Collapsed Sub-process"));
    expect(labels(hook.data).has(SUBMIT)).toBe(false);
    expect(labels(hook.data).has(DO_WORK)).toBe(false);
    expect(labels(hook.data).has(BEFORE)).toBe(true);
    win.cancel();
    expect(hook.data.elements).toEqual(d.elements);
  });

  it("a refused number leaves the one showing where it was", () => {
    const d = paulsDiagram();
    const hook = hookModel(d);
    const win = windowModel(hook, MERGE);
    win.pick(builtinTemplate("Single Approval"));
    const showing = hook.data;
    expect(win.pick(builtinTemplate("Perform Regular Task"))).toBe("it has no step a sequence flow can enter");
    expect(hook.data).toBe(showing);
    win.cancel();
    expect(hook.data.elements).toEqual(d.elements);
  });

  it("the history pieces on their own", () => {
    const d = paulsDiagram();
    const now = { elements: d.elements, connectors: d.connectors };
    expect(templateApplyHistory(undefined, now)).toEqual({ push: now, restore: null });
    expect(templateApplyHistory({ base: now, entry: "kept" }, now)).toEqual({ push: null, restore: now });
    expect(templateApplyHistory({ base: now, entry: "new" }, now)).toEqual({ push: now, restore: now });
    const shown: ShownTemplate = { stamp: 1, entry: now, before: now, produced: null };
    noteProduced(shown, now);
    expect(shown.produced, "nothing rendered yet").toBeNull();
    const next = { elements: [...d.elements], connectors: d.connectors };
    noteProduced(shown, next);
    expect(shown.produced?.elements).toBe(next.elements);
    expect(isStillShowing(shown, 1, next, now)).toBe(true);
    expect(isStillShowing(shown, 2, next, now), "another stamp").toBe(false);
    expect(isStillShowing(shown, 1, { ...next, elements: [...next.elements] }, now), "changed since").toBe(false);
    expect(isStillShowing(shown, 1, next, undefined), "history cleared").toBe(false);
  });
});

describe("T4854 — what the anchored window offers", () => {
  const rows = [
    { id: "a", name: "Single Approval", group: "Approvals" },
    { id: "b", name: "Linear Process (3 steps)", group: "Starters" },
    { id: "c", name: "Document Loop", group: "Process Loops", hasContainer: true },
    { id: "d", name: "Automated Process", group: "Initial Process Types", hasWhiteBoxPool: true, hasContainer: true },
  ];

  it("attaching hides templates that bring a pool or lane; the initial rule still applies", () => {
    expect(templatesToOffer(rows, { hasWhiteBoxPool: true, attaching: true }))
      .toEqual({ offered: [rows[0]], hiddenInitial: 2, hiddenContainer: 1 });
    expect(templatesToOffer(rows, { hasWhiteBoxPool: true, attaching: false }))
      .toEqual({ offered: [rows[0], rows[2]], hiddenInitial: 2, hiddenContainer: 0 });
    expect(templatesToOffer(rows, { hasWhiteBoxPool: false, attaching: true }))
      .toEqual({ offered: [rows[0], rows[1]], hiddenInitial: 0, hiddenContainer: 2 });
  });

  it("the mouse's attach picker asks the same question", () => {
    expect(rows.filter(canAttachInline).map((r) => r.id)).toEqual(["a", "b"]);
    expect(src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx")).toContain(".filter(canAttachInline)");
  });

  it("what the log and the footer say", () => {
    expect(templateWindowSummary(31, 7, 5, "gateway")).toBe("31 templates to add after “gateway” — say a number, 12 hidden (starters, and templates that bring a pool)");
    expect(templateWindowSummary(43, 7, 0)).toBe("43 templates — say a number, 7 starters hidden");
    expect(hiddenTemplatesNote(7, 0)).toBe("7 starter templates hidden — this diagram already has a pool");
    expect(hiddenTemplatesNote(0, 1)).toBe("1 template that brings a pool or lane hidden — they can't join a flow");
    expect(hiddenTemplatesNote(0, 3)).toBe("3 templates that bring a pool or lane hidden — they can't join a flow");
    expect(hiddenTemplatesNote(2, 3)).toBe("5 hidden — starters, and templates that bring a pool or lane");
    expect(hiddenTemplatesNote(0, 0)).toBe("");
  });
});

describe("T4855 — wiring: one placement, one join, one close", () => {
  const editor = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
  const hook = src("app/hooks/useDiagram.ts");
  const body = (text: string, name: string) => {
    const start = text.indexOf(`const ${name} = useCallback(`);
    expect(start, name).toBeGreaterThan(-1);
    return text.slice(start, text.indexOf("}, [", start));
  };

  it("the mouse attach asks the shared planner and dry run, and draws the join inside applyTemplate", () => {
    const attach = body(editor, "attachTemplate");
    expect(attach).toContain("planTemplateAttach(tmplData, sourceId, base)");
    expect(attach).toContain("checkTemplateAttach(");
    expect(attach).toContain("applyTemplate(plan.elements, plan.connectors, { join: plan.join })");
    expect(attach).not.toContain("addConnector(");
    expect(src("app/lib/diagram/templateAttach.ts")).toContain("followOnParentId(anchor, base.elements)");
  });

  it("no pick undoes and applies in one tick; every close goes through closeTemplateFlow", () => {
    expect(editor).not.toContain("hadProvisional");
    expect(editor).not.toContain("previewTemplate");
    const show = body(editor, "showTemplate");
    expect(show).toContain("planTemplateShow(tdata, {");
    expect(show).toContain("templateStillShowing(prov.stamp)");
    expect(show).not.toContain("undo(");
    const close = body(editor, "closeTemplateFlow");
    expect(close).toContain("if (templateStillShowing(prov.stamp)) undo();");
    expect(close).toContain("else removeTemplate(prov.ids);");
    // voice cancel, Esc, and the window's Cancel button — the Keep button went
    // when a pick became final (T4928, 2026-09-27)
    expect((editor.match(/closeTemplateFlowRef\.current\(/g) ?? []).length).toBe(3);
    expect(editor).not.toMatch(/templateFlow\.provisional\) undo\(\)/);
  });

  it("a pick that loads after a newer pick, or after the window closed, is dropped", () => {
    const pick = body(editor, "pickTemplateCard");
    expect(pick).toContain("const seq = ++templatePickSeqRef.current;");
    expect(pick).toMatch(/await fetchTemplateData\(card\.id\);\s*const current = templateFlowRef\.current;\s*if \(seq !== templatePickSeqRef\.current \|\| !current \|\| current\.openId !== flow\.openId\) return;/);
  });

  it("useDiagram: applyTemplate and removeTemplate are templatePreview's steps, wired to the hook's own history and dispatch", () => {
    // The ORDER lives in runTemplateApply, which T4853 drives; what is left
    // here is which hook piece fills each step — and every one is held, so
    // dropping the SET_DATA restore or the push cannot pass unnoticed.
    const apply = body(hook, "applyTemplate");
    expect(apply).toContain("runTemplateApply(over, stamp, {");
    expect(apply).toContain("snapshot: snapshotData,");
    expect(apply).toMatch(/\n\s*pushHistory,\s*\n/);
    expect(apply).toMatch(/\n\s*topOfHistory,\s*\n/);
    expect(apply).toContain("record: (shown) => { templateShownRef.current = shown; },");
    expect(apply).toContain(`restore: (s) => dispatch({ type: "SET_DATA", payload: { ...dataRef.current, elements: s.elements, connectors: s.connectors } }),`);
    expect(apply).toContain(`apply: () => dispatch({ type: "APPLY_TEMPLATE", payload: { elements, connectors, ...(join ? { join } : {}) } }),`);
    // …and nothing of its own around them.
    expect(apply).not.toMatch(/pushHistory\(/);
    expect(apply.match(/dispatch\(/g) ?? []).toHaveLength(2);
    expect(apply).not.toContain("templateShownRef.current = {");
    expect(hook).toMatch(/function topOfHistory\(\): Snapshot \| undefined \{\s*return pastRef\.current\[pastRef\.current\.length - 1\];\s*\}/);
    const remove = body(hook, "removeTemplate");
    expect(remove).toContain("runTemplateRemove(ids, {");
    expect(remove).toContain(`restore: (s) => dispatch({ type: "SET_DATA", payload: { ...dataRef.current, elements: s.elements, connectors: s.connectors } }),`);
    expect(remove).not.toMatch(/pushHistory\(/);
    expect(hook).toContain("noteProduced(templateShownRef.current, data);");
    expect(body(hook, "templateStillShowing")).toContain("isStillShowing(templateShownRef.current, stamp, dataRef.current, topOfHistory())");
    const caseStart = hook.indexOf(`case "APPLY_TEMPLATE": {`);
    const applyCase = hook.slice(caseStart, hook.indexOf(`case "ALIGN_ELEMENTS"`, caseStart));
    expect(applyCase).toMatch(/return reducerImpl\(placed, \{\s*type: "ADD_CONNECTOR",/);
  });

  it("voice opens the window through the apply layer, and headless records where", () => {
    const apply = src("app/lib/assist/applyAssistOps.ts");
    expect(apply).toContain("openTemplateWindowRef.current({ anchorId: a.id })");
    expect(apply).toContain("whyTemplateCantFollow(a, els)");
    expect(src("app/lib/assist/headlessDiagram.ts")).toContain("`template after ${o.anchorId}`");
  });
});

describe("T4856 — a white-box pool with no lanes grows round an attached template, as a lane does", () => {
  // One lane-less pool, a start and a task in it. Paul: "just grow the Pool
  // when the template is placed". Only lanes were grown, so a template
  // adopted by the pool hung out of its bottom and the dry run refused 21 of
  // the 29 inline built-ins at 250px (25 at 150px) — attached by the mouse,
  // overhanging, before the dry run existed.
  const world = (h: number): DiagramData => ({
    elements: [
      E({ id: "P", type: "pool", label: "Us", x: 0, y: 0, width: 1400, height: h, properties: { poolType: "white-box" } }),
      E({ id: "s", type: "start-event", label: "Start", x: 80, y: h / 2 - 18, width: 36, height: 36, parentId: "P" }),
      E({ id: "A", type: "task", label: "Alpha", x: 160, y: h / 2 - 32, width: 102, height: 64, parentId: "P" }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as DiagramData;

  it("Single Approval after Alpha: in the pool, the pool grown round it, joined", () => {
    const d = world(250);
    const p = plan(builtinTemplate("Single Approval"), "A", d);
    for (const e of p.elements) expect(e.parentId, e.label).toBe("P");
    const c = checkTemplateAttach(d, p);
    expect("error" in c ? c.error : null).toBeNull();
    const after = (c as { after: DiagramData }).after;
    const pool = at(after, "P");
    expect(pool.y).toBe(0);
    expect(pool.height, "the pool grew").toBeGreaterThan(250);
    for (const id of p.newIds) {
      const e = at(after, id);
      expect(e.y + e.height + 8, e.label).toBeLessThanOrEqual(pool.y + pool.height + 1e-6);
    }
    expect(after.connectors.filter((x) => x.type === "sequence" && x.sourceId === "A" && x.targetId === p.entryId)).toHaveLength(1);
  });

  it("no template is refused for sticking out of a lane-less pool, above or below, whichever height it starts at", () => {
    const attached: Record<number, number> = {};
    for (const h of [150, 250]) {
      const d = world(h);
      attached[h] = 0;
      for (const t of builtinTemplates()) {
        const shown = planTemplateShow(t.data, { data: d, provisional: null, showing: false, anchorId: "A", viewCentre: { x: 0, y: 0 } });
        if (!("refused" in shown)) { attached[h]++; continue; }
        // What is left has nothing inline to join. One reaching ABOVE the
        // pool's top used to be refused too; the pool now grows at its top
        // round an anchored template (issue 6's growLaneAtTop), as a lane does.
        expect(shown.refused, `${h}px — ${t.name}`).toMatch(/no step a sequence flow can enter|brings a pool or lane/);
      }
    }
    // Of the 31 built-ins without a pool, 29 have an entry, and every one of
    // them attaches at both heights (before issue 6: 23 at 150px, 26 at 250px).
    expect(attached).toEqual({ 150: 29, 250: 29 });
  });

  it("the reducer grows the pool to its child plus the lane pad; a pool with lanes still grows through its lane", () => {
    const d = world(150);
    const low = E({ id: "x", type: "task", label: "Low", x: 400, y: 200, width: 102, height: 64, parentId: "P" });
    const after = reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: [low], connectors: [] } });
    expect(at(after, "P")).toMatchObject({ y: 0, height: 200 + 64 + 8 });
    const laned: DiagramData = {
      ...d,
      elements: [...d.elements.map((e) => (e.parentId === "P" ? { ...e, parentId: "L" } : e)),
        E({ id: "L", type: "lane", label: "Lane 1", x: 30, y: 0, width: 1370, height: 150, parentId: "P" })],
    };
    const inLane = reducer(laned, { type: "APPLY_TEMPLATE", payload: { elements: [{ ...low, parentId: "L" }], connectors: [] } });
    expect(at(inLane, "L").height).toBe(200 + 64 + 8);
    expect(at(inLane, "P").height, "the pool follows its lane").toBe(200 + 64 + 8);
  });
});

describe("T4859 — one list of what no lane owns (containment.ts `isLaneUnowned`)", () => {
  it("markers and free-floating notes, and nothing else", () => {
    for (const type of ["uml-pain-point", "uml-issue", "text-annotation", "review-comment"]) expect(isLaneUnowned({ type }), type).toBe(true);
    for (const type of ["task", "data-object", "gateway", "subprocess-expanded", "start-event"]) expect(isLaneUnowned({ type }), type).toBe(false);
  });

  it("the lane pass, the parentage check and the template attach all ask it, and none keeps a list of its own", () => {
    const hook = src("app/hooks/useDiagram.ts");
    const start = hook.indexOf("function reconcileLaneMembership(");
    const recon = hook.slice(start, hook.indexOf("\n}\n", start));
    expect(recon).toContain("if (isLaneUnowned(el)) return el;");
    expect(recon).not.toContain(`"text-annotation"`);
    expect(recon).not.toContain("MARKER_TYPES");
    const checks = src("app/lib/diagram/checks/diagramChecks.ts");
    expect(checks).toContain("if (isLaneUnowned(el)) continue;");
    expect(checks).not.toContain("UNOWNED_TYPES");
    const attach = src("app/lib/diagram/templateAttach.ts");
    expect(attach.match(/isLaneUnowned\(/g) ?? []).toHaveLength(2);
    expect(attach).not.toContain("UNOWNED_TYPES");
  });

  it("a note in a template stays unowned when attached, and is no reason to refuse it", () => {
    const d = paulsDiagram();
    const t = builtinTemplate("Single Approval");
    const note = E({ id: "note", type: "text-annotation", label: "Why", x: 400, y: -200, width: 100, height: 30 });
    const p = plan({ ...t, elements: [...t.elements, note] }, MERGE, d);
    expect(p.elements.find((e) => e.type === "text-annotation")!.parentId).toBeUndefined();
    const c = checkTemplateAttach(d, p);
    expect("error" in c ? c.error : null).toBeNull();
  });
});

describe("T4861 — the swap's order is ONE function (`runTemplateApply`), run by useDiagram and by the model above", () => {
  const now: TemplateSnapshot = { elements: [E({ id: "n", type: "task" })], connectors: [] };
  const base: TemplateSnapshot = { elements: [], connectors: [] };
  const trace = (over?: { base: TemplateSnapshot; entry: "kept" | "new" }) => {
    const calls: string[] = [];
    const past: TemplateSnapshot[] = [];
    let shown: ShownTemplate | null = null;
    let restored: TemplateSnapshot | null = null;
    const steps: TemplateApplySteps = {
      snapshot: () => { calls.push("snapshot"); return now; },
      pushHistory: (s) => { calls.push("push"); past.push(s); },
      topOfHistory: () => { calls.push("top"); return past[past.length - 1]; },
      record: (s) => { calls.push("record"); shown = s; },
      restore: (s) => { calls.push("restore"); restored = s; },
      apply: () => { calls.push("apply"); },
    };
    runTemplateApply(over, 7, steps);
    return { calls, past, shown: shown as ShownTemplate | null, restored: restored as TemplateSnapshot | null };
  };

  it("a first preview: the diagram is pushed, and THEN its entry is read — the one undo that takes it off", () => {
    const t = trace();
    expect(t.calls).toEqual(["snapshot", "push", "top", "snapshot", "record", "apply"]);
    expect(t.past).toEqual([now]);
    expect(t.shown).toEqual({ stamp: 7, entry: now, before: now, produced: null });
    expect(t.shown!.entry).toBe(t.past[0]);
  });

  it("a swap over a preview still showing: nothing pushed, and the base goes back BEFORE the next template goes on", () => {
    const t = trace({ base, entry: "kept" });
    expect(t.calls).toEqual(["snapshot", "top", "snapshot", "record", "restore", "apply"]);
    expect(t.restored).toBe(base);
    expect(t.past).toEqual([]);
  });

  it("a swap after something else changed it: the stripped base is the new entry, and goes back", () => {
    const t = trace({ base, entry: "new" });
    expect(t.calls).toEqual(["snapshot", "push", "top", "snapshot", "record", "restore", "apply"]);
    expect(t.past).toEqual([base]);
    expect(t.shown!.entry).toBe(base);
    expect(t.restored).toBe(base);
  });

  it("runTemplateRemove: the diagram as it is goes on the history, the diagram without the preview on the canvas", () => {
    const d = paulsDiagram();
    const p = plan(builtinTemplate("Single Approval"), MERGE, d);
    const shownData = reducer(d, { type: "APPLY_TEMPLATE", payload: { elements: p.elements, connectors: p.connectors, join: p.join } });
    const ids: TemplateIds = { elements: [...p.newIds], connectors: p.connectors.map((c) => c.id) };
    const past: TemplateSnapshot[] = [];
    let put: TemplateSnapshot | null = null;
    const steps = { snapshot: () => shownData, pushHistory: (s: TemplateSnapshot) => { past.push(s); }, restore: (s: TemplateSnapshot) => { put = s; } };
    runTemplateRemove(ids, steps);
    expect(past).toEqual([shownData]);
    expect(isTemplateOnDiagram(ids, (put as TemplateSnapshot | null)!.elements)).toBe(false);
    past.length = 0; put = null;
    runTemplateRemove(ids, { ...steps, snapshot: () => d });
    expect([past, put], "already gone: nothing pushed, nothing put").toEqual([[], null]);
  });

  it("the hook runs it (T4855 holds each step's wiring); the model in T4853 runs the same function", () => {
    const hook = src("app/hooks/useDiagram.ts");
    expect(hook).toContain("runTemplateApply(over, stamp, {");
    expect(hook).toContain("runTemplateRemove(ids, {");
    const me = src("tests/diagram/template-attach-plan.test.ts");
    const model = me.slice(me.indexOf("function hookModel("), me.indexOf("function windowModel("));
    expect(model).toContain("runTemplateApply(opts.over, stamp, {");
    expect(model).toContain("runTemplateRemove(ids, {");
    expect(model).not.toContain("templateApplyHistory(");
  });
});

describe("T4862 — the Template ghosts are offered only where a template can follow", () => {
  it("both template ghosts ask the attach's own rule, whyTemplateCantFollow, before they are offered", () => {
    const editor = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    const start = editor.indexOf("const nextStepCandidates = useMemo(");
    const cands = editor.slice(start, editor.indexOf("const attachTemplate = useCallback(", start));
    expect(cands).toContain("if (inlineTemplates.length > 0 && !whyTemplateCantFollow(selectedElement, data.elements)) {");
    const gate = cands.indexOf("whyTemplateCantFollow(");
    expect(gate).toBeLessThan(cands.indexOf(`kind: "template"`));
    expect(gate).toBeLessThan(cands.indexOf(`kind: "intent"`));
  });

  it("…which turns them away from an End, a data object and anything inside an expanded subprocess, and not from a task", () => {
    const b = boundaryDiagram();
    expect(whyTemplateCantFollow(at(b, "draft"), b.elements)).toBe("templates can’t be attached inside an expanded subprocess yet");
    const d = paulsDiagram();
    const end = E({ id: "end", type: "end-event", label: "Done", x: 600, y: 300, width: 36, height: 36, parentId: WAREHOUSE });
    const doc = E({ id: "doc", type: "data-object", label: "Order", x: 700, y: 300, width: 36, height: 50, parentId: WAREHOUSE });
    const els = [...d.elements, end, doc];
    expect(whyTemplateCantFollow(end, els)).toBe("a template can’t follow “Done” — no sequence flow can leave it");
    expect(whyTemplateCantFollow(doc, els)).toBe("a template can’t follow “Order” — no sequence flow can leave it");
    expect(whyTemplateCantFollow(at(d, CHECK_STOCK), d.elements)).toBeNull();
    expect(whyTemplateCantFollow(at(d, MERGE), d.elements)).toBeNull();
  });
});
