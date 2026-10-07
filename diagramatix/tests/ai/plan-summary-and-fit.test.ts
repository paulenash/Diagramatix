/**
 * T5276 — after an AI generation (Paul, 2026-10-07):
 *   1. the diagram opens showing the WHOLE of it (then zoom in if need be) instead of a fixed close zoom;
 *   2. when the Plan phase finishes, a pop-up summarises what was found and offers four ways forward:
 *      Re-plan · Refine Prompt · Layout Diagram · Cancel — with a warning when the plan looks cut off, the fault found the same day in a
 *      real run (142 elements, a connection list that stopped partway, 31 steps stacked in one column).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { summarisePlan, type SummaryElement, type SummaryConnection } from "@/app/lib/ai/planSummary";
import { wholeFitZoom, WHOLE_FIT_MIN_ZOOM } from "@/app/lib/diagram/fitZoom";
import { PlanSummaryDialog } from "@/app/components/ai/PlanSummaryDialog";

const read = (p: string) => readFileSync(p, "utf8");

// A small sound plan: one organisation with two lanes, one outside party.
const POOLS: SummaryElement[] = [
  { id: "pc", type: "pool", label: "Customer", poolType: "black-box" },
  { id: "po", type: "pool", label: "Company", poolType: "white-box" },
  { id: "l1", type: "lane", label: "Sales", parentPool: "po" },
  { id: "l2", type: "lane", label: "Finance", parentPool: "po" },
];
const sound = (): { elements: SummaryElement[]; connections: SummaryConnection[] } => ({
  elements: [
    ...POOLS,
    { id: "s", type: "start-event", label: "Order received", pool: "po", lane: "l1" },
    { id: "t1", type: "task", label: "Check order", pool: "po", lane: "l1" },
    { id: "g", type: "gateway", label: "OK?", pool: "po", lane: "l1" },
    { id: "t2", type: "task", label: "Invoice", pool: "po", lane: "l2" },
    { id: "e1", type: "end-event", label: "Done", pool: "po", lane: "l2" },
    { id: "e2", type: "end-event", label: "Rejected", pool: "po", lane: "l1" },
    { id: "d", type: "data-object", label: "Order" },
  ],
  connections: [
    { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "g" },
    { sourceId: "g", targetId: "t2" }, { sourceId: "g", targetId: "e2" },
    { sourceId: "t2", targetId: "e1" }, { sourceId: "pc", targetId: "s", type: "message" },
  ],
});

describe("T5276 the plan summary", () => {
  it("counts what was found, and a sound plan has no warnings", () => {
    const s = summarisePlan(sound(), { structured: true });
    expect(s.totals).toEqual({ elements: 7, connections: 6, sequence: 5, message: 1 });
    expect(s.mix[0]).toEqual({ label: "End events", count: 2 });
    expect(s.mix.find((m) => m.label === "Tasks")?.count).toBe(2);
    expect(s.pools.map((p) => [p.name, p.kind])).toEqual([["Customer", "black-box"], ["Company", "white-box"]]);
    expect(s.pools[1].lanes).toEqual([{ name: "Sales", elements: 4, unconnected: 0 }, { name: "Finance", elements: 2, unconnected: 0 }]);
    expect(s.warnings).toEqual([]);
  });

  it("flags steps with no connection, and names a lane that has none at all (the 2026-10-07 cut-off)", () => {
    const p = sound();
    for (let i = 0; i < 6; i++) p.elements.push({ id: `x${i}`, type: i % 2 ? "gateway" : "task", label: `Roll-up step ${i}`, pool: "po", lane: "l2" });
    const s = summarisePlan(p, { structured: true });
    const codes = s.warnings.map((w) => w.code);
    expect(codes).toContain("unconnected");
    expect(codes).toContain("cut-off-likely");
    expect(s.warnings.find((w) => w.code === "unconnected")!.message).toContain('"Roll-up step 0"');
    expect(s.warnings.find((w) => w.code === "cut-off-likely")!.message).toContain("cut off");
    expect(s.pools[1].lanes[1]).toMatchObject({ name: "Finance", unconnected: 6 });
  });

  it("one stray unconnected step is reported, but is not called a cut-off", () => {
    const p = sound();
    p.elements.push({ id: "stray", type: "task", label: "Stray", pool: "po", lane: "l1" });
    const codes = summarisePlan(p, { structured: true }).warnings.map((w) => w.code);
    expect(codes).toContain("unconnected");
    expect(codes).not.toContain("cut-off-likely");
  });

  it("does not judge boundary events, data objects, pools or lanes as 'unconnected'", () => {
    const p = sound();
    p.elements.push({ id: "b", type: "intermediate-event", label: "Timeout", boundaryHost: "t1", pool: "po", lane: "l1" });
    expect(summarisePlan(p, { structured: true }).warnings.map((w) => w.code)).not.toContain("unconnected");
  });

  it("flags a gateway that decides nothing, a plan with no start or no end, and a single lane", () => {
    const thin = sound();
    thin.connections = thin.connections.filter((c) => c.targetId !== "e2");           // the gateway now has one way out
    expect(summarisePlan(thin, { structured: true }).warnings.map((w) => w.code)).toContain("gateway-branches");

    const none = { elements: [{ id: "t", type: "task", label: "Only" }, { id: "u", type: "task", label: "Two" }], connections: [{ sourceId: "t", targetId: "u" }] };
    const codes = summarisePlan(none, { structured: false }).warnings.map((w) => w.code);
    expect(codes).toContain("no-start");
    expect(codes).toContain("no-end");

    const oneLane: { elements: SummaryElement[]; connections: SummaryConnection[] } = {
      elements: [{ id: "po", type: "pool", label: "Co", poolType: "white-box" }, { id: "l", type: "lane", label: "All", parentPool: "po" },
        ...Array.from({ length: 7 }, (_, i) => ({ id: `t${i}`, type: "task", label: `Step ${i}`, pool: "po", lane: "l" }))],
      connections: Array.from({ length: 6 }, (_, i) => ({ sourceId: `t${i}`, targetId: `t${i + 1}` })),
    };
    expect(summarisePlan(oneLane, { structured: true }).warnings.map((w) => w.code)).toContain("single-lane");
  });

  it("handles a flat plan (flowchart / EPC) and an empty one", () => {
    const flat = summarisePlan({ elements: [{ id: "a", type: "process", label: "A" }, { id: "b", type: "terminator", label: "B" }], connections: [{ sourceId: "a", targetId: "b" }] }, { structured: false });
    expect(flat.pools).toEqual([]);
    expect(flat.totals.elements).toBe(2);
    expect(() => summarisePlan(null, { structured: true })).not.toThrow();
    expect(summarisePlan(undefined, { structured: true }).totals.elements).toBe(0);
  });
});

describe("T5276 the pop-up", () => {
  const render = (canRefine: boolean, warn: boolean) => {
    const p = sound();
    if (warn) p.elements.push({ id: "stray", type: "task", label: "Stray", pool: "po", lane: "l1" });
    return renderToStaticMarkup(createElement(PlanSummaryDialog, {
      summary: summarisePlan(p, { structured: true }), canRefine, onReplan() {}, onRefine() {}, onLayout() {}, onCancel() {},
    }));
  };
  it("offers Re-plan, Refine Prompt, Layout Diagram and Cancel — in a named, modal dialog", () => {
    const html = render(true, false);
    for (const label of ["Re-plan", "Refine Prompt", "Layout Diagram", "Cancel"]) expect(html).toContain(`>${label}</button>`);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="plan-summary-title"');
    expect(html).toContain("Nothing is drawn until you choose Layout Diagram");
  });
  it("omits Refine Prompt where the plan type cannot refine (flowchart / EPC)", () => {
    expect(render(false, false)).not.toContain("Refine Prompt");
  });
  it("shows the warnings as an alert only when there are some, and says what the plan holds", () => {
    expect(render(true, false)).not.toContain("plan-summary-warnings");
    const warned = render(true, true);
    expect(warned).toContain('role="alert"');
    expect(warned).toContain("no connection to the rest of the flow");
    expect(warned).toContain("Company");
    expect(warned).toContain("Sales — 5 steps, 1 not connected");
  });
});

describe("T5276 both Plan screens show it, and each button does what it says", () => {
  for (const [name, file] of [
    ["the sidebar Plan panel", "app/(dashboard)/diagram/[id]/PlanPanel.tsx"],
    ["the full-screen AI Generate console", "app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx"],
  ] as const) {
    it(`${name}: the summary is set when the plan arrives, and the four buttons are wired`, () => {
      const src = read(file);
      const received = src.indexOf("setStatus(`Plan received:");
      expect(received).toBeGreaterThan(-1);
      expect(src.slice(received, received + 400)).toContain("setPlanSummary(summarisePlan(json.plan, { structured: !flatPlan }));");
      expect(src).toContain("onReplan={() => { setPlanSummary(null); void executePlanCall(); }}");
      expect(src).toContain("onRefine={() => { setPlanSummary(null); void handleRefine(); }}");
      expect(src).toContain("onLayout={() => { setPlanSummary(null); void callApplyLayout(); }}");
      expect(src).toContain("onCancel={() => setPlanSummary(null)}");
      expect(src).toContain("canRefine={!flatPlan}");
    });
  }
});

describe("T5276 after a generation the whole diagram is shown", () => {
  it("is the smaller of the initial zoom and the zoom that fits everything, never below the floor", () => {
    const base = { initialZoom: 0.7, viewportW: 1400, viewportH: 800 };
    expect(wholeFitZoom({ ...base, contentW: 600, contentH: 400 })).toBe(0.7);                              // small: keeps the readable zoom
    expect(wholeFitZoom({ ...base, contentW: 2800, contentH: 400 })).toBeCloseTo(0.5, 5);                  // wide: shrinks to fit the width
    expect(wholeFitZoom({ ...base, contentW: 600, contentH: 1600 })).toBeCloseTo(0.5, 5);                  // tall: shrinks to fit the height
    expect(wholeFitZoom({ ...base, contentW: 9350, contentH: 5340 })).toBeCloseTo(1400 / 9350, 5);         // the 142-element diagram: all of it (the width is the tighter limit)
    expect(wholeFitZoom({ ...base, contentW: 900000, contentH: 900000 })).toBe(WHOLE_FIT_MIN_ZOOM);          // absurdly large: the floor
    expect(wholeFitZoom({ ...base, contentW: 0, contentH: 0 })).toBe(0.7);                                   // nothing to measure: unchanged
  });
  it("the editor asks for a whole-diagram fit after a generation, sending the new elements with the request", () => {
    const ed = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(ed).toContain("const merged = mergeGeneratedDiagram({ current: data, generated: aiData, aiGeneration, meta });");
    expect(ed).toContain('new CustomEvent("dgx:fitToContent", { detail: { whole: true, elements: merged.elements, title: merged.title } })');
  });
  it("the canvas fits to the diagram it was GIVEN and uses the whole-fit zoom only for that request; the 100% reference stays the person's own", () => {
    const cv = read("app/components/canvas/Canvas.tsx");
    expect(cv).toContain("if (d?.whole) performFit(true, d.elements ? { elements: d.elements, title: d.title } : undefined);");
    expect(cv).toContain("? wholeFitZoom({ initialZoom: baseZoom, viewportW: rect.width, viewportH: rect.height, contentW, contentH })");
    expect(cv).toContain("baseZoomRef.current = baseZoom;");
    expect(cv).toMatch(/performFit\(\);\s*\n\s*\}, \[data\.elements\.length, performFit\]\)/);                // the mount fit is unchanged
  });
});
