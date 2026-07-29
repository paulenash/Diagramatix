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
});
