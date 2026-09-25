/**
 * T4876–T4884 — issue 6b: a template picked with nothing to follow goes ON THE
 * END of the current elements, and a group drag ends the way a single drag
 * does.
 *
 * Paul, 2026-09-25: "manually placing a template with an EP in it on or over
 * existing diagram elements also does the same thing. Particularly if the EP
 * does not fit into the lane it is initially placed in. All ok if the lane it
 * goes into has been manually prepared for the template. We need a generic fix
 * for this issue independent of voice assist." And, of where a template goes:
 * "assume the template will go on the end of the current elements".
 *
 * His template, picked from the window, was centred on the middle of the
 * screen — on top of his process — so he dragged it off; the drag left it
 * outside his pool and still owned by his lanes. 6a made the insert itself
 * settle. Here: the window and the toolbar list put a template after the last
 * element of the lane under the middle of the screen (templateAttach.ts
 * `planTemplateDrop`), and the end of a group drag asks every moved element
 * the one drop-parent rule a single drag asks (useDiagram `pickDropParent`),
 * then re-fits the containers (`refitContainersAfterMove`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { reducer, healOnLoad, type Action } from "@/app/hooks/useDiagram";
import { captureTemplate, instantiateTemplate, templateEntryOf } from "@/app/lib/diagram/templates";
import { planTemplateDrop, dropBandAt, planTemplateShow } from "@/app/lib/diagram/templateAttach";
import { HALF_TASK_W, LANE_CHILD_PAD } from "@/app/lib/diagram/assistPlacement";
import { MIN_LEFT_GAP } from "@/app/lib/diagram/poolLaneBounds";
import { isTemplateContainer } from "@/app/lib/diagram/templateAdoption";
import { isLaneUnowned } from "@/app/lib/diagram/containment";
import { canConnect } from "@/app/lib/diagram/canConnect";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { builtinTemplates, builtinTemplate } from "./_helpers/builtinTemplates";
import { auditInsert, endsOff, existingFlowsThrough, outsideParent } from "./_helpers/settleAudit";
import type { Connector, DiagramData, DiagramElement, TemplateData } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => ({ properties: {}, label: "", ...o }) as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");
const at = (d: { elements: DiagramElement[] }, id: string) => d.elements.find((e) => e.id === id)!;
const run = (d: DiagramData, a: Action) => reducer(d, a);
const cx = (e: { x: number; width: number }) => e.x + e.width / 2;
const cy = (e: { y: number; height: number }) => e.y + e.height / 2;
const right = (e: { x: number; width: number }) => e.x + e.width;
type Payload = { elements: DiagramElement[]; connectors: Connector[] };
const applyT = (d: DiagramData, p: Payload) =>
  run(d, { type: "APPLY_TEMPLATE", payload: { elements: p.elements, connectors: p.connectors } });
const CONTAINERS = new Set(["pool", "lane", "sublane"]);
const overlaps = (a: DiagramElement, b: DiagramElement) =>
  Math.min(right(a), right(b)) - Math.max(a.x, b.x) > 0.5
  && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;
const seq = (id: string, s: string, t: string, waypoints: { x: number; y: number }[]) => ({
  id, type: "sequence", sourceId: s, targetId: t, sourceSide: "right", targetSide: "left",
  directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false,
  waypoints,
}) as unknown as Connector;

/** Paul's Block 2 Test 3 diagram, and the template he picked (rebuilt from his exports — 6a's fixture). */
const paulsDiagram = () => JSON.parse(src("tests/fixtures/block2-test3-template.json")) as DiagramData;
const paulsPayload = () => (JSON.parse(src("tests/fixtures/voice-debug/block2-test3-template-insert.json")) as { payload: Payload }).payload;
const paulsTemplate = (): TemplateData => {
  const p = paulsPayload();
  return captureTemplate(p.elements, p.connectors, new Set(p.elements.map((e) => e.id)));
};
/** The middle of his screen when he picked it (issue-6.md: the drop reproduced to 0.00px). */
const VIEW = { x: 495.41, y: 167.57 };
const COMPANY = "ks53ue64", FRONT = "ovnxgjg6", WAREHOUSE = "i3c0s3q2", GOOD = "ap120lg0", CUSTOMER = "qkxmpmf3";
const MERGE = "5njpff19", BACK_ORDER = "kd8cdxot";

/** The template's first step, where the drop put it. */
const entryOf = (t: TemplateData, drop: Payload) => drop.elements[t.elements.indexOf(templateEntryOf(t)!)];
/** The drop's elements a lane takes in: top level, not on an edge, not a note. */
const topLevel = (t: TemplateData, drop: Payload) => {
  const ids = new Set(drop.elements.map((e) => e.id));
  return drop.elements.filter((e, i) => !t.elements[i].parentId && !e.boundaryHostId && !isLaneUnowned(e) && !ids.has(e.parentId ?? ""));
};
const boxOf = (els: DiagramElement[]) => ({
  x: Math.min(...els.map((e) => e.x)), y: Math.min(...els.map((e) => e.y)),
  right: Math.max(...els.map(right)), bottom: Math.max(...els.map((e) => e.y + e.height)),
});
const clearOf = (drop: Payload, d: DiagramData) =>
  drop.elements.flatMap((e) => d.elements.filter((o) => !CONTAINERS.has(o.type) && overlaps(e, o))
    .map((o) => `${e.label || e.type} over ${o.label || o.type}`));
/** The diagram with the drop laid on it as planned, nothing settled. */
const laidOn = (d: DiagramData, drop: Payload) =>
  ({ ...d, elements: [...d.elements, ...drop.elements], connectors: [...d.connectors, ...drop.connectors] }) as DiagramData;
/**
 * How far APPLY_TEMPLATE lowers a dropped template into its lane: only as far
 * as its flow part reached above the lane's top (plus the 8px pad). With no
 * join, only the template is lowered — the lane's own content stays put (the
 * issue 6 decision).
 */
const loweredBy = (drop: Payload, lane: DiagramElement) =>
  Math.max(0, lane.y + LANE_CHILD_PAD - Math.min(...drop.elements.filter((e) => !isLaneUnowned(e)).map((e) => e.y)));
/** Template elements APPLY_TEMPLATE did not leave where they were planned, lowered by `by`. */
const offPlan = (drop: Payload, after: DiagramData, by: number) => drop.elements.flatMap((e) => {
  const a = at(after, e.id);
  return Math.abs(a.x - e.x) > 1e-6 || Math.abs(a.y - (e.y + by)) > 1e-6
    ? [`${e.label || e.type} at (${a.x.toFixed(1)}, ${a.y.toFixed(1)}), planned (${e.x.toFixed(1)}, ${e.y.toFixed(1)}) lowered ${by.toFixed(1)}`] : [];
});

// ─────────────────────────────────────────────────────────────────────────────

describe("T4876 — Paul's template, picked with nothing selected, goes on the end of his process — not on top of it", () => {
  const d = paulsDiagram();
  const t = paulsTemplate();

  it("for the record: centred on the middle of his screen, as before, it lay over Receive order, Check stock and Pick items", () => {
    const old = instantiateTemplate(t, VIEW.x, VIEW.y);
    const ep = old.elements.find((e) => e.type === "subprocess-expanded")!;
    const under = d.elements.filter((e) => ["Receive order", "Check stock", "Pick items"].includes(e.label) && overlaps(e, ep));
    expect(under.map((e) => e.label).sort()).toEqual(["Check stock", "Pick items", "Receive order"]);
  });

  it("the lane under the middle of the screen is Warehouse, and its last element is the merge gateway", () => {
    const band = dropBandAt(d.elements, VIEW)!;
    expect(band.hostId).toBe(WAREHOUSE);
    expect(band.last!.id).toBe(MERGE);
  });

  it("its first step is planned ½ Task width right of the merge gateway, level with it, clear of every element and every flow, and the piece joins Warehouse", () => {
    const drop = planTemplateDrop(t, d, VIEW);
    const entry = entryOf(t, drop), merge = at(d, MERGE);
    expect(entry.type).toBe("start-event");
    expect(entry.x).toBeCloseTo(right(merge) + HALF_TASK_W, 6);
    expect(cy(entry)).toBeCloseTo(cy(merge), 6);
    expect(clearOf(drop, d)).toEqual([]);
    expect(existingFlowsThrough(d, laidOn(d, drop), new Set(drop.elements.map((e) => e.id)))).toEqual([]);
    const top = topLevel(t, drop);
    expect(top.length).toBeGreaterThan(3);
    for (const e of top) expect(e.parentId, e.label).toBe(WAREHOUSE);
    // One piece: every element moved by the same offset from where the template was saved.
    const offs = new Set(drop.elements.map((e, i) => `${(e.x - t.elements[i].x).toFixed(6)},${(e.y - t.elements[i].y).toFixed(6)}`));
    expect(offs.size).toBe(1);
  });

  it("applied: the whole verification set holds, Warehouse's own process stays put, and the template lies wholly in Warehouse after the gateway — lowered just as far as it reached above Warehouse, so its first step ends that far below the gateway", () => {
    const drop = planTemplateDrop(t, d, VIEW);
    const after = applyT(d, drop);
    expect(auditInsert(d, drop, after)).toEqual([]);
    expect(endsOff(after)).toEqual([]);
    // What Paul sees: where it was planned, lowered only by what reached above
    // Warehouse's top. His template does (its subprocess is taller than the
    // room above the gateway's middle), so its start event ends below the
    // gateway by exactly that much — the lane's content is not carried down.
    const lower = loweredBy(drop, at(d, WAREHOUSE));
    expect(lower).toBeGreaterThan(0);
    expect(offPlan(drop, after, lower)).toEqual([]);
    expect(cy(at(after, entryOf(t, drop).id)) - cy(at(after, MERGE))).toBeCloseTo(lower, 6);
    expect(existingFlowsThrough(d, after, new Set(drop.elements.map((e) => e.id)))).toEqual([]);
    for (const e of d.elements.filter((x) => x.parentId === WAREHOUSE)) {
      expect([at(after, e.id).x, at(after, e.id).y], e.label).toEqual([e.x, e.y]);
    }
    const ids = new Set(drop.elements.map((e) => e.id));
    const piece = after.elements.filter((e) => ids.has(e.id));
    expect(Math.min(...piece.map((e) => e.x))).toBeGreaterThanOrEqual(right(at(d, MERGE)) + HALF_TASK_W - 1e-6);
    const wh = at(after, WAREHOUSE);
    for (const e of piece) {
      expect(e.y, e.label).toBeGreaterThanOrEqual(wh.y);
      expect(e.y + e.height, e.label).toBeLessThanOrEqual(wh.y + wh.height);
    }
    // Nothing of his is under the template now.
    const mine = after.elements.filter((e) => !ids.has(e.id) && !CONTAINERS.has(e.type));
    expect(piece.flatMap((p) => mine.filter((m) => overlaps(p, m)).map((m) => `${p.label} over ${m.label}`))).toEqual([]);
  });
});

describe("T4877 — every built-in, from the window or the list, lands clean on the end of the lane under the middle of the screen", () => {
  const d = paulsDiagram();
  const plain = builtinTemplates().filter((b) => !b.data.elements.some(isTemplateContainer));
  // Warehouse (his process), Front office (Back order is its last step), Good team (empty).
  const views = [
    { name: "over his process", at: VIEW, lane: WAREHOUSE },
    { name: "over Front office", at: { x: 300, y: 20 }, lane: FRONT },
    { name: "over the empty Good team", at: { x: 300, y: 340 }, lane: GOOD },
  ];

  it("the full verification set holds for all of them; none lands on an element or a flow that was there, and none has a flow of his running through it once applied", () => {
    expect(plain.length).toBeGreaterThan(25);
    const problems: string[] = [];
    for (const v of views) {
      for (const b of plain) {
        const drop = planTemplateDrop(b.data, d, v.at);
        const ids = new Set(drop.elements.map((e) => e.id));
        const tag = `${v.name} / ${b.name}`;
        problems.push(...clearOf(drop, d).map((l) => `${tag}: dropped ${l}`));
        problems.push(...existingFlowsThrough(d, laidOn(d, drop), ids).map((l) => `${tag}: dropped on ${l}`));
        for (const e of topLevel(b.data, drop)) if (e.parentId !== v.lane) problems.push(`${tag}: ${e.label || e.type} joined ${e.parentId}`);
        const after = applyT(d, drop);
        problems.push(...auditInsert(d, drop, after).map((l) => `${tag}: ${l}`));
        problems.push(...existingFlowsThrough(d, after, ids).map((l) => `${tag}: applied, ${l}`));
        problems.push(...offPlan(drop, after, loweredBy(drop, at(d, v.lane))).map((l) => `${tag}: ${l}`));
      }
    }
    expect(problems).toEqual([]);
  });

  it("after a step, the first step is planned ½ Task width right of the lane's last element and level with it (unless nudged clear — then further right, still level); applied, it is level, or lower by exactly what reached above the lane", () => {
    const last = [{ at: VIEW, lane: WAREHOUSE, last: MERGE }, { at: { x: 300, y: 20 }, lane: FRONT, last: BACK_ORDER }];
    let level = 0, lowered = 0;
    for (const v of last) {
      for (const b of plain) {
        if (!templateEntryOf(b.data)) continue;
        const drop = planTemplateDrop(b.data, d, v.at);
        const e = entryOf(b.data, drop), prev = at(d, v.last);
        expect(e.x, b.name).toBeGreaterThanOrEqual(right(prev) + HALF_TASK_W - 1e-6);
        expect(cy(e), b.name).toBeCloseTo(cy(prev), 6);
        const after = applyT(d, drop);
        const lower = loweredBy(drop, at(d, v.lane));
        expect(cy(at(after, e.id)) - cy(at(after, v.last)), b.name).toBeCloseTo(lower, 6);
        if (lower === 0) level++; else lowered++;
      }
    }
    // Most go in level; those taller than the room above the last element's
    // middle are lowered (Nested If / Decision, the expanded subprocesses…).
    expect(level).toBeGreaterThan(lowered);
    expect(lowered).toBeGreaterThan(0);
  });
});

/** A white-box pool (lanes A, B — B split into sub-lanes B1, B2), a lane-less white-box pool, and a black-box pool. */
function bands(): DiagramData {
  return {
    elements: [
      E({ id: "U", type: "pool", label: "Us", x: 0, y: 0, width: 1200, height: 450, properties: { poolType: "white-box" } }),
      E({ id: "A", type: "lane", label: "Lane A", x: 36, y: 0, width: 1164, height: 150, parentId: "U" }),
      E({ id: "B", type: "lane", label: "Lane B", x: 36, y: 150, width: 1164, height: 300, parentId: "U" }),
      E({ id: "B1", type: "lane", label: "Sub one", x: 72, y: 150, width: 1128, height: 150, parentId: "B" }),
      E({ id: "B2", type: "lane", label: "Sub two", x: 72, y: 300, width: 1128, height: 150, parentId: "B" }),
      E({ id: "s", type: "start-event", label: "Go", x: 100, y: 57, width: 36, height: 36, parentId: "A" }),
      E({ id: "t", type: "task", label: "Work", x: 200, y: 43, width: 100, height: 64, parentId: "A" }),
      // An expanded subprocess reaching furthest right of the lane's steps…
      E({ id: "ep", type: "subprocess-expanded", label: "Inner", x: 360, y: 15, width: 300, height: 120, parentId: "A" }),
      E({ id: "in", type: "task", label: "Deep", x: 500, y: 40, width: 100, height: 64, parentId: "ep" }),
      // …with an event on its right edge, a data object and a note further right still: none of them is a step of the lane.
      E({ id: "be", type: "intermediate-event", label: "Late", x: 642, y: 57, width: 36, height: 36, parentId: "A", boundaryHostId: "ep" }),
      E({ id: "do", type: "data-object", label: "Doc", x: 760, y: 20, width: 36, height: 46, parentId: "A" }),
      E({ id: "n", type: "text-annotation", label: "Note", x: 900, y: 80, width: 100, height: 40 }),
      E({ id: "b1t", type: "task", label: "Sub work", x: 150, y: 193, width: 100, height: 64, parentId: "B1" }),
      E({ id: "L", type: "pool", label: "Plain", x: 0, y: 560, width: 1200, height: 200, properties: { poolType: "white-box" } }),
      E({ id: "K", type: "pool", label: "Them", x: 0, y: 870, width: 1200, height: 80, properties: { poolType: "black-box" } }),
    ],
    connectors: [seq("c1", "s", "t", [{ x: 136, y: 75 }, { x: 200, y: 75 }])],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as DiagramData;
}
const single = builtinTemplate("Single Approval");

describe("T4878 — which band, and where in it", () => {
  it("an empty diagram: centred on the middle of the screen, exactly as before", () => {
    const empty = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData;
    expect(dropBandAt(empty.elements, { x: 400, y: 300 })).toBeNull();
    const drop = planTemplateDrop(single, empty, { x: 400, y: 300 });
    const old = instantiateTemplate(single, 400, 300);
    expect(drop.elements.map((e) => [e.x, e.y, e.parentId])).toEqual(old.elements.map((e) => [e.x, e.y, e.parentId]));
  });

  it("a lane with nothing in it: the template starts at its left, clear of the header by the half-event gap, level with its middle, and joins it", () => {
    const d = bands();
    const drop = planTemplateDrop(single, d, { x: 600, y: 380 });   // over Sub two
    const b2 = at(d, "B2");
    expect(boxOf(drop.elements).x).toBeCloseTo(b2.x + 36 + MIN_LEFT_GAP, 6);
    expect(cy(entryOf(single, drop))).toBeCloseTo(cy(b2), 6);
    for (const e of topLevel(single, drop)) expect(e.parentId).toBe("B2");
    const after = applyT(d, drop);
    expect(auditInsert(d, drop, after)).toEqual([]);
  });

  it("a sub-lane is the band, not the lane it splits; the lane-less pool is a band of its own", () => {
    const d = bands();
    const sub = dropBandAt(d.elements, { x: 600, y: 200 })!;
    expect([sub.hostId, sub.last?.id]).toEqual(["B1", "b1t"]);
    const drop = planTemplateDrop(single, d, { x: 600, y: 200 });
    expect(entryOf(single, drop).x).toBeCloseTo(right(at(d, "b1t")) + HALF_TASK_W, 6);
    for (const e of topLevel(single, drop)) expect(e.parentId).toBe("B1");
    const plainPool = dropBandAt(d.elements, { x: 600, y: 650 })!;
    expect([plainPool.hostId, plainPool.last]).toEqual(["L", undefined]);
    const inPool = planTemplateDrop(single, d, { x: 600, y: 650 });
    expect(boxOf(inPool.elements).x).toBeCloseTo(36 + MIN_LEFT_GAP, 6);
    for (const e of topLevel(single, inPool)) expect(e.parentId).toBe("L");
    expect(auditInsert(d, inPool, applyT(d, inPool))).toEqual([]);
  });

  it("the last element is the step furthest right: an edge event, a step inside a subprocess, data and notes are not steps", () => {
    const d = bands();
    const band = dropBandAt(d.elements, { x: 600, y: 75 })!;
    expect([band.hostId, band.last?.id]).toEqual(["A", "ep"]);
    const drop = planTemplateDrop(single, d, { x: 600, y: 75 });
    const e = entryOf(single, drop);
    // After the subprocess and level with it — then nudged right, clear of the edge event, the data object and the note.
    expect(e.x).toBeGreaterThan(right(at(d, "ep")) + HALF_TASK_W - 1e-6);
    expect(clearOf(drop, d)).toEqual([]);
    for (const x of topLevel(single, drop)) expect(x.parentId).toBe("A");
  });

  it("the last element's own flow down to the next lane is not landed on: the template goes further right, still level, clear of it", () => {
    // Paul's diagram, over Front office: "Back order → gateway" leaves Back
    // order to the right and turns down to Warehouse exactly where the first
    // step went — 9 of 31 built-ins sat on it (review of 6b).
    // Lane A is tall enough, and Below far enough down, that no ELEMENT is in
    // the way — only the flow.
    const d = {
      elements: [
        E({ id: "U", type: "pool", label: "Us", x: 0, y: 0, width: 1600, height: 700, properties: { poolType: "white-box" } }),
        E({ id: "A", type: "lane", label: "Lane A", x: 36, y: 0, width: 1564, height: 500, parentId: "U" }),
        E({ id: "B", type: "lane", label: "Lane B", x: 36, y: 500, width: 1564, height: 200, parentId: "U" }),
        E({ id: "a1", type: "task", label: "Last", x: 100, y: 220, width: 100, height: 60, parentId: "A" }),
        E({ id: "b1", type: "task", label: "Below", x: 400, y: 570, width: 100, height: 60, parentId: "B" }),
      ],
      connectors: [{ ...seq("down", "a1", "b1", [{ x: 200, y: 250 }, { x: 450, y: 250 }, { x: 450, y: 570 }]), targetSide: "top" }],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
    const idsOf = (p: Payload) => new Set(p.elements.map((e) => e.id));
    const view = { x: 300, y: 250 };
    // For the record: blind to the flows, the drop puts its first step on it.
    const blind = planTemplateDrop(single, { ...d, connectors: [] }, view);
    expect(entryOf(single, blind).x).toBeCloseTo(right(at(d, "a1")) + HALF_TASK_W, 6);
    expect(existingFlowsThrough(d, laidOn(d, blind), idsOf(blind)).length).toBeGreaterThan(0);
    const drop = planTemplateDrop(single, d, view);
    expect(existingFlowsThrough(d, laidOn(d, drop), idsOf(drop))).toEqual([]);
    const e = entryOf(single, drop);
    expect(e.x).toBeGreaterThan(450 + HALF_TASK_W);
    expect(cy(e)).toBeCloseTo(cy(at(d, "a1")), 6);
    for (const x of topLevel(single, drop)) expect(x.parentId).toBe("A");
    const after = applyT(d, drop);
    expect(auditInsert(d, drop, after)).toEqual([]);
    expect(existingFlowsThrough(d, after, idsOf(drop))).toEqual([]);
  });

  it("nothing under the middle of the screen (a black-box pool, empty canvas): the nearest band — never the black-box pool", () => {
    const d = bands();
    const overThem = dropBandAt(d.elements, { x: 600, y: 900 })!;
    expect(overThem.hostId).toBe("L");
    const below = dropBandAt(d.elements, { x: 600, y: 1400 })!;
    expect(below.hostId).toBe("L");
    const beside = dropBandAt(d.elements, { x: 1500, y: 60 })!;
    expect(beside.hostId).toBe("A");
    // Paul's diagram, the middle of the screen on Customer (black-box): Front office, after Back order.
    const paul = paulsDiagram();
    const onCustomer = { x: 300, y: -150 };
    expect(at(paul, CUSTOMER).properties.poolType).toBe("black-box");
    const band = dropBandAt(paul.elements, onCustomer)!;
    expect([band.hostId, band.last?.id]).toEqual([FRONT, BACK_ORDER]);
  });

  it("a diagram with no pools: after its rightmost step, level with it, nothing adopted", () => {
    const d = {
      elements: [
        E({ id: "a", type: "start-event", label: "Go", x: 0, y: 100, width: 36, height: 36 }),
        E({ id: "b", type: "task", label: "Work", x: 100, y: 86, width: 100, height: 64 }),
        E({ id: "c", type: "end-event", label: "Done", x: 260, y: 200, width: 36, height: 36 }),
      ],
      connectors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
    const drop = planTemplateDrop(single, d, { x: 2000, y: -500 });
    const e = entryOf(single, drop);
    expect(e.x).toBeCloseTo(296 + HALF_TASK_W, 6);
    expect(cy(e)).toBeCloseTo(218, 6);
    expect(drop.elements.every((x) => !x.parentId || drop.elements.some((y) => y.id === x.parentId))).toBe(true);
  });

  it("a template with no step to line up (data only) puts its box there instead; one with pools of its own is centred as before (APPLY_TEMPLATE stacks it)", () => {
    const d = bands();
    const dataOnly: TemplateData = {
      elements: [E({ id: "x", type: "data-object", label: "In", x: 0, y: 0, width: 36, height: 46 }), E({ id: "y", type: "data-store", label: "Store", x: 80, y: 0, width: 50, height: 50 })],
      connectors: [],
    };
    const drop = planTemplateDrop(dataOnly, d, { x: 600, y: 200 });
    expect(boxOf(drop.elements).x).toBeCloseTo(right(at(d, "b1t")) + HALF_TASK_W, 6);
    const box = boxOf(drop.elements);
    expect((box.y + box.bottom) / 2).toBeCloseTo(cy(at(d, "b1t")), 6);
    const own = builtinTemplates().find((b) => b.data.elements.some(isTemplateContainer))!;
    const ownDrop = planTemplateDrop(own.data, d, { x: 600, y: 200 });
    const old = instantiateTemplate(own.data, 600, 200);
    expect(ownDrop.elements.map((e) => [e.x, e.y])).toEqual(old.elements.map((e) => [e.x, e.y]));
  });
});

describe("T4879 — wiring: the window and the toolbar list both drop through planTemplateDrop; the attach and the drop share one placement", () => {
  const editor = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
  const attach = src("app/lib/diagram/templateAttach.ts");
  const fnBody = (text: string, start: string) => {
    const i = text.indexOf(start);
    expect(i, start).toBeGreaterThan(-1);
    return text.slice(i, text.indexOf("\n}\n", i));
  };

  it("the toolbar list (handleApplyTemplate) plans with planTemplateDrop on the live diagram, and no longer centres", () => {
    const i = editor.indexOf("async function handleApplyTemplate(");
    const body = editor.slice(i, editor.indexOf("\n  }\n", i));
    expect(body).toContain("planTemplateDrop(templateData, { elements: elementsRef.current, connectors: connectorsRef.current }, center)");
    expect(body).not.toContain("instantiateTemplate(");
  });

  it("the window (showTemplate) sends the pointer only when there is one, and the middle of the screen always", () => {
    const i = editor.indexOf("const showTemplate = useCallback(");
    const body = editor.slice(i, editor.indexOf("}, [", i));
    expect(body).toContain("...(flow.at ? { at: flow.at } : {}),");
    expect(body).toContain("viewCentre: getViewportCenterRef.current?.() ?? { x: 200, y: 200 },");
    expect(body).not.toMatch(/at: flow\.at \?\?/);
  });

  it("planTemplateShow: after an element → the attach; at the pointer → centred there; otherwise → planTemplateDrop", () => {
    const body = fnBody(attach, "export function planTemplateShow(");
    expect(body).toContain("req.at ? instantiateTemplate(tdata, req.at.x, req.at.y) : planTemplateDrop(tdata, pb.base, req.viewCentre)");
  });

  it("one placement: the attach and the drop both put the first step by placeInline and nudge + adopt the piece by nudgeAndAdopt; one entry rule", () => {
    const att = fnBody(attach, "export function planTemplateAttach(");
    const drop = fnBody(attach, "export function planTemplateDrop(");
    for (const b of [att, drop]) {
      expect(b).toContain("placeInline(");
      expect(b).toContain("nudgeAndAdopt(");
      expect(b).not.toContain("findFreeSlot(");
    }
    expect((attach.match(/findFreeSlot\(/g) ?? []).length, "findFreeSlot is called in one place").toBe(1);
    expect(drop).toContain("templateEntryOf(templateData)");
    expect(src("app/lib/diagram/templates.ts")).toMatch(/export function templateAttachData\([\s\S]*?const first = templateEntryOf\(templateData\);/);
  });

  it("the plain window's pick, driven through planTemplateShow, is the drop — and at the pointer it is centred there", () => {
    const d = paulsDiagram();
    const t = paulsTemplate();
    const shown = planTemplateShow(t, { data: d, provisional: null, showing: false, viewCentre: VIEW });
    if ("refused" in shown) throw new Error(shown.refused);
    const drop = planTemplateDrop(t, d, VIEW);
    expect(shown.elements.map((e) => [e.x, e.y, e.parentId === WAREHOUSE])).toEqual(drop.elements.map((e) => [e.x, e.y, e.parentId === WAREHOUSE]));
    const here = planTemplateShow(t, { data: d, provisional: null, showing: false, at: { x: 1500, y: 700 }, viewCentre: VIEW });
    if ("refused" in here) throw new Error(here.refused);
    const centred = instantiateTemplate(t, 1500, 700);
    expect(here.elements.map((e) => [e.x, e.y])).toEqual(centred.elements.map((e) => [e.x, e.y]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GROUP DRAG

/** Pool "Us" with lanes A and B (an expanded subprocess in B), a black-box pool below. */
function dragDiagram(): DiagramData {
  return {
    elements: [
      E({ id: "P", type: "pool", label: "Us", x: 0, y: 0, width: 1000, height: 400, properties: { poolType: "white-box" } }),
      E({ id: "A", type: "lane", label: "Lane A", x: 36, y: 0, width: 964, height: 200, parentId: "P" }),
      E({ id: "B", type: "lane", label: "Lane B", x: 36, y: 200, width: 964, height: 200, parentId: "P" }),
      E({ id: "t1", type: "task", label: "First", x: 100, y: 60, width: 100, height: 60, parentId: "A" }),
      E({ id: "t2", type: "task", label: "Second", x: 300, y: 60, width: 100, height: 60, parentId: "A" }),
      E({ id: "bt", type: "intermediate-event", label: "Late", x: 132, y: 102, width: 36, height: 36, parentId: "A", boundaryHostId: "t1" }),
      E({ id: "EP", type: "subprocess-expanded", label: "Sub", x: 500, y: 230, width: 400, height: 150, parentId: "B" }),
      E({ id: "e1", type: "task", label: "Inside", x: 830, y: 300, width: 60, height: 40, parentId: "EP" }),
      E({ id: "Q", type: "pool", label: "Them", x: 0, y: 480, width: 1000, height: 80, properties: { poolType: "black-box" } }),
    ],
    connectors: [
      seq("c12", "t1", "t2", [{ x: 200, y: 90 }, { x: 300, y: 90 }]),
      { ...seq("cb", "bt", "t2", [{ x: 150, y: 138 }, { x: 150, y: 160 }, { x: 350, y: 160 }, { x: 350, y: 120 }]), sourceSide: "bottom", targetSide: "bottom" },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as DiagramData;
}
/** The editor's group drag: MOVE_ELEMENTS, then its end. */
const groupDrag = (d: DiagramData, ids: string[], dx: number, dy: number) =>
  run(run(d, { type: "MOVE_ELEMENTS", payload: { ids, dx, dy } }), { type: "ELEMENTS_MOVE_END", payload: { ids } });
/** The editor's single drag of one element by the same distance: MOVE_ELEMENT, then MOVE_END. */
const singleDrag = (d: DiagramData, id: string, dx: number, dy: number) => {
  const el = at(d, id);
  const moved = run(d, { type: "MOVE_ELEMENT", payload: { id, x: el.x + dx, y: el.y + dy } });
  return run(moved, { type: "MOVE_END", payload: { id, fromX: el.x, fromY: el.y } });
};

describe("T4880 — a group drag ends like a single drag: the same parents for every element, connectors attached", () => {
  const cases: { name: string; dx: number; dy: number; want: string | undefined }[] = [
    { name: "out of lane A into lane B", dx: 0, dy: 200, want: "B" },
    { name: "out of the pool, onto empty canvas", dx: 0, dy: 700, want: undefined },
    { name: "into the expanded subprocess", dx: 420, dy: 260, want: "EP" },
  ];
  for (const c of cases) {
    it(`${c.name}: ${c.want ?? "released"} — as each dragged alone`, () => {
      const d = dragDiagram();
      const after = groupDrag(d, ["t1", "t2"], c.dx, c.dy);
      for (const id of ["t1", "t2"]) {
        expect(at(after, id).parentId, `${id} dragged with the other`).toBe(c.want);
        expect(at(singleDrag(d, id, c.dx, c.dy), id).parentId, `${id} dragged alone`).toBe(c.want);
      }
      // The event on t1 went with it, stays mounted on it, and belongs where
      // t1 now does — as it does dragged alone.
      expect(at(after, "bt").boundaryHostId).toBe("t1");
      expect(at(after, "bt").parentId).toBe(at(after, "t1").parentId);
      expect(at(after, "bt").parentId).toBe(at(singleDrag(d, "t1", c.dx, c.dy), "bt").parentId);
      expect(endsOff(after)).toEqual([]);
      expect(outsideParent(after, new Set(["t1", "t2"]))).toEqual([]);
    });
  }

  it("before the fix, for the record: the group kept lane A for both, wherever it was dropped", () => {
    const d = dragDiagram();
    const old = run(run(d, { type: "MOVE_ELEMENTS", payload: { ids: ["t1", "t2"], dx: 0, dy: 700 } }), { type: "CORRECT_ALL_CONNECTORS" });
    expect([at(old, "t1").parentId, at(old, "t2").parentId]).toEqual(["A", "A"]);
  });

  it("the subprocess that takes them in grows round them — and round the event on t1's edge, now its own too — as it grows round one dragged in", () => {
    const d = dragDiagram();
    const after = groupDrag(d, ["t1", "t2"], 420, 240);
    const ep = at(after, "EP");
    expect(at(after, "bt").parentId).toBe("EP");
    for (const id of ["t1", "t2", "bt"]) expect(at(after, id).y + at(after, id).height + 8, id).toBeLessThanOrEqual(ep.y + ep.height + 1e-6);
    expect(ep.height).toBeGreaterThan(at(d, "EP").height);
    // …and the lane that owns the subprocess still holds it.
    expect(ep.y + ep.height).toBeLessThanOrEqual(at(after, "B").y + at(after, "B").height + 1e-6);
  });

  it("a moved container keeps its children as they are — only what the user moved is asked; its own parent is found the same way", () => {
    const d0 = dragDiagram();
    // A step of the subprocess drawn over a smaller subprocess inside it: asked
    // afresh, it would be re-homed into the smaller one. Dragging the outer one
    // alone does not do that, so dragging it in a group must not either.
    const d = { ...d0, elements: [...d0.elements,
      E({ id: "EP2", type: "subprocess-expanded", label: "Nested", x: 700, y: 250, width: 100, height: 80, parentId: "EP" }),
      E({ id: "tk", type: "task", label: "Over it", x: 720, y: 270, width: 60, height: 40, parentId: "EP" }),
    ] } as DiagramData;
    const after = groupDrag(d, ["EP"], 0, -200);
    expect(at(after, "EP").parentId).toBe("A");
    expect(at(after, "e1").parentId).toBe("EP");
    expect(at(after, "tk").parentId).toBe("EP");
    const alone = singleDrag(d, "EP", 0, -200);
    expect([at(alone, "EP").parentId, at(alone, "tk").parentId]).toEqual(["A", "EP"]);
  });

  /** dragDiagram, plus a task drawn in lane B but still owned by lane A (a stale parent). */
  const withStale = () => {
    const d = dragDiagram();
    return { ...d, elements: [...d.elements, E({ id: "st", type: "task", label: "Stale", x: 200, y: 300, width: 100, height: 60, parentId: "A" })] } as DiagramData;
  };

  it("the end of a group drag is reconciled as the end of a single drag is: a task drawn in lane B but owned by lane A is re-homed to B", () => {
    const d = withStale();
    expect(at(run(d, { type: "CORRECT_ALL_CONNECTORS" }), "st").parentId, "the old end left it stale").toBe("A");
    expect(at(groupDrag(d, ["t1"], 10, 0), "st").parentId).toBe("B");
    expect(at(singleDrag(d, "t1", 10, 0), "st").parentId).toBe("B");
  });

  it("a click on a selection moves nothing and ends as it always did — the connectors corrected, nothing re-parented or re-homed", () => {
    const d = withStale();
    const h = headlessDiagram(d);
    h.actions.moveElements(["t1", "t2"], 0, 0);
    h.actions.elementsMoveEnd();
    const want = run(healOnLoad(d), { type: "CORRECT_ALL_CONNECTORS" });
    expect(h.data.elements).toEqual(want.elements);
    expect(h.data.connectors).toEqual(want.connectors);
    expect(at(h.data, "st").parentId).toBe("A");
  });
});

describe("T4881 — Paul's gesture: his template dropped on his process, then dragged off it", () => {
  // issue-6.md: the window's drop at the middle of his screen, then a (477, 2)
  // screen-pixel drag at 70% zoom — (681.43, 2.86) — then the drag's end.
  const base = paulsDiagram();
  const payload = paulsPayload();
  const inserted = applyT(base, payload);
  const ids = payload.elements.map((e) => e.id);
  const dragged = groupDrag(inserted, ids, 681.43, 2.86);
  const idSet = new Set(ids);

  it("every element he dragged has the parent a single drag gives it", () => {
    const roots = dragged.elements.filter((e) => idSet.has(e.id) && !e.boundaryHostId && !idSet.has(e.parentId ?? ""));
    expect(roots.length).toBeGreaterThan(4);
    for (const r of roots) {
      expect(r.parentId, r.label || r.type).toBe(at(singleDrag(inserted, r.id, 681.43, 2.86), r.id).parentId);
    }
  });

  it("nothing whose centre left Company is still owned by his lanes — it is released, as one dragged alone is", () => {
    const company = at(dragged, COMPANY);
    const lanes = new Set(dragged.elements.filter((e) => e.type === "lane").map((e) => e.id));
    // (The subprocess's own steps stay the subprocess's.)
    const out = dragged.elements.filter((x) => idSet.has(x.id) && !x.boundaryHostId && !idSet.has(x.parentId ?? "") && cx(x) > right(company));
    expect(out.map((e) => e.label).sort()).toEqual(["Approved", "Approved?", "Assess", "Rejected"]);
    for (const e of out) expect(lanes.has(e.parentId ?? ""), `${e.label} outside Company, owned by a lane`).toBe(false);
    for (const e of out) expect(e.parentId, e.label).toBeUndefined();
    expect(endsOff(dragged)).toEqual([]);
  });

  it("what hangs out of its parent afterwards is exactly what hangs out when each is dragged alone — a drag never widens a lane, one element or many", () => {
    // The subprocess keeps Warehouse (its centre is still in Company) and
    // reaches past Company's right edge — as it does dragged on its own.
    const roots = dragged.elements.filter((e) => idSet.has(e.id) && !e.boundaryHostId && !idSet.has(e.parentId ?? ""));
    for (const r of roots) {
      const alone = singleDrag(inserted, r.id, 681.43, 2.86);
      expect(outsideParent(dragged, new Set([r.id])), r.label || r.type).toEqual(outsideParent(alone, new Set([r.id])));
    }
    expect(outsideParent(dragged, idSet).filter((l) => !l.includes("Re-work")))
      .toEqual(["Repeat until Re-Work Completed outside Warehouse"]);
  });
});

describe("T4882 — the editor and the headless diagram end a group drag the same way", () => {
  it("moveElements records what it moved and elementsMoveEnd sends it in ELEMENTS_MOVE_END — CORRECT_ALL_CONNECTORS only when nothing moved — and forgets it (useDiagram and headlessDiagram)", () => {
    const hook = src("app/hooks/useDiagram.ts");
    const move = hook.slice(hook.indexOf("const moveElements = useCallback("), hook.indexOf("const movePoolTo = useCallback("));
    expect(move).toContain("if (dx !== 0 || dy !== 0) for (const id of ids) groupMovedIdsRef.current.add(id);");
    const end = hook.slice(hook.indexOf("const elementsMoveEnd = useCallback("), hook.indexOf("const resizeElement = useCallback("));
    expect(end).toContain("groupMovedIdsRef.current = new Set();");
    expect(end).toContain(`if (ids.length > 0) dispatch({ type: "ELEMENTS_MOVE_END", payload: { ids } });\n    else dispatch({ type: "CORRECT_ALL_CONNECTORS" });`);
    const head = src("app/lib/assist/headlessDiagram.ts");
    expect(head).toContain("if (dx !== 0 || dy !== 0) for (const id of ids) groupMoved.add(id);");
    expect(head).toContain("groupMoved = new Set();");
    expect(head).toContain(`if (ids.length > 0) run({ type: "ELEMENTS_MOVE_END", payload: { ids } });\n      else run({ type: "CORRECT_ALL_CONNECTORS" });`);
  });

  it("each end asks only what its own gesture moved: a subprocess dragged over a task released by the gesture before does not take it in", () => {
    const h = headlessDiagram(dragDiagram());
    h.actions.moveElements(["t1"], 0, 700);
    h.actions.elementsMoveEnd();
    expect(at(h.data, "t1").parentId).toBeUndefined();
    // The subprocess now drawn round the released task, as dragging it alone would leave it.
    h.actions.moveElements(["EP"], -400, 500);
    h.actions.elementsMoveEnd();
    const t1 = at(h.data, "t1"), ep = at(h.data, "EP");
    expect(cx(t1) > ep.x && cx(t1) < right(ep) && cy(t1) > ep.y && cy(t1) < ep.y + ep.height, "the subprocess lies over the task").toBe(true);
    expect(t1.parentId, "not re-asked by the second end").toBeUndefined();
  });

  it("the headless diagram's staged move ends in exactly the reducer's answer", () => {
    const d = dragDiagram();
    const h = headlessDiagram(d);
    h.actions.moveElements(["t1", "t2"], 0, 350);
    h.actions.moveElements(["t1", "t2"], 0, 350);
    h.actions.elementsMoveEnd();
    const once = run(healOnLoad(d), { type: "MOVE_ELEMENTS", payload: { ids: ["t1", "t2"], dx: 0, dy: 350 } });
    const want = groupDrag(once, ["t1", "t2"], 0, 350);
    expect(at(h.data, "t1").parentId).toBeUndefined();
    expect(h.data.elements.map((e) => [e.id, e.x, e.y, e.parentId])).toEqual(want.elements.map((e) => [e.id, e.x, e.y, e.parentId]));
    h.actions.undo();
    expect(at(h.data, "t1").parentId, "one undo takes back the move and the release").toBe("A");
  });

  it("one drop-parent rule, one re-fit: MOVE_ELEMENT, MOVE_END and ELEMENTS_MOVE_END all ask pickDropParent; the drag and the group end re-fit alike; the end is reconciled and its labels follow", () => {
    const hook = src("app/hooks/useDiagram.ts");
    const caseOf = (name: string) => {
      const start = hook.indexOf(`    case "${name}": {`);
      expect(start, name).toBeGreaterThan(-1);
      return hook.slice(start, hook.indexOf("\n    case \"", start + 10));
    };
    expect(caseOf("MOVE_ELEMENT")).toContain("pickDropParent(state.elements, e, cx, cy)");
    expect(caseOf("MOVE_END")).toContain("pickDropParent(elements, initialEl, cx, cy)");
    expect(caseOf("ELEMENTS_MOVE_END")).toContain("pickDropParent(elements, el, cx, cy, holder)");
    expect(caseOf("ELEMENTS_MOVE_END")).toContain("pickDropParent(elements, el, cx, cy)?.id");
    // The priority chain is written once.
    expect((hook.match(/\.filter\(\(?b\)? => b\.type === "uml-package"\)/g) ?? []).length).toBe(0);
    expect((hook.match(/smallest\("uml-package"\)/g) ?? []).length).toBe(1);
    expect(caseOf("MOVE_ELEMENT")).toContain("refitContainersAfterMove(elements, connectors, state.relaxedLayout)");
    expect(caseOf("ELEMENTS_MOVE_END")).toContain("refitContainersAfterMove(elements, connectors, state.relaxedLayout)");
    expect(caseOf("MOVE_ELEMENT")).not.toContain("ensureContainersEncloseChildren(");
    const setOf = (name: string) => hook.slice(hook.indexOf(`const ${name}`), hook.indexOf("]);", hook.indexOf(`const ${name}`)));
    expect(setOf("LANE_RECONCILE_ACTIONS")).toContain(`"ELEMENTS_MOVE_END"`);
    expect(setOf("ROUTE_CHANGING_ACTIONS")).toContain(`"ELEMENTS_MOVE_END"`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WHAT A DRAG CANNOT TAKE AN ELEMENT OUT OF

/** Lane A holding an expanded subprocess "Sub": start → Check form → File it. */
function epDiagram(): DiagramData {
  return {
    elements: [
      E({ id: "P", type: "pool", label: "Us", x: 0, y: 0, width: 1400, height: 400, properties: { poolType: "white-box" } }),
      E({ id: "A", type: "lane", label: "Lane A", x: 36, y: 0, width: 1364, height: 400, parentId: "P" }),
      E({ id: "EP", type: "subprocess-expanded", label: "Sub", x: 500, y: 100, width: 400, height: 200, parentId: "A" }),
      E({ id: "s", type: "start-event", label: "", x: 520, y: 182, width: 36, height: 36, parentId: "EP" }),
      E({ id: "e1", type: "task", label: "Check form", x: 600, y: 170, width: 100, height: 60, parentId: "EP" }),
      E({ id: "e2", type: "task", label: "File it", x: 750, y: 170, width: 100, height: 60, parentId: "EP" }),
    ],
    connectors: [seq("c0", "s", "e1", [{ x: 556, y: 200 }, { x: 600, y: 200 }]), seq("c1", "e1", "e2", [{ x: 700, y: 200 }, { x: 750, y: 200 }])],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as unknown as DiagramData;
}
/** A drag as the mouse makes it: several frames, then its end. */
const groupDragFrames = (d: DiagramData, ids: string[], dx: number, dy: number, frames = 5) => {
  let s = d;
  for (let i = 0; i < frames; i++) s = run(s, { type: "MOVE_ELEMENTS", payload: { ids, dx: dx / frames, dy: dy / frames } });
  return run(s, { type: "ELEMENTS_MOVE_END", payload: { ids } });
};
const singleDragFrames = (d: DiagramData, id: string, dx: number, dy: number, frames = 5) => {
  const el = at(d, id);
  let s = d;
  for (let i = 1; i <= frames; i++) s = run(s, { type: "MOVE_ELEMENT", payload: { id, x: el.x + dx * i / frames, y: el.y + dy * i / frames } });
  return run(s, { type: "MOVE_END", payload: { id, fromX: el.x, fromY: el.y } });
};
/** Sequence flows the connection rules now refuse — a flow across a subprocess's edge among them. */
const refusedFlows = (d: DiagramData) => d.connectors
  .filter((c) => c.type === "sequence" && !canConnect(at(d, c.sourceId), at(d, c.targetId), "sequence", d.elements))
  .map((c) => `${at(d, c.sourceId).label || "start"}→${at(d, c.targetId).label}`);
const rect = (e: DiagramElement) => [e.x, e.y, e.width, e.height];

describe("T4883 — a step dragged past its expanded subprocess's edge stays its step, one element or many, mouse or voice", () => {
  const cases: { name: string; ids: string[]; dx: number; dy: number }[] = [
    { name: "File it, right past the edge", ids: ["e2"], dx: 250, dy: 0 },
    { name: "Check form and File it, down past the edge", ids: ["e1", "e2"], dx: 0, dy: 150 },
  ];
  for (const c of cases) {
    it(`${c.name}: parent kept, the subprocess grown round it exactly as a single drag grows it, no flow crossing its edge`, () => {
      const d = epDiagram();
      const after = groupDragFrames(d, c.ids, c.dx, c.dy);
      for (const id of c.ids) {
        expect(at(after, id).parentId, id).toBe("EP");
        const alone = singleDragFrames(d, id, c.dx, c.dy);
        expect(at(alone, id).parentId, `${id} alone`).toBe("EP");
        expect(rect(at(after, "EP")), `the subprocess, as ${id} dragged alone leaves it`).toEqual(rect(at(alone, "EP")));
      }
      expect(rect(at(after, "EP"))).not.toEqual(rect(at(d, "EP")));
      expect(outsideParent(after, new Set(c.ids))).toEqual([]);
      expect(refusedFlows(after)).toEqual([]);
      expect(endsOff(after)).toEqual([]);
    });
  }

  it("by voice (parseCommand → applyAssistOps → the headless diagram): moved, still the subprocess's step, and every flow still legal", () => {
    for (const [sentence, id] of [["move File it right", "e2"], ["move File it down", "e2"], ["move Check form down", "e1"]] as const) {
      const h = headlessDiagram(epDiagram());
      const ops = parseCommand(sentence);
      expect(ops, sentence).toBeTruthy();
      applyAssistOps(ops!, h.context({}));
      const el = at(h.data, id);
      expect(rect(el), `${sentence}: it moved`).not.toEqual(rect(at(epDiagram(), id)));
      expect(el.parentId, sentence).toBe("EP");
      expect(outsideParent(h.data, new Set([id])), sentence).toEqual([]);
      expect(refusedFlows(h.data), sentence).toEqual([]);
    }
  });

  it("only a container inside the subprocess may take the step: dropped on a subprocess nested in it, the nested one takes it — as the single drag's drop gives it", () => {
    const d0 = epDiagram();
    const d = { ...d0, elements: [...d0.elements,
      E({ id: "EP2", type: "subprocess-expanded", label: "Nested", x: 560, y: 240, width: 200, height: 50, parentId: "EP" }),
    ] } as DiagramData;
    // File it, centred over the nested subprocess.
    const after = groupDragFrames(d, ["e2"], -140, 65);
    expect(at(after, "e2").parentId).toBe("EP2");
    expect(at(singleDragFrames(d, "e2", -140, 65), "e2").parentId).toBe("EP2");
  });

  it("data is never held: a data object dragged out of the subprocess in a group is released, as its single drag's drop releases it", () => {
    const d0 = epDiagram();
    const d = { ...d0, elements: [...d0.elements, E({ id: "doc", type: "data-object", label: "Form", x: 820, y: 110, width: 36, height: 46, parentId: "EP" })] } as DiagramData;
    expect(at(groupDragFrames(d, ["doc"], 300, 0), "doc").parentId).toBe("A");
    expect(at(singleDragFrames(d, "doc", 300, 0), "doc").parentId).toBe("A");
  });

  it("a chevron dragged with another past its process group's edge keeps its group — a single drag cannot take it out either", () => {
    const d = {
      elements: [
        E({ id: "PG", type: "process-group", label: "Group", x: 0, y: 0, width: 400, height: 200 }),
        E({ id: "c1", type: "chevron", label: "One", x: 50, y: 70, width: 100, height: 60, parentId: "PG" }),
        E({ id: "c2", type: "chevron", label: "Two", x: 200, y: 70, width: 100, height: 60, parentId: "PG" }),
      ],
      connectors: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
    const after = groupDragFrames(d, ["c1", "c2"], 300, 0);
    expect([at(after, "c1").parentId, at(after, "c2").parentId]).toEqual(["PG", "PG"]);
    expect(at(singleDragFrames(d, "c2", 300, 0), "c2").parentId).toBe("PG");
  });

  it("wiring: one rule — MOVE_ELEMENT's lock and clamp and the group end's hold all ask dragHolderOf", () => {
    const hook = src("app/hooks/useDiagram.ts");
    const caseOf = (name: string) => {
      const start = hook.indexOf(`    case "${name}": {`);
      return hook.slice(start, hook.indexOf("\n    case \"", start + 10));
    };
    const move = caseOf("MOVE_ELEMENT");
    expect(move).toContain("const holder = dragHolderOf(state.elements, el, unconstrained);");
    expect(move).toContain(`const lockParentToEP = holder?.type === "subprocess-expanded";`);
    expect(move).toContain(`if (holder?.type === "process-group") {`);
    expect(move).not.toContain(`currentParent?.type === "subprocess-expanded"`);
    expect(move).not.toContain(`parent?.type === "process-group"`);
    expect(caseOf("ELEMENTS_MOVE_END")).toContain("const holder = dragHolderOf(elements, el);");
    expect(hook.split("function dragHolderOf(").length - 1).toBe(1);
  });
});

describe("T4884 — an event on an element's edge goes where its host goes when a drop re-parents the host, one element or many", () => {
  it("dragged alone or in a group from lane A into lane B, the task's edge event belongs to lane B too", () => {
    const d = dragDiagram();
    for (const after of [singleDrag(d, "t1", 0, 200), groupDrag(d, ["t1", "t2"], 0, 200)]) {
      expect(at(after, "t1").parentId).toBe("B");
      expect(at(after, "bt").parentId).toBe("B");
      expect(at(after, "bt").boundaryHostId).toBe("t1");
    }
  });

  it("Paul's template, dropped on the end of Warehouse and then dragged up onto Back order: its subprocess and the event on its edge both belong to Front office", () => {
    const base = paulsDiagram();
    const drop = planTemplateDrop(paulsTemplate(), base, VIEW);
    const ins = applyT(base, drop);
    const ids = drop.elements.map((e) => e.id);
    const box = boxOf(ins.elements.filter((e) => ids.includes(e.id)));
    const back = at(ins, BACK_ORDER);
    const dx = cx(back) - (box.x + box.right) / 2, dy = cy(back) - (box.y + box.bottom) / 2;
    const after = groupDragFrames(ins, ids, dx, dy, 10);
    const ep = after.elements.find((e) => ids.includes(e.id) && e.type === "subprocess-expanded")!;
    const events = after.elements.filter((e) => e.boundaryHostId === ep.id);
    expect(ep.parentId).toBe(FRONT);
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) expect(e.parentId, e.label).toBe(ep.parentId);
  });

  it("wiring: MOVE_END and ELEMENTS_MOVE_END both put a re-parented host's edge events with it through edgeEventsFollowHosts", () => {
    const hook = src("app/hooks/useDiagram.ts");
    const caseOf = (name: string) => {
      const start = hook.indexOf(`    case "${name}": {`);
      return hook.slice(start, hook.indexOf("\n    case \"", start + 10));
    };
    expect(caseOf("MOVE_END")).toContain("elements = edgeEventsFollowHosts(elements, new Set([id]));");
    expect(caseOf("ELEMENTS_MOVE_END")).toContain("elements = edgeEventsFollowHosts(elements, roots);");
    expect(hook.split("function edgeEventsFollowHosts(").length - 1).toBe(1);
  });
});
