/**
 * T5246 — Paul, 2026-10-05:
 *   1. Delete (Del) on an Expanded Subprocess with an internal flow follows the same rules as voice "delete this";
 *   2. moving a Pool with an EP inside it: the EP and its boundary events must stay visible during the move;
 *   3. "delete this" on an EP with boundary events also removes the activities on the flows from those events.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { planUnwrapSubprocess } from "@/app/lib/diagram/subprocessWrap";
import { reducer } from "@/app/hooks/useDiagram";
import { EMPTY_DIAGRAM, type Connector, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label: id, properties: {}, ...extra }) as DiagramElement;
const seq = (id: string, s: string, t: string): Connector =>
  ({ id, type: "sequence", sourceId: s, targetId: t, sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear", waypoints: [] }) as Connector;

/** before → EP{ start → a → b → end } → after, with a timer on the EP's edge leading to  x → exEnd (an exception path). */
function shape(extra: { merge?: boolean } = {}): DiagramData {
  const els = [
    el("before", "task", 0, 100, 100, 60),
    el("ep", "subprocess-expanded", 200, 60, 400, 140),
    el("s", "start-event", 220, 110, 36, 36, { parentId: "ep" }),
    el("a", "task", 290, 100, 100, 60, { parentId: "ep" }),
    el("b", "task", 420, 100, 100, 60, { parentId: "ep" }),
    el("e", "end-event", 550, 110, 36, 36, { parentId: "ep" }),
    el("after", "task", 700, 100, 100, 60),
    el("timer", "intermediate-event", 380, 182, 36, 36, { boundaryHostId: "ep" }),
    el("x", "task", 340, 300, 100, 60),
    el("exEnd", "end-event", 500, 312, 36, 36),
  ];
  const cs = [seq("c1", "before", "ep"), seq("c2", "ep", "after"), seq("c3", "s", "a"), seq("c4", "a", "b"), seq("c5", "b", "e"),
    seq("c6", "timer", "x"), seq("c7", "x", "exEnd")];
  if (extra.merge) {   // the exception path rejoins the main flow at a gateway that the main flow also reaches
    els.push(el("m", "gateway", 650, 110, 40, 40));
    cs.splice(cs.findIndex((c) => c.id === "c2"), 1, seq("c2", "ep", "m"), seq("c8", "m", "after"));
    cs.splice(cs.findIndex((c) => c.id === "c7"), 1, seq("c7", "x", "m"));
    els.splice(els.findIndex((e) => e.id === "exEnd"), 1);
  }
  return { ...EMPTY_DIAGRAM, elements: els, connectors: cs } as DiagramData;
}
const ids = (d: { elements: DiagramElement[] }) => d.elements.map((e) => e.id).sort();

describe("T5246 3 — removing the EP removes what hangs off its boundary events", () => {
  it("the boundary event goes (as before) and so do the task and end event on its flow; the contents stay", () => {
    const plan = planUnwrapSubprocess(shape(), "ep");
    expect("error" in plan).toBe(false);
    if ("error" in plan) return;
    expect(ids(plan)).toEqual(["a", "after", "b", "before"]);
    expect(plan.summary).toMatch(/also removed 2 elements/);
    expect(plan.connectors.some((c) => ["c6", "c7"].includes(c.id))).toBe(false);
    expect(plan.connectors.map((c) => c.id).sort()).toEqual(expect.arrayContaining(["c1", "c2", "c4"]));
  });
  it("where the exception path rejoins the main flow the shared element stays, and only what is on the path alone goes", () => {
    const plan = planUnwrapSubprocess(shape({ merge: true }), "ep");
    if ("error" in plan) throw new Error(plan.error);
    expect(ids(plan)).toEqual(["a", "after", "b", "before", "m"]);
  });
  it("an EP with no boundary events is dissolved exactly as before", () => {
    const d = shape();
    const plain = { ...d, elements: d.elements.filter((e) => !["timer", "x", "exEnd"].includes(e.id)), connectors: d.connectors.filter((c) => !["c6", "c7"].includes(c.id)) };
    const plan = planUnwrapSubprocess(plain, "ep");
    if ("error" in plan) throw new Error(plan.error);
    expect(ids(plan)).toEqual(["a", "after", "b", "before"]);
    expect(plan.summary).not.toMatch(/also removed/);
  });
  it("the reducer applies the same plan (so the Delete key and the voice command agree)", () => {
    const out = reducer(shape(), { type: "UNWRAP_SUBPROCESS", payload: { epId: "ep" } });
    expect(ids(out)).toEqual(["a", "after", "b", "before"]);
  });
});

describe("T5246 1 — Delete on an EP with contents is the voice 'delete this'", () => {
  const editor = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
  it("both delete paths in the editor (the canvas and the properties panel) go through the one function, which runs the same plan", () => {
    expect(editor.split("deleteElementLikeVoice(id);").length - 1).toBe(2);
    const at = editor.indexOf("function deleteElementLikeVoice");
    const body = editor.slice(at, at + 800);
    expect(body).toContain('el?.type === "subprocess-expanded" && data.elements.some((k) => k.parentId === id)');
    expect(body).toContain("planUnwrapSubprocess(");
    expect(body).toContain("unwrapSubprocess(id)");
  });
  it("the voice command and the editor share planUnwrapSubprocess", () => {
    expect(readFileSync("app/lib/assist/applyAssistOps.ts", "utf8")).toContain("planUnwrapSubprocess({ elements: els, connectors: data.connectors }, ep.id)");
  });
});

describe("T5246 2 — moving a pool keeps its EP and their boundary events in view", () => {
  const canvas = readFileSync("app/components/canvas/Canvas.tsx", "utf8");
  it("the lifted overlay draws the travelling EPs and boundary events, above the pool and its lanes", () => {
    const overlay = canvas.slice(canvas.indexOf('<g data-lifted-drag="true"'));
    const lanes = overlay.indexOf("lanes.filter(el => isLifted(el.id)).map(renderContainerEl)");
    const eps = overlay.indexOf("expandedSubprocesses.filter(el => isLifted(el.id)).map(liftedPicture)");
    const tasks = overlay.indexOf("nonContainers\n                .filter(el => isLifted(el.id))");
    const evs = overlay.indexOf("boundaryEvents.filter(el => isLifted(el.id) || (!!el.boundaryHostId && isLifted(el.boundaryHostId))).map(liftedPicture)");
    expect(lanes).toBeGreaterThan(-1);
    expect(eps).toBeGreaterThan(lanes);
    expect(tasks).toBeGreaterThan(eps);
    expect(evs).toBeGreaterThan(tasks);
  });
  it("the pictures take no part in the drag (no handlers)", () => {
    const at = canvas.indexOf("const liftedPicture");
    const body = canvas.slice(at, at + 900);
    expect(body).toContain("onSelect={() => {}}");
    expect(body).toContain("onMove={() => {}}");
  });
});
