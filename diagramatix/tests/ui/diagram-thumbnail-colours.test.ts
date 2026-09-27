/**
 * The Project screen's diagram tile pictures are drawn in the diagram's REAL
 * colours.
 *
 * Paul, 2026-09-27: "Redo the diagram images displayed on the Diagram tiles in
 * more realistic colour matching the actual diagram colours better. In BPMN
 * diagrams the pool and lane background colours are shown too dark. Archimate
 * diagrams are all washed out. Improve them for all diagram types."
 *
 * Why they drifted: the tile had its own copy of every colour rule. A pool was
 * filled edge to edge with its HEADER colour (the canvas draws a very light body
 * and a coloured strip); every ArchiMate element fell through to the generic
 * "archimate-shape" colour, white (the canvas colours it from its layer theme);
 * and the whole picture sat at 90% opacity on the type-tinted tile.
 *
 * The fix is one rule, one place: app/lib/diagram/canvasPaint.ts holds how the
 * canvas paints an element, the canvas calls it, and the tile picture
 * (app/lib/diagram/diagramThumbnail.ts) calls it. These tests pin that the
 * picture's colour for an element EQUALS the canvas rule's for the same element
 * and colour config, and that both sides really call the shared rule.
 */
import { describe, it, expect } from "vitest";
import { renderTemplateThumbnailSvg } from "@/app/lib/diagram/templateThumbnail";
import fs from "node:fs";
import path from "node:path";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";
import { BW_SYMBOL_COLORS, DEFAULT_SYMBOL_COLORS, effectiveSymbolColors, type SymbolColorConfig } from "@/app/lib/diagram/colors";
import {
  elementFill, poolPaint, lanePaint, archimatePaint, archimateEntryFromKey, headedContainerPaint,
  connectorStroke, connectorDash, nestedContainerFill, lerpHex, ARCHI_STROKE_WIDTH, SHAPE_STROKE,
} from "@/app/lib/diagram/canvasPaint";
import { buildDiagramThumbnail, THUMB_MIN_STROKE_ZOOM, type ThumbShape } from "@/app/lib/diagram/diagramThumbnail";
import { getThemeFor } from "@/app/lib/archimate/themes";
import type { ArchimateCatalogue } from "@/app/lib/archimate/catalogue";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const CATALOGUE = JSON.parse(read("public", "archimate-catalogue.json")) as ArchimateCatalogue;
const ENTRIES = CATALOGUE.categories.flatMap((c) => c.shapes);
const entryFor = (key: string) => ENTRIES.find((e) => e.key === key)!;

let seq = 0;
function el(type: string, x: number, y: number, w: number, h: number, extra: Partial<DiagramElement> = {}): DiagramElement {
  return { id: extra.id ?? `e${++seq}`, type, x, y, width: w, height: h, label: "", properties: {}, ...extra } as DiagramElement;
}
const data = (elements: DiagramElement[], connectors: Connector[] = []): DiagramData =>
  ({ elements, connectors } as unknown as DiagramData);

/** The picture's shapes covering exactly this box (the element's body). */
const bodyOf = (shapes: ThumbShape[], e: DiagramElement) =>
  shapes.filter((s) => s.k === "rect" && s.x === e.x && s.y === e.y && s.h === e.height);

/** Relative luminance (0 = black … 1 = white) of a #rrggbb colour. */
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

// A project that has re-coloured things, so "equals the default" can't pass by luck.
const PROJECT: SymbolColorConfig = { pool: "#8fb3d9", lane: "#b9d3ec", sublane: "#dfeaf5", task: "#ffe4b5" };

describe("T4957 — BPMN pools and lanes are light, like the canvas", () => {
  const pool = el("pool", 0, 0, 1200, 400, { id: "pool" });
  const lane = el("lane", 0, 0, 1200, 200, { id: "lane", parentId: "pool" });
  const sub = el("lane", 36, 0, 1164, 100, { id: "sub", parentId: "lane" });
  const lane2 = el("lane", 0, 200, 1200, 200, { id: "lane2", parentId: "pool", properties: { laneHeaderWidth: 50 } });
  const task = el("task", 200, 40, 120, 60, { id: "task", parentId: "sub" });
  const thumb = buildDiagramThumbnail(data([pool, lane, sub, lane2, task]), PROJECT, 168, 96)!;

  it("a pool is a light body with a header strip — exactly the canvas's poolPaint", () => {
    const [body, strip] = bodyOf(thumb.shapes, pool) as Extract<ThumbShape, { k: "rect" }>[];
    const p = poolPaint(PROJECT);
    expect(body.w).toBe(pool.width);
    expect(body.fill).toBe(p.body);
    expect(strip.w).toBe(36);
    expect(strip.fill).toBe(p.header);
    expect(p.header).toBe("#8fb3d9");
    // The regression: the whole pool used to be filled with the HEADER colour.
    expect(body.fill).not.toBe(p.header);
    expect(lum(body.fill)).toBeGreaterThan(0.9);
  });

  it("lanes and sub-lanes take lanePaint with the canvas's depth — header strip width included", () => {
    const [laneBody, laneStrip] = bodyOf(thumb.shapes, lane) as Extract<ThumbShape, { k: "rect" }>[];
    expect(laneBody.fill).toBe(lanePaint(0, "lane", PROJECT).body);
    expect(laneStrip.fill).toBe(lanePaint(0, "lane", PROJECT).header);
    expect(laneStrip.fill).toBe("#b9d3ec");
    const [subBody, subStrip] = bodyOf(thumb.shapes, sub) as Extract<ThumbShape, { k: "rect" }>[];
    expect(subStrip.fill, "a sub-lane takes the sublane colour").toBe(lanePaint(1, "sublane", PROJECT).header);
    expect(subStrip.fill).toBe("#dfeaf5");
    expect(subBody.fill).toBe(lanePaint(1, "sublane", PROJECT).body);
    const [, lane2Strip] = bodyOf(thumb.shapes, lane2) as Extract<ThumbShape, { k: "rect" }>[];
    expect(lane2Strip.w, "stored laneHeaderWidth").toBe(50);
    for (const b of [laneBody, subBody]) expect(lum(b.fill)).toBeGreaterThan(0.9);
  });

  it("a sub-sub-lane is lightened a level further, as the canvas does", () => {
    expect(lanePaint(2, "sublane", PROJECT).header).toBe(lerpHex("#dfeaf5", "#ffffff", 0.25));
    expect(lanePaint(1, "sublane", PROJECT).header).toBe("#dfeaf5");
  });

  it("a BPMN task is its canvas colour; a per-element fillColor (heat map, theme) wins", () => {
    const [body] = bodyOf(thumb.shapes, task) as Extract<ThumbShape, { k: "rect" }>[];
    expect(body.fill).toBe(elementFill(task, PROJECT));
    expect(body.fill).toBe("#ffe4b5");
    const hot = el("task", 0, 0, 100, 60, { properties: { fillColor: "#ef4444" } });
    const [hotBody] = bodyOf(buildDiagramThumbnail(data([hot]), PROJECT, 168, 96)!.shapes, hot) as Extract<ThumbShape, { k: "rect" }>[];
    expect(hotBody.fill).toBe("#ef4444");
    expect(elementFill(hot, PROJECT)).toBe("#ef4444");
  });

  it("paints like the canvas: pool, then lanes, then connectors, then the task on top", () => {
    const seqFlow = { id: "c1", type: "sequence", sourceId: "task", targetId: "task", waypoints: [{ x: 0, y: 0 }, { x: 10, y: 0 }] } as unknown as Connector;
    const t = buildDiagramThumbnail(data([task, lane, pool], [seqFlow]), PROJECT, 168, 96)!;
    const idx = (pred: (s: ThumbShape) => boolean) => t.shapes.findIndex(pred);
    const poolAt = idx((s) => s.k === "rect" && s.w === pool.width && s.h === pool.height);
    const laneAt = idx((s) => s.k === "rect" && s.w === lane.width && s.h === lane.height);
    const lineAt = idx((s) => s.k === "polyline");
    const taskAt = idx((s) => s.k === "rect" && s.x === task.x && s.y === task.y);
    expect(poolAt).toBeLessThan(laneAt);
    expect(laneAt).toBeLessThan(lineAt);
    expect(lineAt).toBeLessThan(taskAt);
  });
});

describe("T4958 — ArchiMate elements take their layer colours, like the canvas", () => {
  const cases = [
    { key: "business-business-process-box", layer: "business" },
    { key: "application-application-component-box", layer: "application" },
    { key: "technology-node-box", layer: "technology" },
    { key: "motivation-goal-icon", layer: "motivation" },
    { key: "strategy-capability-icon", layer: "strategy" },
    { key: "implementation-migration-work-package", layer: "implementation-migration" },
  ];

  for (const { key, layer } of cases) {
    it(`${layer}: fill and outline equal the canvas's archimatePaint for the real catalogue entry`, () => {
      const e = el("archimate-shape", 0, 0, 160, 70, { properties: { shapeKey: key } });
      const [body] = bodyOf(buildDiagramThumbnail(data([e]), DEFAULT_SYMBOL_COLORS, 168, 96)!.shapes, e) as Extract<ThumbShape, { k: "rect" }>[];
      // What the canvas draws: ArchimateShape → archimatePaint(el, catalogueEntry, depth).
      const canvas = archimatePaint(e, entryFor(key), 0);
      expect(body.fill).toBe(canvas.fill);
      expect(body.stroke).toBe(canvas.stroke);
      expect(body.fill).toBe(getThemeFor(layer)!.fill);
      // The regression: every ArchiMate element used to be white.
      expect(body.fill).not.toBe("#ffffff");
      expect(body.fill).not.toBe(DEFAULT_SYMBOL_COLORS["archimate-shape"]);
    });
  }

  it("a container is lightened per level of what it holds, as on the canvas", () => {
    const parent = el("archimate-shape", 0, 0, 400, 300, { id: "p", properties: { shapeKey: "application-application-component-box" } });
    const child = el("archimate-shape", 20, 40, 160, 70, { id: "c", parentId: "p", properties: { shapeKey: "application-application-component-box" } });
    const t = buildDiagramThumbnail(data([child, parent]), undefined, 168, 96)!;
    const [pBody] = bodyOf(t.shapes, parent) as Extract<ThumbShape, { k: "rect" }>[];
    const [cBody] = bodyOf(t.shapes, child) as Extract<ThumbShape, { k: "rect" }>[];
    expect(pBody.fill).toBe(archimatePaint(parent, entryFor("application-application-component-box"), 1).fill);
    expect(cBody.fill).toBe(archimatePaint(child, entryFor("application-application-component-box"), 0).fill);
    expect(lum(pBody.fill)).toBeGreaterThan(lum(cBody.fill));
    expect(t.shapes.indexOf(pBody), "the parent paints behind its child").toBeLessThan(t.shapes.indexOf(cBody));
  });

  it("an element's own fill/stroke overrides the theme", () => {
    const e = el("archimate-shape", 0, 0, 160, 70, { properties: { shapeKey: "business-business-process-box", fill: "#123456", stroke: "#654321" } });
    const [body] = bodyOf(buildDiagramThumbnail(data([e]), undefined, 168, 96)!.shapes, e) as Extract<ThumbShape, { k: "rect" }>[];
    expect(body.fill).toBe("#123456");
    expect(body.stroke).toBe("#654321");
  });

  it("the outline is the canvas's heavier ArchiMate stroke, relative to the other notations", () => {
    const a = el("archimate-shape", 0, 0, 160, 70, { properties: { shapeKey: "business-business-process-box" } });
    const t = el("task", 200, 0, 160, 70);
    const shapes = buildDiagramThumbnail(data([a, t]), undefined, 168, 96)!.shapes;
    const [ab] = bodyOf(shapes, a) as Extract<ThumbShape, { k: "rect" }>[];
    const [tb] = bodyOf(shapes, t) as Extract<ThumbShape, { k: "rect" }>[];
    expect(ab.sw! / tb.sw!).toBeCloseTo(ARCHI_STROKE_WIDTH / 1.5, 5);
  });

  it("the whole catalogue: the key alone gives the same colours as the real entry", () => {
    // The tile never fetches the 40 KB catalogue, so it works the category out
    // from the key. Every key must agree with the entry the canvas uses.
    expect(ENTRIES.length).toBeGreaterThan(60);
    for (const entry of ENTRIES) {
      const fromKey = archimateEntryFromKey(entry.key);
      expect(fromKey?.category, entry.key).toBe(entry.category);
      for (const special of ["location", "grouping", "junction-and", "junction-or", "actor"]) {
        expect(fromKey?.iconType === special, `${entry.key} ${special}`).toBe(entry.iconType === special);
      }
      const e = el("archimate-shape", 0, 0, 100, 50, { properties: { shapeKey: entry.key } });
      for (const depth of [0, 1, 2]) {
        const a = archimatePaint(e, undefined, depth);
        const b = archimatePaint(e, entry, depth);
        expect({ fill: a.fill, stroke: a.stroke, g: a.isGrouping, j: a.isJunction, l: a.isLocation }, entry.key)
          .toEqual({ fill: b.fill, stroke: b.stroke, g: b.isGrouping, j: b.isJunction, l: b.isLocation });
      }
    }
  });
});

describe("T4959 — every other diagram type matches its canvas colours", () => {
  it("system boundary / composite state / UML package: a solid header, a translucent body", () => {
    const sb = el("system-boundary", 0, 0, 400, 300);
    const cs = el("composite-state", 500, 0, 400, 300);
    const pk = el("uml-package", 1000, 0, 400, 300, { label: "Billing" });
    const shapes = buildDiagramThumbnail(data([sb, cs, pk]), undefined, 168, 96)!.shapes;
    for (const c of [sb, cs]) {
      const p = headedContainerPaint(c.type as "system-boundary" | "composite-state");
      const [body] = bodyOf(shapes, c) as Extract<ThumbShape, { k: "rect" }>[];
      expect(body.fill).toBe(p.body);
      expect(body.fillOpacity, "the old picture filled it solid").toBe(p.bodyOpacity);
      expect(shapes.some((s) => s.k === "path" && s.fill === p.header)).toBe(true);
    }
    const pkBody = shapes.find((s) => s.k === "rect" && s.x === pk.x && s.fillOpacity !== undefined) as Extract<ThumbShape, { k: "rect" }>;
    expect(pkBody.fill).toBe(nestedContainerFill(pk, undefined, 0));
    expect(pkBody.fillOpacity).toBe(0.35);
  });

  it("value chain: a themed chevron / process group keeps its theme colour", () => {
    const ch = el("chevron", 0, 0, 160, 60, { properties: { fillColor: "#1d4ed8" } });
    const pg = el("process-group", 0, 100, 400, 200, { properties: { fillColor: "#bfdbfe" } });
    const shapes = buildDiagramThumbnail(data([ch, pg]), undefined, 168, 96)!.shapes;
    expect(shapes.find((s) => s.k === "polygon")!.fill).toBe("#1d4ed8");
    expect(elementFill(ch, undefined)).toBe("#1d4ed8");
    const [pgBody] = bodyOf(shapes, pg) as Extract<ThumbShape, { k: "rect" }>[];
    expect(pgBody.fill).toBe("#bfdbfe");
  });

  it("EPC and flowchart honour a per-element fill, as the canvas does", () => {
    const ev = el("epc-event", 0, 0, 140, 60, { properties: { fill: "#ff00aa" } });
    const fn = el("epc-function", 200, 0, 140, 60);
    const shapes = buildDiagramThumbnail(data([ev, fn]), undefined, 168, 96)!.shapes;
    expect(shapes.find((s) => s.k === "polygon")!.fill).toBe("#ff00aa");
    expect(elementFill(ev, undefined)).toBe("#ff00aa");
    const [fnBody] = bodyOf(shapes, fn) as Extract<ThumbShape, { k: "rect" }>[];
    expect(fnBody.fill).toBe(DEFAULT_SYMBOL_COLORS["epc-function"]);
  });

  it("state machine: a history state is a white ring, not a dark block", () => {
    const hs = el("history-state", 0, 0, 30, 30);
    const shapes = buildDiagramThumbnail(data([hs]), undefined, 168, 96)!.shapes;
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ k: "circle", fill: "#ffffff", stroke: SHAPE_STROKE });
  });

  it("a review note is its pale note colour, not a solid block of the pink accent", () => {
    const rc = el("review-comment", 0, 0, 160, 80);
    const [note] = buildDiagramThumbnail(data([rc]), undefined, 168, 96)!.shapes;
    expect(note.k).toBe("path");
    expect((note as { fill: string }).fill).toBe("#fce7f3");
  });

  it("connectors take their canvas colour, and hidden leader segments are not drawn", () => {
    const a = el("task", 0, 0, 100, 60, { id: "a" });
    const msg = {
      id: "m", type: "messageBPMN", sourceId: "a", targetId: "a", sourceInvisibleLeader: true,
      waypoints: [{ x: 50, y: 30 }, { x: 50, y: 60 }, { x: 50, y: 200 }],
    } as unknown as Connector;
    const line = buildDiagramThumbnail(data([a], [msg]), undefined, 168, 96)!.shapes.find((s) => s.k === "polyline") as Extract<ThumbShape, { k: "polyline" }>;
    expect(line.stroke).toBe(connectorStroke("messageBPMN"));
    expect(line.stroke).toBe("#b0b7c3");
    expect(line.points, "the leader from the task centre is not part of the line").toBe("50,60 50,200");
    expect(line.dash, "a message flow is dashed, as on the canvas").toBe("10 5");
    expect(connectorDash(msg)).toBe("10 5");
    expect(connectorStroke("archi-serving")).toBe("#333333");
    expect(connectorDash({ type: "archi-access" })).toBe("2 3");
    expect(connectorDash({ type: "sequence" })).toBeUndefined();
  });

  it("uses the diagram's own colours over the project's, and black-and-white when hand-drawn — the editor's rule", () => {
    expect(effectiveSymbolColors({ task: "#111111" }, { task: "#222222" }, "normal").task).toBe("#222222");
    expect(effectiveSymbolColors({ task: "#111111" }, {}, "normal").task).toBe("#111111");
    expect(effectiveSymbolColors({ task: "#111111" }, { task: "#222222" }, "hand-drawn")).toBe(BW_SYMBOL_COLORS);
    expect(effectiveSymbolColors(null, [1, 2], undefined)).toEqual({});
  });
});

describe("T4960 — outlines stay visible at tile size", () => {
  it("a wide diagram's strokes are held at a third of their canvas width, not scaled to nothing", () => {
    const wide = [el("task", 0, 0, 100, 60), el("task", 3000, 1000, 100, 60)];
    const t = buildDiagramThumbnail(data(wide), undefined, 168, 96)!;
    const [, , vw, vh] = t.viewBox.split(" ").map(Number);
    const zoom = Math.min(168 / vw, 96 / vh);
    expect(zoom).toBeLessThan(THUMB_MIN_STROKE_ZOOM);
    const body = t.shapes[0] as Extract<ThumbShape, { k: "rect" }>;
    // On screen: 1.5 canvas px × one third = 0.5px.
    expect(body.sw! * zoom).toBeCloseTo(1.5 * THUMB_MIN_STROKE_ZOOM, 5);
  });

  it("a small diagram keeps its exact canvas stroke widths", () => {
    const t = buildDiagramThumbnail(data([el("task", 0, 0, 100, 60)]), undefined, 168, 96)!;
    expect((t.shapes[0] as Extract<ThumbShape, { k: "rect" }>).sw).toBe(1.5);
  });

  it("nothing to draw → null (the tile shows no picture)", () => {
    expect(buildDiagramThumbnail(null, undefined, 168, 96)).toBeNull();
    expect(buildDiagramThumbnail({ elements: [] }, undefined, 168, 96)).toBeNull();
    expect(buildDiagramThumbnail([], undefined, 168, 96)).toBeNull();
  });
});

describe("T4961 — one rule, one place: the canvas and the tile both call canvasPaint", () => {
  const symbol = read("app", "components", "canvas", "SymbolRenderer.tsx");
  const archi = read("app", "components", "canvas", "ArchimateShape.tsx");
  const conn = read("app", "components", "canvas", "ConnectorRenderer.tsx");
  const canvas = read("app", "components", "canvas", "Canvas.tsx");
  const client = read("app", "(dashboard)", "dashboard", "projects", "[id]", "ProjectDetailClient.tsx");
  const thumb = read("app", "lib", "diagram", "diagramThumbnail.ts");
  const editor = read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
  const fn = (src: string, name: string) => {
    const at = src.indexOf(`function ${name}(`);
    expect(at, name).toBeGreaterThan(-1);
    return src.slice(at, src.indexOf("\n}\n", at));
  };

  it("the canvas shapes paint with the shared rules", () => {
    expect(symbol).toContain('from "@/app/lib/diagram/canvasPaint"');
    expect(fn(symbol, "PoolShape")).toContain("poolPaint(colors)");
    expect(fn(symbol, "LaneShape")).toContain('lanePaint(laneDepth, isSublane ? "sublane" : "lane", colors)');
    expect(fn(symbol, "TaskShape")).toContain("elementFill({ ...el, type: \"task\" }, colors)");   // the fallback keeps the task colour (T4962)
    expect(fn(symbol, "BpmnTaskShape")).toContain("elementFill(el, colors)");
    expect(fn(symbol, "SystemBoundaryShape")).toContain('headedContainerPaint("system-boundary", colors)');
    expect(fn(symbol, "epcFill")).toContain("elementFill(el, colors)");
    expect(fn(symbol, "fcFill")).toContain("elementFill(el, colors)");
    // No shape resolves its own colour any more — no copy left to drift.
    expect(symbol).not.toMatch(/resolveColor\(/);
    expect(symbol).not.toMatch(/function lerpHex/);
    expect(archi).toContain("archimatePaint(el, entry, depth)");
    expect(archi).not.toMatch(/getThemeFor|theme\?\.fill/);
    expect(conn).toContain("connectorStroke(connector.type)");
    expect(conn).toContain("strokeDasharray={connectorDash(connector)}");
    expect(conn).toContain("visibleWaypointsOf(connector)");
    for (const f of ["sublaneIdsOf(", "laneDepths(", "archimateDescendantDepths(", "sameTypeAncestorDepths("]) {
      expect(canvas, f).toContain(f);
    }
    expect(editor).toContain("effectiveSymbolColors(projectColorConfig, diagramColorConfig, displayMode)");
  });

  it("the tile picture takes every colour from the same rules", () => {
    const tile = fn(client, "DiagramThumbnail");
    expect(tile).toContain("buildDiagramThumbnail(data, colorConfig, boxW, boxH)");
    expect(client).toContain("effectiveSymbolColors(colorConfig, diagram.colorConfig, diagram.displayMode)");
    expect(client).not.toMatch(/resolveColor|DEFAULT_SYMBOL_COLORS/);
    expect(thumb).toContain('from "./canvasPaint"');
    expect(thumb).toContain('from "./nestingDepth"');
    expect(thumb).not.toMatch(/resolveColor|getThemeFor|DEFAULT_SYMBOL_COLORS/);
    // Its only literal colours are plain white and black.
    const hexes = new Set(thumb.match(/#[0-9a-fA-F]{6}\b/g) ?? []);
    expect([...hexes].sort()).toEqual(["#000000", "#ffffff"]);
  });

  it("the tile draws on white at full strength (no 90% wash over the type tint)", () => {
    const card = client.slice(client.indexOf("function DiagramCard("));
    const box = card.slice(card.lastIndexOf("<div", card.indexOf("<DiagramThumbnail")), card.indexOf("<DiagramThumbnail"));
    expect(box).toContain("bg-white");
    expect(box).not.toContain("opacity-90");
    expect(card).toContain("const thumbBox = large ? { w: 168, h: 96 } : { w: 56, h: 32 };");
  });

  it("the Project screen loads each diagram's own colours and display mode", () => {
    for (const f of [["app", "(dashboard)", "dashboard", "projects", "[id]", "page.tsx"], ["app", "api", "projects", "[id]", "route.ts"]]) {
      expect(read(...f), f.join("/")).toMatch(/data: true, colorConfig: true, displayMode: true/);
    }
  });
});

describe("T4962 — what the independent review of the extraction found (2026-09-27)", () => {
  it("the canvas's fallback shape still paints the TASK colour for a type with no shape of its own", () => {
    // SymbolShape draws any unmatched type (e.g. a stamped "sublane") with TaskShape,
    // which was hard-wired to the task colour; the shared rule would have used the
    // element's own type colour. TaskShape asks for the task colour explicitly.
    const renderer = fs.readFileSync(path.join("app", "components", "canvas", "SymbolRenderer.tsx"), "utf8");
    const task = renderer.slice(renderer.indexOf("function TaskShape("), renderer.indexOf("function TaskShape(") + 700);
    expect(task).toContain('fill={elementFill({ ...el, type: "task" }, colors)}');
    const sub = { id: "s", type: "sublane", properties: {} } as unknown as DiagramElement;
    expect(elementFill({ ...sub, type: "task" }, undefined)).toBe(DEFAULT_SYMBOL_COLORS.task);
  });

  it("a typeless element never throws — the mobile viewer and the partner PDF render through the same rule", () => {
    const typeless = { id: "x", x: 0, y: 0, width: 100, height: 60, properties: {} } as unknown as DiagramElement;
    expect(elementFill(typeless, undefined)).toBe(DEFAULT_SYMBOL_COLORS.task);
    const data = { elements: [typeless], connectors: [] } as never;
    expect(() => renderTemplateThumbnailSvg(data, { trueColors: true, fullLabels: true })).not.toThrow();
  });
});
