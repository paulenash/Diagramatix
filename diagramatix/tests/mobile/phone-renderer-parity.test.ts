/**
 * The phone viewer (and the partner PDF) draw a diagram as the website does.
 *
 * Paul, 2026-09-28: "1. Fix the 3 identified issues. 2. Render sequence
 * connectors as similar to the website rendering as possible, rectilinear with
 * rounded corners and crossing humps."
 *
 *   1. paint order — an expanded subprocess spanning lanes was hidden under
 *      them; composite states were drawn over their own transitions (and a
 *      BPMN group over everything in it);
 *   2. connectors — the website's path (curve, rounded corners, humps over
 *      earlier connectors), strokes, arrowheads, message-flow ends and label
 *      placement, from ONE shared module (connectorPath.ts) the canvas uses too;
 *   3. colours — the project's scheme under the diagram's own, or black and
 *      white in hand-drawn mode, as the editor paints.
 *
 * The parity check renders the REAL canvas ConnectorRenderer to markup and
 * compares its paths with the phone's, connector by connector.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ConnectorRenderer } from "@/app/components/canvas/ConnectorRenderer";
import { layoutBpmnPlan } from "@/app/lib/ai/layoutBpmnPlan";
import { healOnLoad } from "@/app/lib/diagram/healOnLoad";
import { renderTemplateThumbnailSvg, thumbnailFrameFor } from "@/app/lib/diagram/templateThumbnail";

/** The phone / partner render — and the frame it is drawn in. */
const FULL = { trueColors: true, fullLabels: true } as const;
import {
  connectorPathD, humpOthersById, isHumpType, pathWithHumps, flowMarkerShape, branchPercentPlacement,
  isBranchLabelSuppressed, connectorShowsLabel,
} from "@/app/lib/diagram/connectorPath";
import { visibleWaypoints, connectorStroke, poolPaint, headedContainerPaint } from "@/app/lib/diagram/canvasPaint";
import { connectorLabelBox } from "@/app/lib/diagram/checks/layoutViolations";
import { BW_SYMBOL_COLORS, effectiveSymbolColors } from "@/app/lib/diagram/colors";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8");

/** A generated order process with loop-backs: two sequence×sequence crossings, message flows, gateway branch labels. */
const PLAN = {
  elements: [
    { id: "cust", type: "pool", label: "Customer", poolType: "black-box" },
    { id: "p1", type: "pool", label: "Order Fulfilment", poolType: "white-box" },
    { id: "l1", type: "lane", label: "Sales", parentPool: "p1" },
    { id: "l2", type: "lane", label: "Warehouse", parentPool: "p1" },
    { id: "l3", type: "lane", label: "Finance", parentPool: "p1" },
    { id: "s", type: "start-event", label: "Order received", pool: "p1", lane: "l1" },
    { id: "t1", type: "task", label: "Check order", taskType: "user", pool: "p1", lane: "l1" },
    { id: "g1", type: "gateway", label: "Order valid?", gatewayType: "exclusive", pool: "p1", lane: "l1" },
    { id: "t0", type: "task", label: "Request correction", taskType: "send", pool: "p1", lane: "l1" },
    { id: "t2", type: "task", label: "Pick and pack", taskType: "manual", pool: "p1", lane: "l2" },
    { id: "t3", type: "task", label: "Check credit", taskType: "service", pool: "p1", lane: "l3" },
    { id: "g2", type: "gateway", label: "Stock and credit OK?", gatewayType: "exclusive", pool: "p1", lane: "l2" },
    { id: "t5", type: "task", label: "Back-order items", taskType: "user", pool: "p1", lane: "l2" },
    { id: "t4", type: "task", label: "Raise invoice", taskType: "service", pool: "p1", lane: "l3" },
    { id: "e", type: "end-event", label: "Order complete", pool: "p1", lane: "l3" },
    { id: "e2", type: "end-event", label: "Order rejected", pool: "p1", lane: "l1" },
  ],
  connections: [
    { sourceId: "cust", targetId: "s", type: "message", label: "Order" },
    { sourceId: "s", targetId: "t1", type: "sequence" },
    { sourceId: "t1", targetId: "g1", type: "sequence" },
    { sourceId: "g1", targetId: "t2", type: "sequence", label: "Yes" },
    { sourceId: "g1", targetId: "t0", type: "sequence", label: "No - details missing" },
    { sourceId: "t0", targetId: "cust", type: "message", label: "Correction request" },
    { sourceId: "t0", targetId: "t1", type: "sequence" },
    { sourceId: "t0", targetId: "e2", type: "sequence", label: "Abandoned" },
    { sourceId: "t2", targetId: "t3", type: "sequence" },
    { sourceId: "t3", targetId: "g2", type: "sequence" },
    { sourceId: "g2", targetId: "t4", type: "sequence", label: "Yes" },
    { sourceId: "g2", targetId: "t5", type: "sequence", label: "No" },
    { sourceId: "t5", targetId: "t2", type: "sequence", label: "Stock arrived" },
    { sourceId: "t4", targetId: "e", type: "sequence" },
    { sourceId: "t4", targetId: "cust", type: "message", label: "Invoice" },
    { sourceId: "t5", targetId: "e2", type: "sequence", label: "Cancelled" },
    { sourceId: "t3", targetId: "t0", type: "sequence", label: "Credit refused" },
    { sourceId: "t4", targetId: "t1", type: "sequence", label: "Re-check" },
  ],
};

function generated(): DiagramData {
  const laid = layoutBpmnPlan(PLAN);
  if (!laid.ok) throw new Error("the plan did not lay out");
  return healOnLoad(laid.diagramData);
}

/** A path's commands with every COORDINATE shifted by (dx, dy) (arc radii and flags are not coordinates). */
function pathNumbers(d: string, dx = 0, dy = 0): number[] {
  const toks = d.match(/[MLQCA]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: number[] = [];
  let cmd = "", i = 0;
  const arity: Record<string, number> = { M: 2, L: 2, Q: 4, C: 6, A: 7 };
  const buf: number[] = [];
  const flush = () => {
    buf.forEach((v, k) => {
      const isCoord = cmd === "A" ? k === 5 || k === 6 : true;
      const isX = cmd === "A" ? k === 5 : k % 2 === 0;
      out.push(isCoord ? v + (isX ? dx : dy) : v);
    });
    buf.length = 0;
  };
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (/^[MLQCA]$/i.test(t)) { cmd = t.toUpperCase(); out.push(cmd.charCodeAt(0) * 1000); continue; }
    buf.push(Number(t));
    if (buf.length === arity[cmd]) flush();
  }
  return out;
}
const close = (a: number[], b: number[]) => a.length === b.length && a.every((v, k) => Math.abs(v - b[k]) < 1e-6);

/** The line the canvas draws for `c` (the visible path — not its transparent hit area). */
function websitePath(c: Connector, d: DiagramData, others: Map<string, ReturnType<typeof visibleWaypoints>[]>): string {
  const byId = new Map(d.elements.map((e) => [e.id, e] as const));
  const markup = renderToStaticMarkup(React.createElement(ConnectorRenderer as never, {
    connector: c, selected: false, onSelect: () => {},
    otherConnectorWaypoints: isHumpType(c.type) ? others.get(c.id) : undefined,
    sourceType: byId.get(c.sourceId)?.type, sourceIsPool: byId.get(c.sourceId)?.type === "pool",
    targetIsPool: byId.get(c.targetId)?.type === "pool", relaxedLayout: d.relaxedLayout,
  } as never));
  const lines = [...markup.matchAll(/<path d="([^"]+)" fill="none" stroke="(#[0-9a-f]{6})"/gi)].map((m) => m[1]);
  if (lines.length !== 1) throw new Error(`expected one visible line for ${c.id}, found ${lines.length}`);
  return lines[0];
}
const phonePath = (svg: string, id: string) => svg.match(new RegExp(`<path data-id="${id}" d="([^"]+)"`))?.[1];

describe("T5027 — one copy of the line rules (connectorPath.ts), with the website's exact output", () => {
  it("rounded corners: r = min(8, 45% of each side), as Q curves at each bend", () => {
    const vis = [{ x: 194, y: 404 }, { x: 226, y: 404 }, { x: 226, y: 323.5 }, { x: 264, y: 323.5 }];
    expect(connectorPathD({ type: "sequence", routingType: "rectilinear" }, vis))
      .toBe("M 194 404 L 218 404 Q 226 404 226 396 L 226 331.5 Q 226 323.5 234 323.5 L 264 323.5");
  });

  it("a hump: a 6px semicircle where the line crosses an earlier one", () => {
    expect(pathWithHumps([{ x: 0, y: 50 }, { x: 100, y: 50 }], [[{ x: 50, y: 0 }, { x: 50, y: 100 }]]))
      .toBe("M 0 50 L 44 50 A 6 6 0 0 1 56 50 L 100 50");
    // No crossing → no hump path (the caller falls back to rounded corners).
    expect(pathWithHumps([{ x: 0, y: 50 }, { x: 100, y: 50 }], [[{ x: 200, y: 0 }, { x: 200, y: 100 }]])).toBe("");
  });

  it("who jumps over whom: sequence / association connectors, each over the ones before it; message flows never", () => {
    const c = (id: string, type: string, x: number) => ({ id, type, sourceId: "a", targetId: "b", waypoints: [{ x, y: 0 }, { x, y: 10 }] }) as unknown as Connector;
    const m = humpOthersById([c("s1", "sequence", 1), c("m1", "messageBPMN", 2), c("s2", "sequence", 3), c("a1", "association", 4)]);
    expect(m.get("s1")).toEqual([]);
    expect(m.get("s2")).toEqual([[{ x: 1, y: 0 }, { x: 1, y: 10 }]]);
    expect(m.get("a1")).toHaveLength(2);
    expect(m.has("m1")).toBe(false);
    expect([isHumpType("sequence"), isHumpType("messageBPMN"), isHumpType("associationBPMN")]).toEqual([true, false, false]);
  });

  it("a curved state-machine transition: a 4px stub at each end and a cubic curve", () => {
    const vis = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 60, y: 40 }, { x: 100, y: 40 }];
    expect(connectorPathD({ type: "transition", routingType: "curvilinear" }, vis))
      .toBe("M 0 0 L 4 0 C 40 0, 60 40, 96 40 L 100 40");
  });

  it("the small rules: default / conditional marks, the branch share, hidden branch labels, which types carry a label", () => {
    const vis = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    expect(flowMarkerShape({ type: "sequence", isDefaultFlow: true }, vis)).toMatchObject({ kind: "slash" });
    expect(flowMarkerShape({ type: "sequence", branchCondition: "amount > 100" }, vis, "task")).toMatchObject({ kind: "diamond" });
    expect(flowMarkerShape({ type: "sequence", branchCondition: "amount > 100" }, vis, "gateway"), "never on a gateway's branch").toBeNull();
    expect(branchPercentPlacement({ type: "sequence", branchPercent: 30 }, vis)).toEqual({ x: 26, y: 8, text: "30%" });
    expect(isBranchLabelSuppressed({ labelAnchor: "source" }, "parallel")).toBe(true);
    expect(isBranchLabelSuppressed({ labelAnchor: "source" }, "exclusive")).toBe(false);
    expect(connectorShowsLabel({ type: "associationBPMN", label: "x" } as never)).toBe(false);
    expect(connectorShowsLabel({ type: "messageBPMN" } as never)).toBe(true);
  });

  it("the canvas draws through it: ConnectorRenderer and Canvas import the shared rules, and keep no copy", () => {
    const cr = read("app/components/canvas/ConnectorRenderer.tsx");
    const cv = read("app/components/canvas/Canvas.tsx");
    expect(cr).toContain("const visibleD = connectorPathD(connector, visibleWaypoints, otherConnectorWaypoints);");
    expect(cr).toContain("{connectorShowsLabel(connector) && (");
    expect(cr).not.toMatch(/function pathWithHumps|function segmentIntersection/);
    expect(cv).toContain("const he = rc.filter(c => isHumpType(c.type));");
    expect(cv).toContain("if (isBranchLabelSuppressed(c, gwMarker.get(c.sourceId))) hiddenLabelConnIds.add(c.id);");
  });
});

describe("T5028 — the phone draws every connector line exactly as the website does (parity against the real ConnectorRenderer)", () => {
  const d = generated();
  const { tx, ty } = thumbnailFrameFor(d, FULL);
  const svg = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true });
  const others = humpOthersById(d.connectors);

  it("the diagram has what the test is about: rounded corners and at least two humps", () => {
    const humps = d.connectors.filter((c) => /\bA\b/.test(phonePath(svg, c.id) ?? ""));
    expect(humps.length).toBeGreaterThanOrEqual(2);
    expect(d.connectors.some((c) => /\bQ\b/.test(phonePath(svg, c.id) ?? ""))).toBe(true);
  });

  it("every connector: the phone's path, shifted back to the diagram's coordinates, IS the website's path", () => {
    expect(d.connectors.length).toBe(18);
    for (const c of d.connectors) {
      const phone = phonePath(svg, c.id);
      expect(phone, c.id).toBeTruthy();
      const web = websitePath(c, d, others);
      expect(close(pathNumbers(phone!, -tx, -ty), pathNumbers(web)), `${c.id} (${c.type})\nphone: ${phone}\nweb:   ${web}`).toBe(true);
    }
  });
});

describe("T5029 — strokes, arrowheads, message flows and labels as the website draws them", () => {
  const d = generated();
  const { tx, ty } = thumbnailFrameFor(d, FULL);
  const svg = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true });
  const byType = (t: string) => d.connectors.filter((c) => c.type === t);
  const tag = (id: string) => svg.match(new RegExp(`<path data-id="${id}"[^>]*>`))![0];

  it("a sequence flow: grey #6b7280 at 1.5 with the canvas's filled arrowhead (10×7, tip at 9)", () => {
    const t = tag(byType("sequence")[0].id);
    expect(t).toContain(`stroke="${connectorStroke("sequence")}" stroke-width="1.5"`);
    expect(t).toContain('marker-end="url(#dgxm-arrow-6b7280)"');
    expect(svg).toContain('<marker id="dgxm-arrow-6b7280" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto" overflow="visible"><polygon points="0 0, 10 3.5, 0 7" fill="#6b7280"/></marker>');
  });

  it("a message flow: pale dashed line, hollow circle at the start, hollow triangle at the end — and drawn ABOVE the elements", () => {
    const m = byType("messageBPMN")[0];
    const t = tag(m.id);
    expect(t).toContain('stroke="#b0b7c3"');
    expect(t).toContain('stroke-dasharray="10 5"');
    expect(t).toContain('marker-start="url(#dgxm-msgStart-b0b7c3)"');
    expect(t).toContain('marker-end="url(#dgxm-msgEnd-b0b7c3)"');
    const lastTask = Math.max(...[...svg.matchAll(/<rect [^>]*rx="6"/g)].map((x) => x.index!));
    expect(svg.indexOf(t), "after the last task").toBeGreaterThan(lastTask);
    const seqAt = svg.indexOf(tag(byType("sequence")[0].id));
    expect(seqAt, "sequence flows stay beneath the tasks").toBeLessThan(lastTask);
  });

  it("labels sit where the canvas puts them (connectorLabelBox), at its size and colour, with a white halo", () => {
    const labelled = d.connectors.filter((c) => c.label?.trim() && connectorShowsLabel(c));
    expect(labelled.length).toBeGreaterThan(5);
    for (const c of labelled) {
      const box = connectorLabelBox(c, d.elements, 10)!;
      const x = (box.x + box.w / 2 + tx).toFixed(1), y = (box.y + ty + 14 * 0.85).toFixed(1);
      expect(svg, c.label).toContain(`<tspan x="${x}" y="${y}">`);
    }
    expect(svg).toContain('font-size="10" fill="#374151" paint-order="stroke" stroke="#ffffff" stroke-width="2.5"');
  });

  it("a generated gateway branch shows its dashed tether, as on the website", () => {
    expect(svg).toMatch(/<line [^>]*stroke="#6b7280" stroke-width="1" stroke-dasharray="4 3"/);
  });

  it("a branch label under a Parallel gateway is not drawn; the compact template preview keeps its own simple lines", () => {
    const par = { ...d, elements: d.elements.map((e) => (e.id === "g1" ? { ...e, gatewayType: "parallel" } : e)) } as DiagramData;
    const yes = d.connectors.find((c) => c.sourceId === "g1" && c.label === "Yes")!;
    expect(yes.labelAnchor).toBe("source");
    const box = connectorLabelBox(yes, d.elements, 10)!;
    const s2 = renderTemplateThumbnailSvg(par, { trueColors: true, fullLabels: true });
    expect(s2).not.toContain(`<tspan x="${(box.x + box.w / 2 + tx).toFixed(1)}" y="${(box.y + ty + 11.9).toFixed(1)}">Yes</tspan>`);
    const compact = renderTemplateThumbnailSvg(d);
    expect(compact).toContain('marker-end="url(#tmarr)"');
    expect(compact).not.toContain("dgxm-");
  });
});

describe("T5030 — paint order and containers as the canvas has them", () => {
  const els = [
    { id: "p", type: "pool", x: 0, y: 0, width: 800, height: 360, label: "Claims", properties: { poolType: "white-box" } },
    { id: "l1", type: "lane", x: 36, y: 0, width: 764, height: 120, label: "Intake", properties: {}, parentId: "p" },
    { id: "l2", type: "lane", x: 36, y: 120, width: 764, height: 120, label: "Assess", properties: {}, parentId: "p" },
    { id: "l3", type: "lane", x: 36, y: 240, width: 764, height: 120, label: "Pay", properties: {}, parentId: "p" },
    { id: "ep", type: "subprocess-expanded", x: 120, y: 40, width: 360, height: 260, label: "Review claim", properties: {}, parentId: "p" },
    { id: "t1", type: "task", x: 160, y: 80, width: 100, height: 60, label: "Check", properties: {}, parentId: "ep" },
    { id: "g", type: "group", x: 540, y: 30, width: 220, height: 180, label: "Finance checks", properties: {} },
    { id: "t3", type: "task", x: 590, y: 90, width: 110, height: 60, label: "Approve", properties: {}, parentId: "l1" },
    { id: "rl", type: "subprocess", x: 600, y: 300, width: 80, height: 40, label: "Back", properties: { isReturnLink: true } },
  ] as unknown as DiagramElement[];
  const d = { elements: els, connectors: [] } as unknown as DiagramData;
  const svg = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true });
  const { tx, ty } = thumbnailFrameFor(d, FULL);
  const at = (e: DiagramElement) => svg.indexOf(`x="${e.x + tx}" y="${e.y + ty}" width="${e.width}" height="${e.height}"`);
  const el = (id: string) => els.find((e) => e.id === id)!;

  it("an expanded subprocess spanning lanes is drawn AFTER the lanes (it was hidden under them)", () => {
    for (const l of ["l1", "l2", "l3"]) expect(at(el("ep")), l).toBeGreaterThan(at(el(l)));
    expect(at(el("t1"))).toBeGreaterThan(at(el("ep")));
  });

  it("a group is a dashed outline with the faintest wash, drawn after the flow elements — never a filled box over them", () => {
    const g = svg.slice(at(el("g")) - 6, svg.indexOf("/>", at(el("g"))) + 2);
    expect(g).toContain('fill-opacity="0.15"');
    expect(g).toContain('stroke-dasharray="10 3.5 2 3.5"');
    expect(at(el("g"))).toBeGreaterThan(at(el("t3")));
  });

  it("what the canvas never draws is not drawn (a return-link subprocess)", () => {
    expect(svg).not.toContain(">Back<");
  });

  it("a composite state: a see-through body and a solid header band, BEHIND its transitions, with its region divider", () => {
    const sm = {
      elements: [
        { id: "cs", type: "composite-state", x: 0, y: 0, width: 420, height: 240, label: "Processing", properties: { regionCount: 2 } },
        { id: "a", type: "state", x: 40, y: 60, width: 120, height: 50, label: "Validating", properties: {}, parentId: "cs" },
        { id: "b", type: "state", x: 260, y: 60, width: 120, height: 50, label: "Approved", properties: {}, parentId: "cs" },
      ],
      connectors: [
        { id: "tr", type: "transition", sourceId: "a", targetId: "b", directionType: "open-directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false,
          waypoints: [{ x: 160, y: 85 }, { x: 260, y: 85 }] },
      ],
    } as unknown as DiagramData;
    const s = renderTemplateThumbnailSvg(sm, { trueColors: true, fullLabels: true });
    const paint = headedContainerPaint("composite-state");
    expect(s).toContain(`fill="${paint.body}" fill-opacity="${paint.bodyOpacity}"`);
    expect(s).toContain('stroke-dasharray="6 4"');
    expect(s.indexOf('fill-opacity="0.4"'), "the body first").toBeLessThan(s.indexOf('data-id="tr"'));
    expect(s).toContain('marker-end="url(#dgxm-open-6b7280)"');
  });
});

describe("T5031 — the colours the editor paints with, and the editor's heal on open", () => {
  it("the phone takes the project's scheme under the diagram's own, or black and white when hand-drawn", () => {
    const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
    expect(screen).toContain("colorConfig: effectiveSymbolColors(j.projectColorConfig, j.colorConfig, j.displayMode),");
    const route = read("app/api/diagrams/[id]/route.ts");
    expect(route).toContain("include: { project: { select: { colorConfig: true } } }");
    expect(route).toContain("projectColorConfig: project?.colorConfig ?? null,");
    // What that yields, drawn.
    const d = generated();
    const { tx, ty } = thumbnailFrameFor(d, FULL);
    const pool = d.elements.find((e) => e.id === "p1")!;
    const project = { pool: "#123456" };
    const s = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true, colorConfig: effectiveSymbolColors(project, {}, "normal") });
    expect(s).toContain(`x="${pool.x + tx}" y="${pool.y + ty}" width="${pool.properties.poolHeaderWidth ?? 36}" height="${pool.height}" fill="${poolPaint(project as never).header}"`);
    const bw = renderTemplateThumbnailSvg(d, { trueColors: true, fullLabels: true, colorConfig: effectiveSymbolColors(project, {}, "hand-drawn") });
    expect(bw).toContain(`fill="${poolPaint(BW_SYMBOL_COLORS).header}"`);
  });

  it("healOnLoad is one function: the editor's (re-exported by the hook), the phone's and the partner PDF's", async () => {
    const { healOnLoad: viaHook } = await import("@/app/hooks/useDiagram");
    expect(viaHook).toBe(healOnLoad);
    expect(read("app/lib/partner/renderDiagramSvg.ts")).toContain("const data = healOnLoad(stored);");
  });
});

describe("T5032 — the review's three: a label far from its line stays in the picture; hidden things are not tapped; a note's tether hides with it", () => {
  it("a connector label dragged above the top row is inside the frame — the phone, its pins and the PDF page share that frame", () => {
    const d = {
      elements: [
        { id: "a", type: "state", x: 100, y: 100, width: 120, height: 50, label: "Draft", properties: {} },
        { id: "b", type: "state", x: 360, y: 100, width: 120, height: 50, label: "Sent", properties: {} },
      ],
      connectors: [
        { id: "tr", type: "transition", sourceId: "a", targetId: "b", directionType: "open-directed", routingType: "rectilinear",
          sourceInvisibleLeader: false, targetInvisibleLeader: false, label: "submit", labelOffsetY: -70,
          waypoints: [{ x: 220, y: 125 }, { x: 360, y: 125 }] },
      ],
    } as unknown as DiagramData;
    const svg = renderTemplateThumbnailSvg(d, FULL);
    const y = Number(svg.match(/<tspan x="[\d.-]+" y="([\d.-]+)">submit<\/tspan>/)![1]);
    expect(y, "the label's baseline is inside the picture").toBeGreaterThan(0);
    const { h } = thumbnailFrameFor(d, FULL);
    expect(svg).toContain(`viewBox="0 0 ${thumbnailFrameFor(d, FULL).w.toFixed(0)} ${h.toFixed(0)}"`);
    for (const f of ["app/components/mobile/MobileDiagramView.tsx", "app/m/diagram/[id]/MobileDiagramScreen.tsx", "app/lib/partner/renderDiagramSvg.ts"]) {
      expect(read(f), f).toContain("thumbnailFrameFor(");
    }
  });

  it("the phone's taps skip what the picture does not show (a pain point with pain points off)", () => {
    const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
    expect(screen.match(/!isHiddenOnCanvas\(e, d\.data\)/g) ?? []).toHaveLength(2);
  });

  it("a review note's tether is not drawn when the notes are hidden (partner PDF, template previews)", () => {
    const d = {
      showReviewComments: false,
      elements: [
        { id: "t", type: "task", x: 0, y: 0, width: 100, height: 60, label: "Task", properties: {} },
        { id: "rc", type: "review-comment", x: 200, y: 0, width: 120, height: 60, label: "Why?", properties: {} },
      ],
      connectors: [
        { id: "lk", type: "review-comment-link", sourceId: "rc", targetId: "t", directionType: "non-directed", routingType: "direct",
          sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [{ x: 200, y: 30 }, { x: 100, y: 30 }] },
      ],
    } as unknown as DiagramData;
    expect(renderTemplateThumbnailSvg(d, FULL)).not.toContain('data-id="lk"');
    expect(renderTemplateThumbnailSvg({ ...d, showReviewComments: true } as DiagramData, FULL)).toContain('data-id="lk"');
    // The compact preview draws its own simple line: gone with the notes, there with them.
    const tether = /<path d="M 214.0 44.0 L 114.0 44.0"/;
    expect(renderTemplateThumbnailSvg(d)).not.toMatch(tether);
    expect(renderTemplateThumbnailSvg({ ...d, showReviewComments: true } as DiagramData)).toMatch(tether);
  });
});
