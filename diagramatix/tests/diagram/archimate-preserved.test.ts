/**
 * ArchiMate image reproduction — VISUAL CONTAINMENT (nesting).
 *
 * When the AI reproduces an ArchiMate image it emits per-shape `bounds`
 * (fractions of the image) + `parent` for every shape drawn INSIDE another.
 * `layoutArchimatePreserved` (via layoutGenericDiagram) must honour that geometry:
 * nest children via parentId, size containers to enclose their children, drop the
 * composition lines that the nesting now expresses, and keep every other relation.
 *
 * Fixture mirrors `test/Basic - 1 Organization Viewpoint Example.jpg`:
 *   ArchiSurance (a1) ⊃ Front Office (a2) ⊃ Customer/Intermediary Relations (a3/a4)
 *                     ⊃ Back Office  (a5) ⊃ Home&Away/Car/Legal Aid (a6/a7/a8)
 *                     ⊃ Finance/Product Development/HRM/Document Processing SSC (a9..a12)
 * plus one aggregation (a9 ⇢ a11) to prove aggregation stays a drawn line.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { archiNodeDepth, archiNodeFrontRect } from "@/app/lib/diagram/nodeGeometry";

type El = { id: string; type: string; label: string; parent?: string; bounds: { x: number; y: number; w: number; h: number } };

const els: El[] = [
  { id: "a1", type: "business-actor", label: "ArchiSurance", bounds: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 } },
  { id: "a2", type: "business-actor", label: "Front Office", parent: "a1", bounds: { x: 0.06, y: 0.10, w: 0.88, h: 0.22 } },
  { id: "a3", type: "business-actor", label: "Customer Relations", parent: "a2", bounds: { x: 0.10, y: 0.16, w: 0.35, h: 0.10 } },
  { id: "a4", type: "business-actor", label: "Intermediary Relations", parent: "a2", bounds: { x: 0.55, y: 0.16, w: 0.35, h: 0.10 } },
  { id: "a5", type: "business-actor", label: "Back Office", parent: "a1", bounds: { x: 0.06, y: 0.36, w: 0.88, h: 0.20 } },
  { id: "a6", type: "business-actor", label: "Home & Away", parent: "a5", bounds: { x: 0.10, y: 0.42, w: 0.22, h: 0.10 } },
  { id: "a7", type: "business-actor", label: "Car", parent: "a5", bounds: { x: 0.40, y: 0.42, w: 0.20, h: 0.10 } },
  { id: "a8", type: "business-actor", label: "Legal Aid", parent: "a5", bounds: { x: 0.68, y: 0.42, w: 0.24, h: 0.10 } },
  { id: "a9", type: "business-actor", label: "Finance", parent: "a1", bounds: { x: 0.06, y: 0.60, w: 0.26, h: 0.10 } },
  { id: "a10", type: "business-actor", label: "Product Development", parent: "a1", bounds: { x: 0.37, y: 0.60, w: 0.26, h: 0.10 } },
  { id: "a11", type: "business-actor", label: "HRM", parent: "a1", bounds: { x: 0.68, y: 0.60, w: 0.26, h: 0.10 } },
  { id: "a12", type: "business-actor", label: "Document Processing SSC", parent: "a1", bounds: { x: 0.06, y: 0.74, w: 0.88, h: 0.10 } },
];
const comps = [
  ["a1", "a2"], ["a1", "a5"], ["a1", "a9"], ["a1", "a10"], ["a1", "a11"], ["a1", "a12"],
  ["a2", "a3"], ["a2", "a4"], ["a5", "a6"], ["a5", "a7"], ["a5", "a8"],
];
const conns = [
  ...comps.map(([s, t]) => ({ sourceId: s, targetId: t, type: "composition" })),
  { sourceId: "a9", targetId: "a11", type: "aggregation" },
];

const build = () => layoutGenericDiagram({ elements: els, connections: conns } as never, "archimate", { imageAspect: { w: 1000, h: 1000 } });
const at = (d: ReturnType<typeof build>, id: string) => d.elements.find((e) => e.id === id)!;
const encloses = (p: { x: number; y: number; width: number; height: number }, c: { x: number; y: number; width: number; height: number }) =>
  c.x >= p.x - 1 && c.y >= p.y - 1 && c.x + c.width <= p.x + p.width + 1 && c.y + c.height <= p.y + p.height + 1;

describe("ArchiMate preserved (image nesting)", () => {
  it("T1068 — bounds are honoured (top-left origin, rows in drawn order)", () => {
    const d = build();
    const a1 = at(d, "a1");
    expect(a1.x).toBeGreaterThanOrEqual(40);
    expect(a1.x).toBeLessThanOrEqual(130);
    // Front Office row above Back Office above the Finance row above Doc Processing.
    expect(at(d, "a2").y).toBeLessThan(at(d, "a5").y);
    expect(at(d, "a5").y).toBeLessThan(at(d, "a9").y);
    expect(at(d, "a9").y).toBeLessThan(at(d, "a12").y);
  });

  it("T1069 — 3-level parentId chain is set from `parent`", () => {
    const d = build();
    expect(at(d, "a3").parentId).toBe("a2");
    expect(at(d, "a2").parentId).toBe("a1");
    expect(at(d, "a1").parentId).toBeUndefined();
    expect(at(d, "a6").parentId).toBe("a5");
    expect(at(d, "a5").parentId).toBe("a1");
  });

  it("T1070 — containers enclose their children and are flagged as containers", () => {
    const d = build();
    for (const [p, c] of comps) expect(encloses(at(d, p), at(d, c)), `${p} must enclose ${c}`).toBe(true);
    expect(at(d, "a1").properties.archimateIsContainer).toBe(true);
    expect(at(d, "a2").properties.archimateIsContainer).toBe(true);
    expect(at(d, "a5").properties.archimateIsContainer).toBe(true);
    // A leaf is not a container.
    expect(at(d, "a3").properties.archimateIsContainer).toBeUndefined();
  });

  it("T1071 — every nested composition line is dropped", () => {
    const d = build();
    expect(d.connectors.some((c) => c.type === "archi-composition")).toBe(false);
  });

  it("T1072 — aggregation is kept as a drawn line", () => {
    const d = build();
    expect(d.connectors.some((c) => c.type === "archi-aggregation")).toBe(true);
  });

  it("T1073 — parents render before their children (array order)", () => {
    const d = build();
    const idx = (id: string) => d.elements.findIndex((e) => e.id === id);
    for (const [p, c] of comps) expect(idx(p), `${p} before ${c}`).toBeLessThan(idx(c));
  });

  it("T1080 — long names widen to stay 2 lines (height standard) and siblings don't overlap", () => {
    const els2 = [
      { id: "n1", type: "business-actor", label: "Finance", bounds: { x: 0.05, y: 0.4, w: 0.16, h: 0.08 } },
      { id: "n2", type: "business-actor", label: "Customer Relationship Management", bounds: { x: 0.28, y: 0.4, w: 0.16, h: 0.08 } },
      { id: "n3", type: "business-actor", label: "Document Management and Archival Subsystem", bounds: { x: 0.51, y: 0.4, w: 0.16, h: 0.08 } },
    ];
    const d = layoutGenericDiagram({ elements: els2, connections: [] } as never, "archimate", { imageAspect: { w: 1000, h: 600 } });
    const g = (id: string) => d.elements.find((e) => e.id === id)!;
    // ≤2 lines → height stays standard; long names WIDEN instead of growing tall/crammed.
    for (const id of ["n1", "n2", "n3"]) expect(g(id).height, `${id} height standard`).toBe(76);
    expect(g("n2").width, "long name widened").toBeGreaterThan(128);
    expect(g("n3").width, "very long name widened").toBeGreaterThan(g("n2").width - 1);
    expect(g("n3").width, "width capped ~3×").toBeLessThanOrEqual(128 * 3);
    // No two elements overlap after expansion (gaps preserved by the separation pass).
    const ids = ["n1", "n2", "n3"];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = g(ids[i]), b = g(ids[j]);
      const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(ox <= 0 || oy <= 0, `${ids[i]} and ${ids[j]} must not overlap`).toBe(true);
    }
  });

  it("T1078 — elements render at STANDARD size (not scaled to image px), containers hug them", () => {
    const d = build();
    // Leaves are ~standard generated size (128×76, text-expanded) — NOT ~4× (which
    // the old bounds×1400 sizing produced, ~450px for a 0.35-wide leaf).
    for (const id of ["a3", "a4", "a6", "a7", "a8", "a9", "a10", "a11"]) {
      const el = at(d, id);
      expect(el.height, `${id} height standard`).toBeLessThanOrEqual(120);
      expect(el.width, `${id} width standard`).toBeLessThanOrEqual(240);
      expect(el.height, `${id} height ≥ default`).toBeGreaterThanOrEqual(76);
    }
    // A leaf that sits directly in ArchiSurance (Finance) is a single default box.
    expect(at(d, "a9").width).toBeLessThanOrEqual(180);
    // Because the leaves are small, their containers hug small too — the outer
    // container is far below the old image-scaled width (~0.96×1400 ≈ 1344).
    expect(at(d, "a1").width).toBeLessThan(900);
    expect(at(d, "a2").width).toBeLessThan(700);
  });
});

describe("ArchiMate notation form (icon vs box)", () => {
  it("T1076 — `notation` picks the icon (expressed) or box catalogue form", () => {
    const formEls = [
      { id: "s1", type: "business-service", label: "Icon Service", notation: "icon", bounds: { x: 0.05, y: 0.05, w: 0.24, h: 0.10 } },
      { id: "s2", type: "business-service", label: "Box Service", notation: "box", bounds: { x: 0.05, y: 0.30, w: 0.24, h: 0.10 } },
      { id: "e1", type: "business-event", label: "Icon Event", notation: "icon", bounds: { x: 0.05, y: 0.55, w: 0.24, h: 0.10 } },
      { id: "p1", type: "business-process", label: "Plain Process", bounds: { x: 0.05, y: 0.80, w: 0.24, h: 0.10 } },
    ];
    const d = layoutGenericDiagram({ elements: formEls, connections: [] } as never, "archimate", { imageAspect: { w: 1000, h: 1000 } });
    const at2 = (id: string) => d.elements.find((e) => e.id === id)!;
    // Service drawn as the expressed stadium → the -icon master + iconOnly flag.
    expect(at2("s1").properties.shapeKey).toBe("business-business-service-icon");
    expect(at2("s1").properties.archimateIconOnly).toBe(true);
    // Service drawn as a box → the -box master, no icon flag.
    expect(at2("s2").properties.shapeKey).toBe("business-business-service-box");
    expect(at2("s2").properties.archimateIconOnly).toBeUndefined();
    // Event expressed form → its -icon master.
    expect(at2("e1").properties.shapeKey).toBe("business-business-event-icon");
    expect(at2("e1").properties.archimateIconOnly).toBe(true);
    // No notation → default box form.
    expect(at2("p1").properties.shapeKey).toBe("business-business-process-box");
    expect(at2("p1").properties.archimateIconOnly).toBeUndefined();
  });

  it("T1081 — Location type + Node/System Software icon forms are ingested", () => {
    const els2 = [
      { id: "loc", type: "location", label: "Sydney HQ", bounds: { x: 0.02, y: 0.02, w: 0.9, h: 0.9 } },
      { id: "n1", type: "technology-node", label: "App Server", notation: "icon", parent: "loc", bounds: { x: 0.08, y: 0.15, w: 0.3, h: 0.2 } },
      { id: "ss1", type: "technology-system-software", label: "Linux", notation: "icon", parent: "loc", bounds: { x: 0.55, y: 0.15, w: 0.3, h: 0.2 } },
    ];
    const d = layoutGenericDiagram({ elements: els2, connections: [{ sourceId: "loc", targetId: "n1", type: "composition" }, { sourceId: "loc", targetId: "ss1", type: "composition" }] } as never, "archimate", { imageAspect: { w: 1000, h: 1000 } });
    const g = (id: string) => d.elements.find((e) => e.id === id)!;
    // Location renders as the composite-location master (place/site container).
    expect(g("loc").properties.shapeKey).toBe("composite-location");
    expect(g("loc").properties.archimateIsContainer).toBe(true);
    // Node drawn in the image's expressed form → its -icon master.
    expect(g("n1").properties.shapeKey).toBe("technology-node-icon");
    expect(g("n1").properties.archimateIconOnly).toBe(true);
    // System Software is box-only (bespoke icon via the Icon Library) — stays a box
    // even when notation:"icon" is reported.
    expect(g("ss1").properties.shapeKey).toBe("technology-system-software-box");
    expect(g("ss1").properties.archimateIconOnly).toBeUndefined();
    // Nested inside the location.
    expect(g("n1").parentId).toBe("loc");
  });

  it("T1086 — an opposing-parallel connector is straightened (its two ends share an absolute coordinate)", () => {
    const els2 = [
      { id: "p1", type: "business-process", label: "P1", bounds: { x: 0.4, y: 0.1, w: 0.12, h: 0.1 } },
      { id: "s1", type: "business-service", label: "S1", bounds: { x: 0.4, y: 0.5, w: 0.12, h: 0.1 } },
    ];
    const d = layoutGenericDiagram({ elements: els2, connections: [{ sourceId: "s1", targetId: "p1", type: "serving" }] } as never, "archimate", { imageAspect: { w: 1000, h: 1000 } });
    const g = (id: string) => d.elements.find((e) => e.id === id)!;
    const c = d.connectors.find((x) => x.sourceId === "s1" && x.targetId === "p1")!;
    const s = g("s1"), p = g("p1");
    const srcX = s.x + (c.sourceOffsetAlong ?? 0.5) * s.width;
    const tgtX = p.x + (c.targetOffsetAlong ?? 0.5) * p.width;
    // Vertically-aligned pair → the serving connector attaches at the same x on both
    // ends (a straight line), no sideways kink.
    expect(Math.abs(srcX - tgtX)).toBeLessThan(2);
  });

  it("T1085 — a Node container wraps its children in the FRONT rectangle (trapeziums external, capped)", () => {
    const els2 = [
      { id: "n1", type: "technology-node", label: "Mainframe", notation: "icon", bounds: { x: 0.1, y: 0.2, w: 0.7, h: 0.5 } },
      { id: "ss1", type: "technology-system-software", label: "Message Queuing", parent: "n1", bounds: { x: 0.15, y: 0.32, w: 0.25, h: 0.16 } },
      { id: "ss2", type: "technology-system-software", label: "DBMS", parent: "n1", bounds: { x: 0.5, y: 0.32, w: 0.22, h: 0.16 } },
    ];
    const d = layoutGenericDiagram({ elements: els2, connections: [{ sourceId: "ss1", targetId: "n1", type: "composition" }, { sourceId: "ss2", targetId: "n1", type: "composition" }] } as never, "archimate", { imageAspect: { w: 1000, h: 800 } });
    const g = (id: string) => d.elements.find((e) => e.id === id)!;
    const n = g("n1");
    // It IS the Node icon container.
    expect(n.properties.shapeKey).toBe("technology-node-icon");
    expect(n.properties.archimateIsContainer).toBe(true);
    // Trapezium depth grows but is capped at 80.
    const depth = archiNodeDepth(n.width, n.height);
    expect(depth).toBeLessThanOrEqual(80);
    // Children sit inside the FRONT rectangle (below the top trapezium, left of the right one).
    const fr = archiNodeFrontRect(n.x, n.y, n.width, n.height);
    for (const id of ["ss1", "ss2"]) {
      const c = g(id);
      expect(c.y, `${id} below top trapezium`).toBeGreaterThanOrEqual(fr.y - 1);
      expect(c.x + c.width, `${id} left of right trapezium`).toBeLessThanOrEqual(fr.x + fr.width + 1);
      expect(c.x, `${id} within front left`).toBeGreaterThanOrEqual(fr.x - 1);
      expect(c.y + c.height, `${id} within front bottom`).toBeLessThanOrEqual(fr.y + fr.height + 1);
    }
  });

  it("T1084 — a Location may only be contained by a Location or a Grouping", () => {
    const els2 = [
      { id: "a1", type: "business-actor", label: "ArchiSurance", bounds: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 } },
      { id: "grp", type: "grouping", label: "Cluster", bounds: { x: 0.05, y: 0.1, w: 0.5, h: 0.7 } },
      { id: "loc1", type: "location", label: "Front Office", parent: "a1", bounds: { x: 0.6, y: 0.1, w: 0.3, h: 0.3 } },
      { id: "loc2", type: "location", label: "Back Office", parent: "grp", bounds: { x: 0.08, y: 0.2, w: 0.4, h: 0.4 } },
    ];
    const d = layoutGenericDiagram({ elements: els2, connections: [] } as never, "archimate", { imageAspect: { w: 1000, h: 1000 } });
    const g = (id: string) => d.elements.find((e) => e.id === id)!;
    // Location under an Actor → the illegal nesting is dropped (loc1 becomes a root).
    expect(g("loc1").parentId).toBeUndefined();
    // Location under a Grouping → kept.
    expect(g("loc2").parentId).toBe("grp");
  });

  it("T1082 — minimum inter-element gaps: 20% general, 35% along a connector", () => {
    // Three services in a nearly-touching row (like the Application Usage Viewpoint)
    // plus two directly-connected (triggering) processes drawn close together.
    const els2 = [
      { id: "p1", type: "business-process", label: "P1", bounds: { x: 0.15, y: 0.10, w: 0.10, h: 0.08 } },
      { id: "p2", type: "business-process", label: "P2", bounds: { x: 0.28, y: 0.10, w: 0.10, h: 0.08 } },
      { id: "s1", type: "business-service", label: "S1", bounds: { x: 0.15, y: 0.45, w: 0.10, h: 0.08 } },
      { id: "s2", type: "business-service", label: "S2", bounds: { x: 0.265, y: 0.45, w: 0.10, h: 0.08 } },
      { id: "s3", type: "business-service", label: "S3", bounds: { x: 0.38, y: 0.45, w: 0.10, h: 0.08 } },
    ];
    const conns = [
      { sourceId: "p1", targetId: "p2", type: "triggering", sourceSide: "right", targetSide: "left" },
      { sourceId: "s1", targetId: "p1", type: "serving" },
      { sourceId: "s2", targetId: "p1", type: "serving" },
    ];
    const d = layoutGenericDiagram({ elements: els2, connections: conns } as never, "archimate", { imageAspect: { w: 1000, h: 1000 } });
    const g = (id: string) => d.elements.find((e) => e.id === id)!;
    const hgap = (a: string, b: string) => g(b).x - (g(a).x + g(a).width); // b to the right of a
    // Unconnected services keep ≥ 20% of BP width (~23px, allow rounding).
    expect(hgap("s1", "s2"), "s1→s2 general gap").toBeGreaterThanOrEqual(22);
    expect(hgap("s2", "s3"), "s2→s3 general gap").toBeGreaterThanOrEqual(22);
    // Directly-connected processes keep ≥ 35% of BP width (~40px) along the connector.
    expect(hgap("p1", "p2"), "p1→p2 connected gap").toBeGreaterThanOrEqual(38);
  });

  it("T1083 — connectors don't share a connection point + honour the AI-reported side", () => {
    const els2 = [
      { id: "p1", type: "business-process", label: "P1", bounds: { x: 0.15, y: 0.10, w: 0.10, h: 0.08 } },
      { id: "p2", type: "business-process", label: "P2", bounds: { x: 0.28, y: 0.10, w: 0.10, h: 0.08 } },
      { id: "s1", type: "business-service", label: "S1", bounds: { x: 0.15, y: 0.45, w: 0.10, h: 0.08 } },
      { id: "s2", type: "business-service", label: "S2", bounds: { x: 0.28, y: 0.45, w: 0.10, h: 0.08 } },
    ];
    const conns = [
      { sourceId: "p1", targetId: "p2", type: "triggering", sourceSide: "right", targetSide: "left" },
      { sourceId: "s1", targetId: "p1", type: "serving" },
      { sourceId: "s2", targetId: "p1", type: "serving" },
    ];
    const d = layoutGenericDiagram({ elements: els2, connections: conns } as never, "archimate", { imageAspect: { w: 1000, h: 1000 } });
    // Two serving connectors both reach p1 — their attachment points must differ.
    const toP1 = d.connectors.filter((c) => c.targetId === "p1");
    expect(toP1.length).toBe(2);
    const [a, b] = toP1;
    expect(a.targetSide === b.targetSide && a.targetOffsetAlong === b.targetOffsetAlong, "distinct attachment points").toBe(false);
    // The AI-reported side on p1→p2 is honoured.
    const t = d.connectors.find((c) => c.sourceId === "p1" && c.targetId === "p2")!;
    expect(t.sourceSide).toBe("right");
    expect(t.targetSide).toBe("left");
  });
});
