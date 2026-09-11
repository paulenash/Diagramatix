/**
 * The navigation-tree feature badges — AI / SI / MN / AP / RC.
 *
 * The thing worth guarding is not that a badge appears. It is that a badge
 * agrees with the feature it reports on: an "SI" against a diagram whose
 * Simulation Data panel shows nothing, or no "SI" against one that Clear-all
 * would empty, is worse than no badge at all, because a badge is read as fact
 * and nobody re-checks it.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { diagramFeatureBadges } from "@/app/lib/diagram/diagramFeatureBadges";
import { clearSimData, hasSimData } from "@/app/lib/simulation/clearSimData";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { FEATURE_KEYS, DEFAULT_FEATURE_COLORS } from "@/app/lib/theme/featureColors";

const el = (id: string, extra: Partial<DiagramElement> = {}): DiagramElement => ({
  id, type: "task", x: 0, y: 0, width: 100, height: 60, label: id, ...extra,
} as DiagramElement);

const base = (over: Partial<DiagramData> = {}): DiagramData => ({
  elements: [el("a")], connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, ...over,
} as DiagramData);

const codes = (d: unknown, ctx = {}) => diagramFeatureBadges(d, ctx).map((b) => b.code);

describe("diagram feature badges", () => {
  it("T4223 — a plain diagram carries no badges at all", () => {
    // Absence must be absence. A row of grey placeholders would make the
    // badges noise, and the whole point is that a badged row stands out.
    expect(codes(base())).toEqual([]);
  });

  it("T4224 — each badge appears only on its own evidence", () => {
    expect(codes(base({ aiGeneration: { promptId: "p1", promptName: "Order to Cash", promptText: "…", model: "claude-opus-5", generatedAt: "2026-09-11T00:00:00Z" } } as Partial<DiagramData>))).toEqual(["AI"]);

    expect(codes(base({ elements: [el("a", { properties: { sim: { cycleTime: { kind: "fixed", value: 5 } } } })] }))).toEqual(["SI"]);

    expect(codes(base({ pcf: { nodeId: "n", pcfId: 10023, hierarchyId: "4.2.1", name: "Process orders", frameworkId: "f", variant: "cross" } } as Partial<DiagramData>))).toEqual(["AP"]);

    expect(codes(base({ elements: [el("a", { properties: { risk: { riskRefs: [{ itemId: "r1", code: "R-01", label: "Fraud" }] } } })] }))).toEqual(["RC"]);

    // Mining is the one fact the diagram cannot know about itself.
    expect(codes(base(), { mined: true })).toEqual(["MN"]);
    expect(codes(base(), { mined: false })).toEqual([]);
  });

  it("T4225 — SI agrees with the panel that owns the data, in BOTH directions", () => {
    // THE guard. If these two ever disagree, a badge is lying about a feature.
    const withBranch = base({
      elements: [el("g", { type: "gateway" })],
      connectors: [{ id: "c1", sourceId: "g", targetId: "a", type: "sequence-flow", branchProbability: 60 }],
    } as Partial<DiagramData>);

    // A branch percentage alone is simulation data — Clear-all removes it — so
    // the badge must show, even though no element has a `sim` property.
    expect(hasSimData(withBranch)).toBe(true);
    expect(codes(withBranch)).toContain("SI");

    // ...and once cleared, both agree it is gone.
    const cleared = clearSimData(withBranch).data;
    expect(hasSimData(cleared)).toBe(false);
    expect(codes(cleared)).not.toContain("SI");
  });

  it("T4226 — malformed or absent data yields no badges rather than throwing", () => {
    // One bad row must not blank the whole tree.
    for (const bad of [undefined, null, {}, "nonsense", 42, { elements: "no" }, { elements: [], connectors: null }]) {
      expect(() => diagramFeatureBadges(bad)).not.toThrow();
      expect(codes(bad)).toEqual([]);
    }
  });

  it("T4227 — every badge names a real Feature Colour and a distinct code", () => {
    const all = diagramFeatureBadges(
      base({
        aiGeneration: { promptId: "p", promptName: "n", promptText: "t", model: "m", generatedAt: "2026-09-11T00:00:00Z" },
        pcf: { nodeId: "n", pcfId: 1, hierarchyId: "1.1", name: "x", frameworkId: "f", variant: "v" },
        elements: [el("a", {
          properties: {
            sim: { cycleTime: { kind: "fixed", value: 1 } },
            risk: { controlRefs: [{ itemId: "c", code: "C-1", label: "Approval" }] },
          },
        })],
      } as Partial<DiagramData>),
      { mined: true },
    );
    expect(all.map((b) => b.code)).toEqual(["AI", "SI", "MN", "AP", "RC"]);
    // Two letters each, all different — the circle has room for exactly two.
    expect(new Set(all.map((b) => b.code)).size).toBe(all.length);
    for (const b of all) {
      expect(b.code).toMatch(/^[A-Z]{2}$/);
      // A key the palette does not define would fall back to another feature's
      // colour, so the badge would read as the wrong feature entirely.
      expect(FEATURE_KEYS, b.code).toContain(b.color);
      expect(DEFAULT_FEATURE_COLORS[b.color]).toBeDefined();
      expect(b.title.length).toBeGreaterThan(10); // says what is there, not just that something is
    }
  });
});

describe("the badges are actually wired into the tree", () => {
  // A pure helper nothing renders is a helper with a green test and no effect.
  const ROOT = path.resolve(__dirname, "..", "..");
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

  it("T4231 — the project tree renders a badge row against each diagram name", () => {
    const tree = read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx");
    expect(tree).toContain("diagramFeatureBadges(d.data");
    expect(tree).toContain("<DiagramFeatureBadges badges={badgesByDiagram.get(d.id)");
    // On the NAME line, not a separate row: the badge span follows the
    // truncating name span inside the same flex container.
    const nameLine = tree.indexOf('<span className="truncate flex-1" title={d.name}>');
    const badgeLine = tree.indexOf("<DiagramFeatureBadges");
    expect(nameLine).toBeGreaterThan(-1);
    expect(badgeLine).toBeGreaterThan(nameLine);
  });

  it("T4232 — the mining link is resolved on the server and passed down", () => {
    // The one badge that cannot be derived from the diagram. If the page stops
    // sending it, MN silently never appears again — no error, just an absence,
    // which is indistinguishable from "this project has no mining".
    const page = read("app/(dashboard)/dashboard/projects/[id]/page.tsx");
    expect(page).toContain("processMiningRun.findMany");
    expect(page).toContain("minedDiagramIds={minedDiagramIds}");
    // All four diagram-bearing columns count, not just the discovered BPMN.
    for (const col of ["discoveredBpmnId", "discoveredSmId", "referenceSmId", "domainDiagramId"]) {
      expect(page, col).toContain(col);
    }
  });
});
