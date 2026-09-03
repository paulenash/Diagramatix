/**
 * The layout regression corpus — a ratchet on generated readability.
 *
 * Paul, 2026-09-03: one-pass generation has to produce a PDF a third party can
 * read, with nobody to tidy it. So "how readable is a generated diagram" needs
 * to be a number that cannot silently get worse.
 *
 * The fixtures are real AI plans, one BPMN process per chain, captured from the
 * CURRENT repository prompts by scripts/build-layout-corpus.ts. The plan is the
 * expensive half; replaying it exercises the whole layout for free, and — the
 * point Paul made about scanning whatever was in Downloads — a fixed corpus
 * means a number that moved says something about the CHANGE rather than about
 * which files happened to be in the set.
 *
 * The budget below is a high-water mark, not an approval. Lower it whenever a
 * fix lands; never raise it to make a change fit.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations, findReadabilityViolations } from "@/app/lib/diagram/checks/layoutViolations";
import type { DiagramData } from "@/app/lib/diagram/types";

const DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".plan.json")) : [];

/** Measured 2026-09-03 at 72 across 26 diagrams. Ratchet DOWN only. */
const BUDGET = 72;

describe("layout corpus — generated diagrams stay readable", () => {
  it("T3152 — the corpus is present and every plan still lays out", () => {
    expect(files.length, "no corpus — run scripts/build-layout-corpus.ts --all").toBeGreaterThanOrEqual(20);
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      expect(plan?.elements?.length, `${f} has no plan`).toBeGreaterThan(0);
      expect(() => layoutBpmnDiagram(plan.elements, plan.connections), `${f} threw`).not.toThrow();
    }
  });

  it("T3153 — total readability violations do not exceed the budget", () => {
    let total = 0;
    const worst: string[] = [];
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      const r = layoutBpmnDiagram(plan.elements, plan.connections);
      const data = { elements: r.elements, connectors: r.connectors } as DiagramData;
      const vs = [...findLayoutViolations(data), ...findReadabilityViolations(data)];
      total += vs.length;
      if (vs.length) worst.push(`${f}: ${vs.length}`);
    }
    expect(total,
      `readability regressed — was ${BUDGET}, now ${total}. Worst: ${worst.slice(0, 6).join(", ")}. `
      + `Lower BUDGET when you fix some; never raise it.`).toBeLessThanOrEqual(BUDGET);
  });
});
