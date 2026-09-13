/**
 * An Expanded Subprocess must be a box around its own contents.
 *
 * Paul, 2026-09-13: "EPs seem to be generating way too large in vertical
 * height." On his diagram the EP "Do Until Application Complete" came out
 * 653.5px tall for content needing 434 — and, worse, did not contain that
 * content: 335px of empty space above it and children hanging 67px out of the
 * bottom.
 *
 * ROOT CAUSE — R55.2 (`bpmnLayout.ts`). It allocates path rows by calling
 * `analysePaths` over the WHOLE diagram's elements and edges, then applies the
 * result per container. An EP's internal flow is therefore given rows as though
 * it were a sibling path of the outer process rather than content nested inside
 * a box that already has a row of its own. The engine's own row debug
 * (DGX_PATHROW_DEBUG=1) says it in two lines:
 *
 *     [rows] Do Until Application Complete   h=123 -> row 1036   <- the BOX
 *     [rows] Check Application Completeness  h= 65 -> row 1556   <- its CHILD
 *
 * 520px apart. The EP was a snug 123px at that moment and had to stretch across
 * the gap. Scoping the MOVE per-container does not help when the ROWS were
 * computed globally.
 *
 * A second, independent defect compounds it: the last `wrapEpsToChildren()` runs
 * long before the final vertical passes (`fitLanesToChildren(true)` and several
 * `shiftSubtree` calls), so the box is never re-fitted after its children last
 * moved. That is what leaves it misplaced as well as oversized.
 *
 * These tests are written BEFORE the fix and fail on today's engine, so the fix
 * is judged by a bar that predates it. They assert the PROPERTY — a box fits its
 * contents — not a pixel count, so they keep meaning after the next layout
 * change.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/** Artefacts float; they are excluded from the box fit, as the engine excludes them. */
const ARTIFACT = new Set(["data-object", "data-store", "text-annotation", "group"]);

interface Fit {
  id: string;
  label: string;
  height: number;
  /** Children's vertical extent. */
  contentTop: number;
  contentBottom: number;
  /** Empty band between the box's top edge and its topmost child. */
  slackTop: number;
  /** Empty band below the lowest child. */
  slackBottom: number;
  /** How much taller the box is than its content needs. */
  excess: number;
  kids: number;
}

/** Measure every EP in a laid-out diagram against the children it must enclose. */
function epFits(data: DiagramData): Fit[] {
  const out: Fit[] = [];
  for (const ep of data.elements.filter((e) => e.type === "subprocess-expanded")) {
    const kids = data.elements.filter((e: DiagramElement) =>
      e.parentId === ep.id && !e.boundaryHostId && !ARTIFACT.has(e.type));
    if (!kids.length) continue;
    const contentTop = Math.min(...kids.map((k) => k.y));
    const contentBottom = Math.max(...kids.map((k) => k.y + k.height));
    out.push({
      id: ep.id,
      label: (ep.label ?? "").replace(/\s+/g, " "),
      height: ep.height,
      contentTop, contentBottom,
      slackTop: contentTop - ep.y,
      slackBottom: (ep.y + ep.height) - contentBottom,
      excess: ep.height - (contentBottom - contentTop),
      kids: kids.length,
    });
  }
  return out;
}

const layout = (elements: AiElement[], connections: AiConnection[]) =>
  layoutBpmnDiagram(elements, connections) as DiagramData;

/**
 * The bar. A label needs room above the content and a shape needs a little
 * below, so an EP is legitimately taller than its children — but by a header
 * and a pad, not by hundreds of pixels. 120px is generous against a ~48px
 * header+pad and still an order of magnitude under the 268px defect.
 */
const MAX_EXCESS = 120;
/** Nothing may fall outside the box at all. A child outside its own container
 *  is a containment fault, not a tightness one. */
const report = (f: Fit) =>
  `EP "${f.label}" h=${f.height} over ${f.kids} children spanning ${f.contentTop}→${f.contentBottom}`
  + ` (slack top ${f.slackTop.toFixed(1)}, bottom ${f.slackBottom.toFixed(1)}, excess ${f.excess.toFixed(1)})`;

describe("an Expanded Subprocess encloses its own children", () => {
  it("T4333 — Paul's real generated plan: the EP contains its content", () => {
    // The corpus fixture is his diagram's own plan. Replaying it reproduces his
    // diagram exactly — 0 geometry differences across 45 elements — so this is
    // the defect itself, not a model of it.
    const file = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "EP01.plan.json");
    const plan = JSON.parse(fs.readFileSync(file, "utf8")).diagrams[0].data.aiGeneration.plan;
    const fits = epFits(layout(plan.elements, plan.connections));
    expect(fits.length, "the fixture must still contain an EP with children").toBeGreaterThan(0);
    for (const f of fits) {
      expect(f.slackTop, `child above the box — ${report(f)}`).toBeGreaterThanOrEqual(-0.5);
      expect(f.slackBottom, `child below the box — ${report(f)}`).toBeGreaterThanOrEqual(-0.5);
    }
  });

  it("T4334 — Paul's real generated plan: the EP is not grossly oversized", () => {
    const file = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "EP01.plan.json");
    const plan = JSON.parse(fs.readFileSync(file, "utf8")).diagrams[0].data.aiGeneration.plan;
    for (const f of epFits(layout(plan.elements, plan.connections))) {
      expect(f.excess, `${report(f)} — an EP is a header and a pad taller than its content, not 200px+`)
        .toBeLessThanOrEqual(MAX_EXCESS);
    }
  });

  /** A minimal EP holding a decision — the shape R55.2 acts on. */
  const decisionInsideEp = (): { elements: AiElement[]; connections: AiConnection[] } => ({
    elements: [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "l", type: "lane", label: "Team", pool: "p" },
      { id: "s", type: "start-event", label: "In", pool: "p", lane: "l" },
      { id: "ep", type: "subprocess-expanded", label: "Do Until Done", pool: "p", lane: "l" },
      { id: "is", type: "start-event", label: "", parentSubprocess: "ep" },
      { id: "t1", type: "task", label: "Check it", parentSubprocess: "ep" },
      { id: "gw", type: "gateway", label: "Good?", parentSubprocess: "ep" },
      { id: "t2", type: "task", label: "Fix it", parentSubprocess: "ep" },
      { id: "gm", type: "gateway", label: "Merge", parentSubprocess: "ep" },
      { id: "ie", type: "end-event", label: "", parentSubprocess: "ep" },
      { id: "e", type: "end-event", label: "Out", pool: "p", lane: "l" },
    ] as AiElement[],
    connections: [
      { sourceId: "s", targetId: "ep", type: "sequence" },
      { sourceId: "ep", targetId: "e", type: "sequence" },
      { sourceId: "is", targetId: "t1", type: "sequence" },
      { sourceId: "t1", targetId: "gw", type: "sequence" },
      { sourceId: "gw", targetId: "t2", type: "sequence", label: "No" },
      { sourceId: "t2", targetId: "gm", type: "sequence" },
      { sourceId: "gw", targetId: "gm", type: "sequence", label: "Yes" },
      { sourceId: "gm", targetId: "ie", type: "sequence" },
    ] as AiConnection[],
  });

  it("T4335 — a decision INSIDE an EP does not spread it across lane-sized rows", () => {
    // The isolated shape, so a failure names the mechanism rather than one
    // diagram. R55.2 fires on a container that holds a decision; an EP is such a
    // container, and its rows must come from its own subgraph.
    const { elements, connections } = decisionInsideEp();
    const fits = epFits(layout(elements, connections));
    expect(fits.length).toBe(1);
    const f = fits[0];
    expect(f.slackTop, `child above the box — ${report(f)}`).toBeGreaterThanOrEqual(-0.5);
    expect(f.slackBottom, `child below the box — ${report(f)}`).toBeGreaterThanOrEqual(-0.5);
    expect(f.excess, report(f)).toBeLessThanOrEqual(MAX_EXCESS);
  });

  it("T4336 — an EP with NO decision inside is unaffected", () => {
    // The case R55.2 never touches. It must keep working exactly as it does —
    // a fix that only moved the failure into the straight-line case would pass
    // every test above.
    const elements: AiElement[] = [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "l", type: "lane", label: "Team", pool: "p" },
      { id: "s", type: "start-event", label: "In", pool: "p", lane: "l" },
      { id: "ep", type: "subprocess-expanded", label: "Straight Through", pool: "p", lane: "l" },
      { id: "is", type: "start-event", label: "", parentSubprocess: "ep" },
      { id: "t1", type: "task", label: "Step one", parentSubprocess: "ep" },
      { id: "t2", type: "task", label: "Step two", parentSubprocess: "ep" },
      { id: "ie", type: "end-event", label: "", parentSubprocess: "ep" },
      { id: "e", type: "end-event", label: "Out", pool: "p", lane: "l" },
    ] as AiElement[];
    const connections: AiConnection[] = [
      { sourceId: "s", targetId: "ep", type: "sequence" },
      { sourceId: "ep", targetId: "e", type: "sequence" },
      { sourceId: "is", targetId: "t1", type: "sequence" },
      { sourceId: "t1", targetId: "t2", type: "sequence" },
      { sourceId: "t2", targetId: "ie", type: "sequence" },
    ] as AiConnection[];
    const fits = epFits(layout(elements, connections));
    expect(fits.length).toBe(1);
    const f = fits[0];
    expect(f.slackTop, report(f)).toBeGreaterThanOrEqual(-0.5);
    expect(f.slackBottom, report(f)).toBeGreaterThanOrEqual(-0.5);
    expect(f.excess, report(f)).toBeLessThanOrEqual(MAX_EXCESS);
  });

  it("T4337 — a decision in the LANE still gets its rows (the rule must keep working)", () => {
    // The guard against over-correcting. R55.2 exists because branches landed on
    // each other; scoping it must not switch it off. Two branches off one lane
    // decision must still occupy DIFFERENT rows.
    const elements: AiElement[] = [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "l", type: "lane", label: "Team", pool: "p" },
      { id: "s", type: "start-event", label: "In", pool: "p", lane: "l" },
      { id: "gw", type: "gateway", label: "Which way?", pool: "p", lane: "l" },
      { id: "ta", type: "task", label: "Path A", pool: "p", lane: "l" },
      { id: "tb", type: "task", label: "Path B", pool: "p", lane: "l" },
      { id: "gm", type: "gateway", label: "Merge", pool: "p", lane: "l" },
      { id: "e", type: "end-event", label: "Out", pool: "p", lane: "l" },
    ] as AiElement[];
    const connections: AiConnection[] = [
      { sourceId: "s", targetId: "gw", type: "sequence" },
      { sourceId: "gw", targetId: "ta", type: "sequence", label: "A" },
      { sourceId: "gw", targetId: "tb", type: "sequence", label: "B" },
      { sourceId: "ta", targetId: "gm", type: "sequence" },
      { sourceId: "tb", targetId: "gm", type: "sequence" },
      { sourceId: "gm", targetId: "e", type: "sequence" },
    ] as AiConnection[];
    const data = layout(elements, connections);
    const ta = data.elements.find((e) => e.id === "ta")!;
    const tb = data.elements.find((e) => e.id === "tb")!;
    expect(Math.abs(ta.y - tb.y), "the two branches were stacked on the same row").toBeGreaterThan(20);
  });
});
