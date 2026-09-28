/**
 * Pool and lane headers on the phone (and in the partner PDF, and in template
 * thumbnails) are drawn as the desktop draws them.
 *
 * Paul, 2026-09-28, on a diagram generated on the phone: "The generated diagram
 * looks good except for the pool header and lane headers are too narrow and are
 * separated by a gap." The saved diagram was right — the desktop opens it with
 * the strips flush. The phone's renderer (templateThumbnail.ts) drew every
 * header as a fixed 18px strip, while a lane starts one full header width
 * (36px unless resized) inside its pool: two half-width strips with 18px of
 * white between them.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnPlan } from "@/app/lib/ai/layoutBpmnPlan";
import { renderTemplateThumbnailSvg, stripLabelLines, thumbnailFrameFor, thumbnailTransform } from "@/app/lib/diagram/templateThumbnail";

/** The phone / partner render — and the frame it is drawn in (thumbnailFrameFor). */
const FULL = { trueColors: true, fullLabels: true } as const;
import { containerHeaderWidth } from "@/app/lib/diagram/containerHeader";
import { poolPaint, lanePaint } from "@/app/lib/diagram/canvasPaint";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/** A pool with three lanes and a black-box customer — the shape the phone job generates. */
const PLAN = {
  elements: [
    { id: "cust", type: "pool", label: "Customer", poolType: "black-box" },
    { id: "p1", type: "pool", label: "Order Fulfilment", poolType: "white-box" },
    { id: "l1", type: "lane", label: "Sales", parentPool: "p1" },
    { id: "l2", type: "lane", label: "Warehouse", parentPool: "p1" },
    { id: "l3", type: "lane", label: "Finance", parentPool: "p1" },
    { id: "s", type: "start-event", label: "Order received", pool: "p1", lane: "l1" },
    { id: "t1", type: "task", label: "Check order", taskType: "user", pool: "p1", lane: "l1" },
    { id: "t2", type: "task", label: "Pick and pack", taskType: "manual", pool: "p1", lane: "l2" },
    { id: "t4", type: "task", label: "Raise invoice", taskType: "service", pool: "p1", lane: "l3" },
    { id: "e", type: "end-event", label: "Order complete", pool: "p1", lane: "l3" },
  ],
  connections: [
    { sourceId: "cust", targetId: "s", type: "message", label: "Order" },
    { sourceId: "s", targetId: "t1", type: "sequence" },
    { sourceId: "t1", targetId: "t2", type: "sequence" },
    { sourceId: "t2", targetId: "t4", type: "sequence" },
    { sourceId: "t4", targetId: "e", type: "sequence" },
  ],
};

function generated(): DiagramData {
  const laid = layoutBpmnPlan(PLAN);
  if (!laid.ok) throw new Error("the plan did not lay out");
  return laid.diagramData;
}

interface Rect { x: number; y: number; w: number; h: number; fill: string }
const rects = (svg: string): Rect[] =>
  [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)" fill="([^"]+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4], fill: m[5] }));

/** The header strip drawn for element `e`: the rect at its own top-left whose height is its height and width is not its width. */
function stripOf(svg: string, e: DiagramElement, tx: number, ty: number): Rect | undefined {
  return rects(svg).find((r) => r.x === e.x + tx && r.y === e.y + ty && r.h === e.height && r.w !== e.width);
}

describe("T5022 — the headers meet: each strip is as wide as the desktop draws it (Paul, 2026-09-28)", () => {
  it("a generated pool's strip ends exactly where its lanes' strips begin — no gap — on the phone render", () => {
    const d = generated();
    const { tx, ty } = thumbnailFrameFor(d, FULL);
    const svg = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true });
    const pool = d.elements.find((e) => e.id === "p1")!;
    const lanes = d.elements.filter((e) => e.type === "lane" && e.parentId === "p1");
    expect(lanes).toHaveLength(3);
    const ps = stripOf(svg, pool, tx, ty)!;
    expect(ps.w, "the pool strip is the desktop's 36px, not 18").toBe(containerHeaderWidth(pool));
    expect(ps.w).toBe(36);
    for (const lane of lanes) {
      const ls = stripOf(svg, lane, tx, ty)!;
      expect(ls.w, lane.label).toBe(36);
      expect(ls.x, `${lane.label}: its strip starts where the pool's ends`).toBe(ps.x + ps.w);
    }
    expect(svg, "no fixed 18px strip is left anywhere").not.toContain('width="18"');
  });

  it("the compact template thumbnail has the same widths (its own grey palette unchanged)", () => {
    const d = generated();
    const { tx, ty } = thumbnailTransform(d.elements);
    const svg = renderTemplateThumbnailSvg(d);
    const pool = d.elements.find((e) => e.id === "p1")!;
    const lane = d.elements.find((e) => e.id === "l1")!;
    const ps = stripOf(svg, pool, tx, ty)!;
    const ls = stripOf(svg, lane, tx, ty)!;
    expect(ps).toMatchObject({ w: 36, fill: "#e2e8f0" });
    expect(ls.x).toBe(ps.x + ps.w);
  });
});

describe("T5023 — a resized header and a sub-lane are honoured", () => {
  const d = {
    elements: [
      { id: "bb", type: "pool", x: 0, y: 0, width: 700, height: 200, label: "Customer\nRelationship\nManagement System", properties: { poolType: "black-box", poolHeaderWidth: 65 } },
      { id: "p", type: "pool", x: 0, y: 250, width: 700, height: 450, label: "Claims", properties: { poolType: "white-box", poolHeaderWidth: 50 } },
      { id: "l1", type: "lane", x: 50, y: 250, width: 650, height: 150, label: "Finance", properties: { laneHeaderWidth: 44 }, parentId: "p" },
      { id: "s1", type: "lane", x: 94, y: 250, width: 606, height: 75, label: "Payables", properties: {}, parentId: "l1" },
      { id: "s2", type: "lane", x: 94, y: 325, width: 606, height: 75, label: "Receivables", properties: {}, parentId: "l1" },
      { id: "ss", type: "lane", x: 130, y: 325, width: 570, height: 75, label: "Refunds", properties: {}, parentId: "s2" },
      { id: "l2", type: "lane", x: 50, y: 400, width: 650, height: 150, label: "Operations", properties: { laneHeaderWidth: 44 }, parentId: "p" },
      { id: "l3", type: "lane", x: 50, y: 550, width: 650, height: 150, label: "Finance and Accounts Receivable Team Leaders", properties: { laneHeaderWidth: 44 }, parentId: "p" },
    ],
    connectors: [],
  } as unknown as DiagramData;
  const { tx, ty } = thumbnailFrameFor(d, FULL);
  const svg = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true });
  const el = (id: string) => d.elements.find((e) => e.id === id)!;
  /** The body drawn for `e`: the rect exactly covering it. */
  const bodyOf = (s: string, e: DiagramElement) =>
    rects(s).find((r) => r.x === e.x + tx && r.y === e.y + ty && r.w === e.width && r.h === e.height);

  it("pool → lane → sub-lane → sub-sub-lane strips abut at their stored widths", () => {
    const p = stripOf(svg, el("p"), tx, ty)!, l1 = stripOf(svg, el("l1"), tx, ty)!;
    const s2 = stripOf(svg, el("s2"), tx, ty)!, ss = stripOf(svg, el("ss"), tx, ty)!;
    expect([p.w, l1.w, s2.w, ss.w]).toEqual([50, 44, 36, 36]);
    expect(l1.x).toBe(p.x + p.w);
    expect(s2.x).toBe(l1.x + l1.w);
    expect(ss.x).toBe(s2.x + s2.w);
    expect(stripOf(svg, el("bb"), tx, ty)!.w).toBe(65);
  });

  it("painted with the desktop's colours: pool, lane, sub-lane and a lighter sub-sub-lane, each over its own tinted body", () => {
    const cases: [string, { header: string; body: string }][] = [
      ["p", poolPaint()], ["l1", lanePaint(0, "lane")], ["s1", lanePaint(1, "sublane")], ["ss", lanePaint(2, "sublane")],
    ];
    for (const [id, paint] of cases) {
      expect(stripOf(svg, el(id), tx, ty)!.fill, `${id} header`).toBe(paint.header);
      expect(bodyOf(svg, el(id))!.fill, `${id} body — the header's light tint, not plain white`).toBe(paint.body);
    }
    expect(lanePaint(2, "sublane").header, "a sub-sub-lane really is lighter").not.toBe(lanePaint(1, "sublane").header);
  });

  it("a project's own colours are used (the phone passes the colour config)", () => {
    const cfg = { pool: "#112233", lane: "#445566", sublane: "#778899" };
    const s = renderTemplateThumbnailSvg(d, { trueColors: true, colorConfig: cfg as never, fullLabels: true });
    expect(stripOf(s, el("p"), tx, ty)!.fill).toBe(poolPaint(cfg as never).header);
    expect(stripOf(s, el("l1"), tx, ty)!.fill).toBe(lanePaint(0, "lane", cfg as never).header);
    expect(stripOf(s, el("s1"), tx, ty)!.fill).toBe(lanePaint(1, "sublane", cfg as never).header);
    expect(poolPaint(cfg as never).header).toBe("#112233");
  });

  /** The rotated name columns drawn for `e` (their rotation centre is its mid-height). */
  const columns = (s: string, e: DiagramElement) =>
    [...s.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" transform="rotate\(-90[^"]*\)"[^>]*>([^<]*)<\/text>/g)]
      .filter((m) => Math.abs(+m[2] - (e.y + ty + e.height / 2)) < 0.11)
      .map((m) => ({ x: +m[1], text: m[3] }))
      .sort((a, b) => a.x - b.x);

  it("a name with its own three lines: three columns, centred in the 65px strip, a desktop line apart", () => {
    const cols = columns(svg, el("bb"));
    expect(cols.map((c) => c.text)).toEqual(["Customer", "Relationship", "Management System"]);
    expect(cols[1].x).toBeCloseTo(el("bb").x + tx + 65 / 2 + 3, 1);
    expect(cols[1].x - cols[0].x).toBeCloseTo(Math.round(16 * 1.18), 1);
  });

  it("a long one-line lane name: exactly the columns its 44px strip holds, all inside it, the last shortened", () => {
    const lane = el("l3");
    const cols = columns(svg, lane);
    expect(cols).toHaveLength(Math.floor((44 - 4) / Math.round(14 * 1.2)));
    for (const c of cols) {
      expect(c.x, c.text).toBeGreaterThan(lane.x + tx);
      expect(c.x, c.text).toBeLessThan(lane.x + tx + 44);
    }
    expect(cols[cols.length - 1].text.endsWith("…")).toBe(true);
  });
});

describe("T5024 — the names sit inside their strips, as the desktop sets them", () => {
  const baselines = (svg: string, text: string) =>
    [...svg.matchAll(/<text x="([\d.-]+)" y="[\d.-]+" transform="rotate\(-90[^"]*\)"[^>]*font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
      .filter((m) => text.includes(m[3].replace(/…$/, "")))
      .map((m) => ({ x: +m[1], fs: +m[2], text: m[3] }));

  it("a lane name is centred in its 36px strip at the desktop's 14px; a pool name at 16px", () => {
    const d = generated();
    const { tx } = thumbnailFrameFor(d, FULL);
    const svg = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true });
    const lane = d.elements.find((e) => e.id === "l2")!;
    const [w] = baselines(svg, "Warehouse");
    expect(w.fs).toBe(14);
    expect(w.x).toBe(lane.x + tx + 36 / 2 + 3);
    const [p] = baselines(svg, "Order Fulfilment");
    expect(p.fs).toBe(16);
  });

  it("the diagram's own pool / lane font sizes are used when it has them", () => {
    const d = { ...generated(), poolFontSize: 12, laneFontSize: 11 };
    const svg = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true });
    expect(baselines(svg, "Order Fulfilment")[0].fs).toBe(12);
    expect(baselines(svg, "Warehouse")[0].fs).toBe(11);
  });

  it("a name's own lines are kept, as the desktop draws them; a long one-line name wraps into exactly the room the strip has", () => {
    // Pre-wrapped by the layout (black-box pool names), strip sized for 3 lines.
    expect(stripLabelLines("Customer\nRelationship\nManagement System", 90, 65, 16, 19))
      .toEqual(["Customer", "Relationship", "Management System"]);
    // One line, too long for its band: two columns fit a 44px strip at 14px.
    const two = stripLabelLines("Finance and Accounts Receivable Team Leaders", 150, 44, 14, 17);
    expect(two).toHaveLength(Math.floor((44 - 4) / 17));
    expect(two[two.length - 1].endsWith("…"), "what does not fit is shortened, not spilled out of the strip").toBe(true);
    // One line that fits its band: left alone.
    expect(stripLabelLines("Sales", 300, 36, 14, 17)).toEqual(["Sales"]);
  });
});

describe("T5025 — the partner PDF (same renderer) gets the same headers", () => {
  it("renderDiagramSvg: the desktop's colours, a pool strip flush with its lanes', and the names", async () => {
    const { renderDiagramSvg } = await import("@/app/lib/partner/renderDiagramSvg");
    const d = generated();
    const { tx, ty } = thumbnailFrameFor(d, FULL);
    const svg = renderDiagramSvg(d as never);
    const pool = d.elements.find((e) => e.id === "p1")!;
    const lane = d.elements.find((e) => e.id === "l1")!;
    const ps = stripOf(svg, pool, tx, ty)!, ls = stripOf(svg, lane, tx, ty)!;
    expect(ps.w).toBe(36);
    expect(ls.x).toBe(ps.x + ps.w);
    expect(ps.fill).toBe(poolPaint().header);
    expect(svg).toMatch(/rotate\(-90[^>]*>Warehouse</);
  });
});

describe("T5026 — a pool name with lines of its own gets the header the desktop gives it (the 2026-09-28 review)", () => {
  // As the generator can save it: a white-box pool, a three-line name, NO stored
  // header width, lanes one default strip (36) in. The desktop widens the strip
  // on open (healOnLoad → healPoolHeaderWidths, growing the pool LEFT); the phone
  // and the partner PDF drew it at 36, with the name out of the pool and under
  // the lanes.
  const stored = {
    elements: [
      { id: "p", type: "pool", x: 100, y: 0, width: 600, height: 400, label: "Acme\nCustomer Service\nDepartment", properties: { poolType: "white-box" } },
      { id: "l1", type: "lane", x: 136, y: 0, width: 564, height: 200, label: "Sales", properties: {}, parentId: "p" },
      { id: "l2", type: "lane", x: 136, y: 200, width: 564, height: 200, label: "Warehouse", properties: {}, parentId: "p" },
    ],
    connectors: [],
  } as unknown as DiagramData;

  it("healPoolHeaderWidths (now in containerMetrics, still what the editor runs on open) widens the strip leftwards; the lanes stay put", async () => {
    const { healPoolHeaderWidths } = await import("@/app/lib/diagram/containerMetrics");
    const healed = healPoolHeaderWidths(stored);
    const p = healed.elements.find((e) => e.id === "p")!;
    const hw = p.properties.poolHeaderWidth as number;
    expect(hw).toBeGreaterThan(36);
    expect(p.x + hw, "the strip ends where the lanes begin").toBe(136);
    expect(healed.elements.find((e) => e.id === "l1")!.x).toBe(136);
    const { healPoolHeaderWidths: viaHook } = await import("@/app/hooks/useDiagram");
    expect(viaHook, "the editor's copy IS this one").toBe(healPoolHeaderWidths);
    expect(healPoolHeaderWidths({ elements: undefined } as unknown as DiagramData), "no elements: left alone").toEqual({ elements: undefined });
  });

  it("the partner PDF draws the healed pool: every line of the name inside the widened strip, which meets the lanes", async () => {
    const { renderDiagramSvg } = await import("@/app/lib/partner/renderDiagramSvg");
    const { healPoolHeaderWidths } = await import("@/app/lib/diagram/containerMetrics");
    const healed = healPoolHeaderWidths(stored);
    const pool = healed.elements.find((e) => e.id === "p")!;
    const { tx, ty } = thumbnailFrameFor(healed, FULL);
    const svg = renderDiagramSvg(stored);
    const strip = stripOf(svg, pool, tx, ty)!;
    expect(strip.w).toBe(pool.properties.poolHeaderWidth);
    expect(strip.x + strip.w).toBe(136 + tx);
    const cols = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" transform="rotate\(-90[^"]*\)"[^>]*>([^<]*)<\/text>/g)]
      .filter((m) => ["Acme", "Customer Service", "Department"].includes(m[3]));
    expect(cols).toHaveLength(3);
    for (const m of cols) {
      // The glyphs sit left of their baseline, by about the font's ascent.
      expect(+m[1] - 12, m[3]).toBeGreaterThanOrEqual(strip.x);
      expect(+m[1], m[3]).toBeLessThanOrEqual(strip.x + strip.w);
    }
  });

  it("the phone heals once, where it loads the diagram, so the picture, the pins and the taps agree", () => {
    // Changed 2026-09-28: the whole of the editor's heal-on-open (healOnLoad), not just the pool part.
    const src = readFileSync("app/m/diagram/[id]/MobileDiagramScreen.tsx", "utf8");
    expect(src).toContain("data: healOnLoad((j.data ?? { elements: [], connectors: [] }) as DiagramData),");
  });
});
