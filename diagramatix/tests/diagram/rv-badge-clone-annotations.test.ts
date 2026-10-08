/**
 * T5288 — Paul, 2026-10-08:
 *   1. a new RV (Review Comment) badge in the project navigation tree, in light and dark pink to match the review notes, with Review Comments as
 *      a Feature Colour;
 *   2. cloning a diagram takes its badges with it (the clone's list entry now carries the diagram's data, which the badges are read from);
 *   3. an AI-generated annotation never sits over another element (R8.52).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { diagramFeatureBadges } from "@/app/lib/diagram/diagramFeatureBadges";
import { DEFAULT_FEATURE_COLORS, FEATURE_KEYS, FEATURE_META, contrastRatio } from "@/app/lib/theme/featureColors";
import { REVIEW_COMMENT_PALETTE } from "@/app/lib/diagram/canvasPaint";
import { layoutBpmnDiagram, type AiConnection, type AiElement } from "@/app/lib/diagram/bpmnLayout";

const el = (id: string, type: string) => ({ id, type, x: 0, y: 0, width: 100, height: 60, label: id, properties: {} });
const data = (types: string[]) => ({ elements: types.map((t, i) => el(`e${i}`, t)), connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });

describe("T5288 1 — the RV badge", () => {
  it("appears when the diagram carries review comments, counts them, and not otherwise", () => {
    const rv = diagramFeatureBadges(data(["task", "review-comment", "review-comment"])).find((b) => b.key === "reviewComment");
    expect(rv).toMatchObject({ code: "RV", color: "reviewComment" });
    expect(rv!.title).toBe("2 review comments");
    expect(diagramFeatureBadges(data(["review-comment"])).find((b) => b.key === "reviewComment")!.title).toBe("1 review comment");
    expect(diagramFeatureBadges(data(["task"])).some((b) => b.key === "reviewComment")).toBe(false);
  });
  it("Review Comments is a Feature Colour, pink by default — the review note's own light pink behind a dark pink, and readable", () => {
    expect(FEATURE_KEYS).toContain("reviewComment");
    expect(FEATURE_META.find((m) => m.key === "reviewComment")?.label).toBe("Review Comments");
    const c = DEFAULT_FEATURE_COLORS.reviewComment;
    expect(c.bg.toLowerCase()).toBe(REVIEW_COMMENT_PALETTE[0].fill.toLowerCase());     // the note's own light pink
    expect(contrastRatio(c.bg, c.text)).toBeGreaterThanOrEqual(4.5);                    // dark pink text on it
  });
  it("it can be filtered on in the tree like the others", () => {
    expect(readFileSync("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", "utf8")).toContain('["reviewComment", "RV", "Has review comments"],');
  });
});

describe("T5288 2 — cloning a diagram takes its badges", () => {
  it("the clone's entry in the list carries the diagram's data, colours and display mode", () => {
    const src = readFileSync("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx", "utf8");
    const at = src.indexOf("async function handleCloneDiagram");
    const body = src.slice(at, src.indexOf("// Flowchart → BPMN translation", at));
    expect(body).toContain("data: created.data ?? src.data,");
    expect(body).toContain("colorConfig: created.colorConfig ?? src.colorConfig,");
    expect(body).toContain("displayMode: created.displayMode ?? src.displayMode,");
  });
});

describe("T5288 3 — an annotation never sits over another element (R8.52)", () => {
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const BODY = new Set(["task", "subprocess", "subprocess-expanded", "start-event", "end-event", "intermediate-event", "gateway", "data-object", "data-store", "text-annotation"]);

  it("Paul's General Email Processing plan: the annotation clears the data store it used to cover", () => {
    const plan = JSON.parse(readFileSync("tests/fixtures/general-email-annotation.plan.json", "utf8")).plan as { elements: AiElement[]; connections: AiConnection[] };
    const g = layoutBpmnDiagram(plan.elements, plan.connections);
    const anns = g.elements.filter((e) => e.type === "text-annotation");
    expect(anns.length).toBeGreaterThan(0);
    for (const a of anns) {
      const over = g.elements.filter((o) => o.id !== a.id && BODY.has(o.type) && overlap(a, o)).map((o) => o.label);
      expect(over, `annotation "${a.label}" is over ${over.join(", ")}`).toEqual([]);
      // its association line faces it: the sides are one of the four, and the pair is opposite
      const c = g.connectors.find((x) => x.sourceId === a.id || x.targetId === a.id)!;
      const opposite: Record<string, string> = { left: "right", right: "left", top: "bottom", bottom: "top" };
      expect(opposite[c.sourceSide as string]).toBe(c.targetSide);
    }
  });
  it("an annotation that is already clear is left exactly where it was placed (above its task)", () => {
    const els: AiElement[] = [
      { id: "p", type: "pool", label: "P", poolType: "white-box" },
      { id: "s", type: "start-event", label: "Start", pool: "p" }, { id: "t", type: "task", label: "Do it", pool: "p" },
      { id: "e", type: "end-event", label: "End", pool: "p" }, { id: "n", type: "text-annotation", label: "Note", pool: "p" },
    ];
    const cs: AiConnection[] = [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }, { sourceId: "n", targetId: "t" }];
    const g = layoutBpmnDiagram(els, cs);
    const n = g.elements.find((x) => x.id === "n")!, t = g.elements.find((x) => x.id === "t")!;
    // 20 px from its task, above or below (the early placement flips it below when above would leave the container). Its sideways position is
    // whatever the early placement gave it — the task can move after that, and an annotation that is clear is not touched by R8.52.
    const gapAbove = t.y - (n.y + n.height), gapBelow = n.y - (t.y + t.height);
    expect([Math.round(gapAbove), Math.round(gapBelow)]).toContain(20);
  });
  it("the rule is named in the layout", () => {
    expect(readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8")).toContain("R8.52");
  });
  it("R8.52 is a Red Rule: in the seed after R8.51, and its patch says the same and REPORTS whether it was already run", () => {
    const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
    const sql = readFileSync("scripts/sql/patch-rule-r8-52-annotation-clear-of-elements.sql", "utf8");
    const at = seed.indexOf("R8.52:");
    expect(at).toBeGreaterThan(seed.indexOf("R8.51:"));
    const text = JSON.parse(`"${seed.slice(at, seed.indexOf('"', at))}"`) as string;
    expect(sql).toContain(text.trim());
    expect(sql).toContain("AND rules NOT LIKE '%R8.52:%'");
    expect(sql).toContain("LIKE 'Group 8: Auto-Layout Placement%'");
    for (const word of ["ALREADY APPLIED", "APPLIED NOW", "NOT APPLIED"]) expect(sql).toContain(word);
    expect(sql).not.toContain("DELETE FROM");
  });
});
