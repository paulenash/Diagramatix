/**
 * T4825–T4831 — renaming a message no longer erases where its label is, and
 * every way a message gets a name places the label by Paul's rule.
 *
 * Paul, 2026-09-25, Block 2 Test 3: "rename messages", pick, "Order details",
 * then "Request" — and "Request" fell out of the air gap to just inside the My
 * company pool. His note: "The message lable should always be in the air gap
 * between pools and attached closest to the Pool meesage endpoint diagonally to
 * the left or right."
 *
 * The cause: `updateConnectorLabel(id, label)` sent the three position fields
 * as `undefined`, and UPDATE_CONNECTOR_LABEL's `{ ...c, ...payload }` spread
 * them over the stored ones. The headless harness sent `{ id, label }` and kept
 * the position, which is why the harness never saw it.
 *
 * Now: an absent field means "leave it"; a message whose NAME changes, a new
 * message, and a message that was never placed are all placed by the one rule
 * (messageLabel.ts, tested on its own in message-label-place.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reducer, connectorLabelPayload, type Action } from "@/app/hooks/useDiagram";
import { healMessageLabels, preserveMessageLabel, placeMessageLabel } from "@/app/lib/diagram/messageLabel";
import { connectorLabelBox, type Box } from "@/app/lib/diagram/checks/layoutViolations";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import type { Connector, DiagramData, DiagramElement, SymbolType } from "@/app/lib/diagram/types";

const src = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

/** Paul's diagram as he saved it (snapshot qe8reyjr): "Request" has no position at all. */
const paulsSaved = (): DiagramData =>
  JSON.parse(readFileSync(join(process.cwd(), "tests", "fixtures", "block2-test3-add-message.json"), "utf8")) as DiagramData;

/** …and as it was before the two renames (snapshot 18687imk). */
function paulsBefore(): DiagramData {
  const d = paulsSaved();
  const was: Record<string, Partial<Connector>> = {
    spxupev9: { label: "message 3", labelOffsetX: 60.909627916278396, labelOffsetY: -35.639801942109926, labelWidth: 80, labelTether: "never" },
    bqdjxqwf: { label: "message 4", labelOffsetX: -50.35000787390277, labelOffsetY: -37.27065928336094, labelWidth: 80, labelTether: "never" },
  };
  return { ...d, connectors: d.connectors.map((c) => (was[c.id] ? { ...c, ...was[c.id] } : c)) };
}

// Customer's bottom and My company's top: the air gap message 3 and 4 cross.
const GAP_TOP = -176.6786407442375, GAP_BOTTOM = -118.71419104447502;
const conn = (d: DiagramData, id: string) => d.connectors.find((c) => c.id === id)!;
const boxOf = (d: DiagramData, id: string) => connectorLabelBox(conn(d, id), d.elements)!;
const inGap = (b: Box) => b.y >= GAP_TOP && b.y + b.h <= GAP_BOTTOM;

/** What useDiagram's `updateConnectorLabel(id, label)` dispatched before the fix. */
const oldPayload = (id: string, label: string): Action =>
  ({ type: "UPDATE_CONNECTOR_LABEL", payload: { id, label, labelOffsetX: undefined, labelOffsetY: undefined, labelWidth: undefined } });

const el = (id: string, type: SymbolType, x: number, y: number, w: number, h: number, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra } as DiagramElement);

/** Customer (black-box) 0–80 above Us (white-box, one lane) 180–480, tasks at x 350–450 and 420–480. */
const world = (extra: Partial<DiagramData> = {}): DiagramData => ({
  elements: [
    el("cust", "pool", 0, 0, 1000, 80, { label: "Customer", properties: { poolType: "black-box" } }),
    el("us", "pool", 0, 180, 1000, 300, { label: "Us", properties: { poolType: "white-box" } }),
    el("lane", "lane", 36, 180, 964, 300, { label: "Sales", parentId: "us" }),
    el("t1", "task", 350, 250, 100, 60, { label: "Take order", parentId: "lane" }),
    el("t2", "task", 420, 350, 60, 60, { label: "Bill", parentId: "lane" }),
  ],
  connectors: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  ...extra,
} as DiagramData);

const addMessage = (d: DiagramData, from: string, to: string, fromSide: string, toSide: string, initialLabel?: string, sourceOffsetAlong?: number): DiagramData =>
  reducer(d, {
    type: "ADD_CONNECTOR",
    payload: {
      sourceId: from, targetId: to, connectorType: "messageBPMN", directionType: "directed", routingType: "rectilinear",
      sourceSide: fromSide, targetSide: toSide, ...(initialLabel !== undefined ? { initialLabel } : {}),
      ...(sourceOffsetAlong !== undefined ? { sourceOffsetAlong } : {}),
    },
  } as Action);

describe("T4825 — the exact payload the editor sent now places the label; nothing is erased", () => {
  it("Paul's sequence, replayed with the OLD payload: both labels land in the gap, attached under Customer", () => {
    let d = paulsBefore();
    d = reducer(d, oldPayload("spxupev9", "Order details"));
    d = reducer(d, oldPayload("bqdjxqwf", "Request"));
    const od = boxOf(d, "spxupev9"), rq = boxOf(d, "bqdjxqwf");
    expect(inGap(od), JSON.stringify(od)).toBe(true);
    expect(inGap(rq), JSON.stringify(rq)).toBe(true);
    expect(od.y).toBeCloseTo(GAP_TOP + 10, 3);
    expect(rq.y).toBeCloseTo(GAP_TOP + 10, 3);
    // "Order details" right of message 3's line (753), "Request" left of message 4's (710.7).
    expect(od.x).toBeCloseTo(753.0215505527722 + 6, 3);
    expect(rq.x + rq.w).toBeCloseTo(710.7310002253834 - 6, 3);
    // The stored fields the old spread wiped are all still there.
    for (const id of ["spxupev9", "bqdjxqwf"]) {
      const c = conn(d, id);
      expect(c.labelOffsetX, id).toBeTypeOf("number");
      expect(c.labelOffsetY, id).toBeTypeOf("number");
      expect(c.labelWidth, id).toBe(80);
    }
  });

  it("{ id, label } and { id, label, undefined × 3 } produce the same diagram", () => {
    const d = paulsBefore();
    const a = reducer(d, { type: "UPDATE_CONNECTOR_LABEL", payload: { id: "bqdjxqwf", label: "Request" } });
    const b = reducer(d, oldPayload("bqdjxqwf", "Request"));
    expect(b.connectors).toEqual(a.connectors);
  });

  it("the payload carries only what the caller supplied", () => {
    expect(Object.keys(connectorLabelPayload("c1", "Request"))).toEqual(["id", "label"]);
    expect(connectorLabelPayload("c1", undefined, 5, -7, 80)).toEqual({ id: "c1", labelOffsetX: 5, labelOffsetY: -7, labelWidth: 80 });
    expect(Object.keys(connectorLabelPayload("c1"))).toEqual(["id"]);
  });
});

describe("T4826 — only a message's NAME re-places it; other edits keep what they had", () => {
  const seq = (): Connector => ({
    id: "s1", sourceId: "t1", targetId: "t2", sourceSide: "right", targetSide: "left",
    type: "sequence", directionType: "directed", routingType: "rectilinear",
    sourceInvisibleLeader: false, targetInvisibleLeader: false,
    waypoints: [{ x: 450, y: 280 }, { x: 435, y: 280 }, { x: 435, y: 380 }, { x: 420, y: 380 }],
    label: "Yes", labelOffsetX: 12, labelOffsetY: -20, labelWidth: 60,
  } as Connector);

  it("the Properties panel's blur on a sequence flow or an ArchiMate relation keeps the label where it is", () => {
    for (const type of ["sequence", "archi-serving"] as const) {
      const d = world({ connectors: [{ ...seq(), type }] });
      const next = reducer(d, oldPayload("s1", "Approved"));
      const c = conn(next, "s1");
      expect(c.label).toBe("Approved");
      expect([c.labelOffsetX, c.labelOffsetY, c.labelWidth], type).toEqual([12, -20, 60]);
      expect(c.labelTether, type).toBeUndefined();
    }
  });

  it("a blur with the same text changes nothing", () => {
    const d = paulsBefore();
    const next = reducer(d, oldPayload("bqdjxqwf", "message 4"));
    expect(conn(next, "bqdjxqwf")).toEqual(conn(d, "bqdjxqwf"));
  });

  it("a drag stores exactly where the label was put, and turns the tether off", () => {
    const d = world({ connectors: [seq()] });
    const next = reducer(d, { type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload("s1", "Yes", 40, 10, 60) });
    const c = conn(next, "s1");
    expect([c.labelOffsetX, c.labelOffsetY]).toEqual([40, 10]);
    expect(c.labelTether).toBe("never");
    // …and a dragged MESSAGE label is left where it was dropped, too.
    const m = addMessage(world(), "t1", "cust", "top", "bottom");
    const id = m.connectors[0].id;
    const dragged = reducer(m, { type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload(id, "message 1", 120, -30, 80) });
    expect([conn(dragged, id).labelOffsetX, conn(dragged, id).labelOffsetY]).toEqual([120, -30]);
  });

  it("the canvas editor's commit (new text, stored position echoed or absent) places the message and leaves its tether alone", () => {
    const d = paulsBefore();
    const m4 = conn(d, "bqdjxqwf");
    // Echoing the stored position — what commitEdit now sends.
    const echoed = reducer(d, { type: "UPDATE_CONNECTOR_LABEL",
      payload: connectorLabelPayload(m4.id, "Request", m4.labelOffsetX, m4.labelOffsetY, m4.labelWidth) });
    expect(boxOf(echoed, m4.id).y).toBeCloseTo(GAP_TOP + 10, 3);
    expect(conn(echoed, m4.id).labelTether).toBe("never");
    // A never-placed label, never dragged: placed, and its tether is still unset.
    const fresh = world();
    const withMsg = addMessage(fresh, "t1", "cust", "top", "bottom");
    const mid = withMsg.connectors[0].id;
    const cleared = { ...withMsg, connectors: withMsg.connectors.map((c) => ({ ...c, labelOffsetX: undefined, labelOffsetY: undefined })) };
    const renamed = reducer(cleared, { type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload(mid, "Invoice") });
    const c = conn(renamed, mid);
    expect(c.labelTether).toBeUndefined();
    expect(connectorLabelBox(c, renamed.elements)!.y).toBeCloseTo(90, 6);
  });
});

describe("T4827 — a NEW message is placed by the same rule, mouse or voice", () => {
  it("drawn with the mouse: in the gap under Customer, 10px off its edge, left of the line", () => {
    const d = addMessage(world(), "t1", "cust", "top", "bottom");
    const c = d.connectors[0];
    const b = connectorLabelBox(c, d.elements)!;
    expect(c.label).toBe("message 1");
    expect(b.y).toBeCloseTo(90, 6);
    expect(b.x + b.w).toBeCloseTo(400 - 6, 6);
  });

  it("said by voice (\"add message\" from a task to Customer): the same place", () => {
    const h = headlessDiagram(world());
    const r = applyAssistOps([{ op: "addMessage", fromRef: "Take order", toRef: "Customer", label: "Invoice" }], h.context());
    expect(r.ok, r.summary).toBe(true);
    const c = h.data.connectors.find((x) => x.type === "messageBPMN")!;
    const b = connectorLabelBox(c, h.data.elements)!;
    const lineX = c.waypoints[1].x;
    expect(b.y).toBeCloseTo(90, 6);
    expect(b.x + b.w).toBeCloseTo(lineX - 6, 6);
  });

  it("a second message whose left spot is across the first one's line goes right", () => {
    // The old placement drew the new label across its neighbour's line.
    let d = addMessage(world(), "t1", "cust", "top", "bottom");
    d = addMessage(d, "t2", "cust", "top", "bottom");
    const [first, second] = d.connectors;
    const b = connectorLabelBox(second, d.elements)!;
    const firstX = first.waypoints[1].x, secondX = second.waypoints[1].x;
    expect(b.x).toBeCloseTo(secondX + 6, 6);
    expect(b.x < firstX && b.x + b.w > firstX).toBe(false);
  });

  it("free-form layout: beside the run at the pool, never on the jog part-way across", () => {
    // The verdict's case: the route jogs across the gap, so no one segment spans it.
    const d = world({ relaxedLayout: true } as Partial<DiagramData>);
    const els = d.elements.map((e) =>
      e.id === "us" ? { ...e, y: 200 } : e.id === "lane" ? { ...e, y: 200 } : e.id === "t1" ? { ...e, x: 400, y: 300, width: 160 } : e);
    const next = addMessage({ ...d, elements: els }, "cust", "t1", "bottom", "top", "message 1", 0.2);
    const c = next.connectors[0];
    const b = connectorLabelBox(c, next.elements)!;
    expect(b.y).toBeCloseTo(90, 6);
    expect(b.y + b.h).toBeLessThanOrEqual(200);
    // Not across any drawn segment of its own route.
    const w = c.waypoints;
    const vis = w.slice(c.sourceInvisibleLeader ? 1 : 0, c.targetInvisibleLeader ? w.length - 1 : w.length);
    for (let i = 1; i < vis.length; i++) {
      const a = vis[i - 1], z = vis[i];
      if (Math.abs(a.x - z.x) < 0.5) expect(a.x > b.x && a.x < b.x + b.w && Math.max(a.y, z.y) > b.y && Math.min(a.y, z.y) < b.y + b.h, `segment ${i}`).toBe(false);
      else expect(a.y > b.y && a.y < b.y + b.h && Math.max(a.x, z.x) > b.x && Math.min(a.x, z.x) < b.x + b.w, `segment ${i}`).toBe(false);
    }
  });

  it("pools side by side leave no air gap: the old left-of-the-midpoint default", () => {
    const d: DiagramData = {
      elements: [
        el("a", "pool", 0, 0, 400, 200, { properties: { poolType: "black-box" } }),
        el("b", "pool", 500, 0, 400, 200, { properties: { poolType: "black-box" } }),
      ],
      connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
    } as DiagramData;
    const next = addMessage(d, "a", "b", "right", "left", "Hello");
    const c = next.connectors[0];
    expect([c.labelOffsetX, c.labelOffsetY]).toEqual([-45, 0]);
  });
});

describe("T4828 — a label that was never placed is placed when the diagram opens", () => {
  it("Paul's saved \"Request\" (no position at all, drawn inside My company) is placed in the gap", () => {
    const d = paulsSaved();
    expect(conn(d, "bqdjxqwf").labelOffsetX).toBeUndefined();
    expect(inGap(boxOf(d, "bqdjxqwf")), "drawn inside the pool before").toBe(false);
    const healed = healMessageLabels(d);
    const rq = boxOf(healed, "bqdjxqwf");
    expect(inGap(rq), JSON.stringify(rq)).toBe(true);
    expect(rq.y).toBeCloseTo(GAP_TOP + 10, 3);
    expect(rq.x + rq.w).toBeCloseTo(710.7310002253834 - 6, 3);
    // Nothing else is touched.
    expect(healed.elements).toBe(d.elements);
    for (const c of d.connectors) if (c.id !== "bqdjxqwf") expect(healed.connectors.find((x) => x.id === c.id), c.id).toBe(c);
  });

  it("a diagram with nothing to heal comes back as the same object (not marked changed)", () => {
    const d = paulsBefore();
    expect(healMessageLabels(d)).toBe(d);
    const plain = world();
    expect(healMessageLabels(plain)).toBe(plain);
  });

  it("a label placed by hand, however odd, is left alone; an unlabelled message too", () => {
    const d = addMessage(world(), "t1", "cust", "top", "bottom");
    const odd = { ...d, connectors: d.connectors.map((c) => ({ ...c, labelOffsetX: 300, labelOffsetY: 150 })) };
    expect(healMessageLabels(odd)).toBe(odd);
    const blank = { ...d, connectors: d.connectors.map((c) => ({ ...c, label: "", labelOffsetX: undefined, labelOffsetY: undefined })) };
    expect(healMessageLabels(blank)).toBe(blank);
  });

  it("the editor runs the heal on load, after the pool-header heal", () => {
    const hook = src("app", "hooks", "useDiagram.ts");
    expect(hook).toContain("healMessageLabels(healPoolHeaderWidths(d))");
    expect(hook).toContain("useReducer(reducer, initialData, healOnLoad)");
  });
});

describe("T4829 — a wrapped label placed by the rule survives its pool crossing over", () => {
  const LONG = "Confirmation of the delivery order"; // drawn on two lines, 28px

  it("mirrored against its DRAWN height it lands 10px off the pool's new edge, in the new gap", () => {
    const d = addMessage(world(), "t1", "cust", "top", "bottom", LONG);
    const before = d.connectors[0];
    expect(connectorLabelBox(before, d.elements)!.h).toBe(28);
    // Customer drops below Us: the message now leaves the task's bottom for Customer's top at 600.
    const after: Connector = { ...before, sourceSide: "bottom", targetSide: "top",
      waypoints: [{ x: 400, y: 280 }, { x: 400, y: 310 }, { x: 400, y: 600 }, { x: 500, y: 640 }] };
    const off = preserveMessageLabel(after, before, "target")!;
    const b = connectorLabelBox({ ...after, ...off }, d.elements)!;
    expect(b.y + b.h).toBeCloseTo(600 - 10, 6);
    expect(b.y).toBeGreaterThanOrEqual(480);
  });

  it("dragging the black-box pool below (the reducer's own pool drag) keeps it out of the pool", () => {
    const d = addMessage(world(), "t1", "cust", "top", "bottom", LONG);
    const pre = { elements: d.elements, connectors: d.connectors };
    let next = reducer(d, { type: "MOVE_ELEMENT", payload: { id: "cust", x: 0, y: 600 } } as Action);
    // Mid-drag, as drawn under the mouse (the black-box pool drag's own mirror).
    const mid = connectorLabelBox(next.connectors[0], next.elements)!;
    expect(mid.y + mid.h, `mid-drag ${JSON.stringify(mid)}`).toBeCloseTo(600 - 10, 6);
    next = reducer(next, { type: "MOVE_END", payload: { id: "cust", preDrag: pre } } as Action);
    const cust = next.elements.find((e) => e.id === "cust")!;
    const b = connectorLabelBox(next.connectors[0], next.elements)!;
    expect(cust.y).toBe(600);
    expect(b.y + b.h, JSON.stringify(b)).toBeLessThanOrEqual(cust.y);
    expect(b.y + b.h).toBeCloseTo(cust.y - 10, 6);
    expect(b.y).toBeGreaterThanOrEqual(480);
  });
});

describe("T4830 — by voice, headless (L4): the label goes where the rule says, on the connector that was named", () => {
  it("“label it Request” on the selected message 4: in the gap, attached, left of its line", () => {
    const h = headlessDiagram(paulsBefore());
    const r = applyAssistOps([{ op: "labelSelected", label: "Request" }], h.context({ selectedConnectorId: "bqdjxqwf" }));
    expect(r.ok, r.summary).toBe(true);
    const b = boxOf(h.data, "bqdjxqwf");
    expect(conn(h.data, "bqdjxqwf").label).toBe("Request");
    expect(inGap(b)).toBe(true);
    expect(b.y).toBeCloseTo(GAP_TOP + 10, 3);
    expect(b.x + b.w).toBeCloseTo(710.7310002253834 - 6, 3);
  });

  it("“rename message 4 to Request” renames the MESSAGE, not the event “Event 4”", () => {
    const h = headlessDiagram(paulsBefore());
    const r = applyAssistOps([{ op: "rename", ref: "message 4", label: "Request" }], h.context());
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toMatch(/renamed connector “message 4” → Request/);
    expect(conn(h.data, "bqdjxqwf").label).toBe("Request");
    expect(h.data.elements.find((e) => e.id === "b32c36y8")!.label).toBe("Event 4");
    expect(inGap(boxOf(h.data, "bqdjxqwf"))).toBe(true);
  });

  it("an element named EXACTLY what was said still wins over a message of that name", () => {
    const d = paulsBefore();
    const named = { ...d, elements: d.elements.map((e) => (e.id === "b32c36y8" ? { ...e, label: "message 4" } : e)) };
    const h = headlessDiagram(named);
    const r = applyAssistOps([{ op: "rename", ref: "message 4", label: "Retry" }], h.context());
    expect(r.ok, r.summary).toBe(true);
    expect(h.data.elements.find((e) => e.id === "b32c36y8")!.label).toBe("Retry");
    expect(conn(h.data, "bqdjxqwf").label).toBe("message 4");
    // And an element with no message of its name renames as before.
    const h2 = headlessDiagram(paulsBefore());
    applyAssistOps([{ op: "rename", ref: "Event 4", label: "Retry" }], h2.context());
    expect(h2.data.elements.find((e) => e.id === "b32c36y8")!.label).toBe("Retry");
  });
});

describe("T4831 — wiring: one placement rule, one measure, one payload", () => {
  const hook = src("app", "hooks", "useDiagram.ts");
  const caseBody = (name: string) => {
    const at = hook.indexOf(`case "${name}"`);
    expect(at, name).toBeGreaterThan(0);
    return hook.slice(at, hook.indexOf("\n    case \"", at + 10));
  };

  it("the reducer places messages through messageLabel.ts on add and on rename, and the old rule is gone", () => {
    expect(hook).not.toContain("computeMsgBpmnLabelOffsets");
    expect(caseBody("ADD_CONNECTOR")).toContain("placeMessageLabel(newConnector, state.elements, state.connectors");
    const upd = caseBody("UPDATE_CONNECTOR_LABEL");
    expect(upd).toContain("placeMessageLabel(next, state.elements, state.connectors");
    expect(upd).toContain("messageLabelSide(c, state.elements");
    expect(upd).toContain("v !== undefined");
    expect(hook).toMatch(/dispatch\(\{ type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload\(id, label, labelOffsetX, labelOffsetY, labelWidth\) \}\)/);
  });

  it("both pool-move label rules measure the DRAWN (wrapped) height", () => {
    const a2 = hook.slice(hook.indexOf("// CASE A2: Moving a black-box pool"), hook.indexOf("// CASE B + C: Normal move"));
    expect(a2).toContain("connectorLabelSize(conn.label");
    expect(a2).not.toContain(`split("\\n")`);
    const ml = src("app", "lib", "diagram", "messageLabel.ts");
    const pres = ml.slice(ml.indexOf("export function preserveMessageLabel"), ml.indexOf("export function settleMessageLabels"));
    expect(pres).toContain("connectorLabelSize(conn.label).h");
    expect(pres).not.toContain(`split("\\n")`);
    // One measure: no line count of its own beside connectorLabelSize.
    expect(ml).not.toContain("drawnLineCount");
  });

  it("the canvas editor echoes the STORED position: a text edit is not a move", () => {
    const r = src("app", "components", "canvas", "ConnectorRenderer.tsx");
    const commit = r.slice(r.indexOf("function commitEdit("), r.indexOf("function cancelEdit("));
    expect(commit).toContain("onUpdateLabel?.(newText, connector.labelOffsetX, connector.labelOffsetY, connector.labelWidth);");
  });

  it("one label measure: the renderer, the checks and the placement all use connectorLabelSize", () => {
    const r = src("app", "components", "canvas", "ConnectorRenderer.tsx");
    expect(r).toContain("connectorLabelSize(label, fontSize)");
    expect(r).not.toMatch(/l\.length \* avgCharWidth \+ 12/);
    const lv = src("app", "lib", "diagram", "checks", "layoutViolations.ts");
    expect(lv).toContain("connectorLabelSize(c.label, fontSize)");
    expect(lv).not.toMatch(/l\.length \* 6 \+ 12/);
    const tm = src("app", "lib", "diagram", "textMetrics.ts");
    expect(tm).toMatch(/export function connectorLabelWidth[^}]*connectorLabelSize\(label, fontSize\)\.w/);
    const ml = src("app", "lib", "diagram", "messageLabel.ts");
    expect(ml).toContain("connectorLabelSize(label, fontSize)");
    // B52 asks the checks' box rather than keeping its own.
    const dc = src("app", "lib", "diagram", "checks", "diagramChecks.ts");
    const b52 = dc.slice(dc.indexOf("export function checkMessageLabelOverlap"), dc.indexOf("/** B53"));
    expect(b52).toContain("connectorLabelBox(c, d.elements, fontSize)");
    expect(b52).toContain("d.connectorFontSize ?? 10");
  });

  it("generation places messages with the same rule; the centring rule and its stagger are gone", () => {
    const bl = src("app", "lib", "diagram", "bpmnLayout.ts");
    expect(bl).toContain("placeMessageLabels(computedConnectors, elements");
    for (const gone of ["msgLabelTrack", "baseCentreY", "R05.09: message-flow label placement", "R5.07 — vertically stagger"]) {
      expect(bl, gone).not.toContain(gone);
    }
    // R5.12 moves labels off shapes anywhere; a message label may only be in
    // the air gap, so it leaves those alone.
    const r512 = bl.slice(bl.indexOf("── R5.12 (class A)"), bl.indexOf("── R5.13"));
    expect(r512).toContain(`if (c.type === "messageBPMN") continue;`);
  });

  it("the headless diagram builds the editor's payload, not its own", () => {
    const h = src("app", "lib", "assist", "headlessDiagram.ts");
    expect(h).toContain(`updateConnectorLabel: (id, label) => commit({ type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload(id, label) })`);
  });

  it("the rule's own sanity: placing an already-placed label again changes nothing", () => {
    const d = addMessage(world(), "t1", "cust", "top", "bottom");
    const c = d.connectors[0];
    const again = placeMessageLabel(c, d.elements, d.connectors)!;
    expect(again.labelOffsetX).toBeCloseTo(c.labelOffsetX!, 9);
    expect(again.labelOffsetY).toBeCloseTo(c.labelOffsetY!, 9);
  });
});

describe("T4836 — three messages drawn from one task: the third label stays on its own line", () => {
  it("lines at 440, 520 and 480: \"Order details\" is attached to 480 — never stepped out beside message 2's line", () => {
    // The review's case, through ADD_CONNECTOR as the mouse or voice draws it.
    const base = world();
    const d0 = { ...base, elements: base.elements
      .filter((e) => e.id !== "t2")
      .map((e) => (e.id === "t1" ? { ...e, x: 380, width: 160 } : e)) };
    let d = addMessage(d0, "t1", "cust", "top", "bottom", undefined, 0.375);
    d = addMessage(d, "t1", "cust", "top", "bottom", undefined, 0.875);
    d = addMessage(d, "t1", "cust", "top", "bottom", "Order details", 0.625);
    const [a, b, c] = d.connectors;
    const lineOf = (x: Connector) => x.waypoints[1].x;
    expect([lineOf(a), lineOf(b), lineOf(c)]).toEqual([440, 520, 480]);
    const ba = connectorLabelBox(a, d.elements)!, bb = connectorLabelBox(b, d.elements)!;
    expect([ba.x, ba.x + ba.w]).toEqual([368, 434]);
    expect([bb.x, bb.x + bb.w]).toEqual([448, 514]);
    const bc = connectorLabelBox(c, d.elements)!;
    expect(c.label).toBe("Order details");
    const left = bc.x + bc.w <= 480;
    const nearSide = left ? bc.x + bc.w : bc.x;
    expect(Math.abs(nearSide - 480), "attached: 6px off its own line").toBeCloseTo(6, 6);
    // Nothing of message 1's or 2's between it and its own line: its own line
    // is the nearest message line (the step out put it at 526–616, 6px from 520).
    for (const x of [440, 520]) expect(x > Math.min(480, nearSide) && x < Math.max(480, nearSide), `line ${x}`).toBe(false);
    expect(bc.x).not.toBe(526);
    expect(bc.y).toBeGreaterThanOrEqual(80);
    expect(bc.y + bc.h).toBeLessThanOrEqual(180);
  });
});

describe("T4837 — a rename keeps the label on the side the user sees it", () => {
  it("dragged to the right of its line and renamed: placed right, although the left is clear", () => {
    const d = addMessage(world(), "t1", "cust", "top", "bottom");
    const id = d.connectors[0].id;
    expect(connectorLabelBox(d.connectors[0], d.elements)!.x + 66).toBeCloseTo(394, 6);
    // Drag it right of the line (to x 427), as the mouse stores a drag.
    const right = placeMessageLabel(d.connectors[0], d.elements, d.connectors, { prefer: "right" })!;
    const dragged = reducer(d, { type: "UPDATE_CONNECTOR_LABEL",
      payload: connectorLabelPayload(id, "message 1", right.labelOffsetX + 21, right.labelOffsetY + 20, 80) });
    expect(connectorLabelBox(conn(dragged, id), dragged.elements)!.x).toBeCloseTo(427, 6);
    const renamed = reducer(dragged, { type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload(id, "Invoice") });
    const b = connectorLabelBox(conn(renamed, id), renamed.elements)!;
    expect(b.x, "right of the line, attached").toBeCloseTo(406, 6);
    expect(b.y).toBeCloseTo(90, 6);
    // The left spot is free — so it is the user's side, not a collision, that kept it right.
    const unpreferred = placeMessageLabel({ ...conn(renamed, id) }, renamed.elements, renamed.connectors)!;
    expect(unpreferred.side).toBe("left");
  });
});
