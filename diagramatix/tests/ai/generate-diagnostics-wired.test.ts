/**
 * Paul, 2026-08-29: "Editor AI Generate shows no diagnostics — only the batch
 * runner passes onDiagnostic."
 *
 * The layout reports what it could not take at face value — a reference naming
 * nothing, a subprocess left empty, an element nothing placed. The .md batch
 * runner has surfaced those since the V06 work; the two routes the EDITOR uses
 * did not, so the same bad plan came back looking like a clean success.
 *
 * A source-text tripwire rather than an HTTP test: these routes need a session,
 * a database, a subscription and an API key to run, and the thing that actually
 * regresses is somebody adding a third generate route — or refactoring one of
 * these two — without carrying the callback through. Same idiom as
 * `tests/config/route-protection.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Every route.ts under a directory, recursively. */
function routesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const name of readdirSync(join(process.cwd(), rel))) {
      const r = `${rel}/${name}`;
      if (statSync(join(process.cwd(), r)).isDirectory()) walk(r);
      else if (name === "route.ts") out.push(r);
    }
  };
  walk(dir);
  return out;
}

describe("layout diagnostics reach the editor", () => {
  for (const route of [
    "app/api/ai/generate-bpmn/route.ts",
    "app/api/ai/bpmn/apply-layout/route.ts",
  ]) {
    it(`T2940 — ${route} collects and returns them`, () => {
      const src = read(route);
      expect(src, "must pass onDiagnostic into layoutBpmnDiagram").toMatch(/onDiagnostic:/);
      expect(src, "must return them to the caller").toMatch(/\bdiagnostics,/);
    });
  }

  it("T2941 — every route that lays out a BPMN diagram passes onDiagnostic", () => {
    // The real guard: a third generate route added later must not silently drop
    // them. Only routes that CALL layoutBpmnDiagram are in scope.
    const offenders = routesUnder("app/api")
      .filter((r) => /layoutBpmnDiagram\s*\(/.test(read(r)))
      .filter((r) => !/onDiagnostic/.test(read(r)));
    expect(
      offenders,
      "these lay out a diagram but discard what the layout could not take at face value",
    ).toEqual([]);
  });

  for (const panel of [
    "app/(dashboard)/diagram/[id]/AiPanel.tsx",
    "app/(dashboard)/diagram/[id]/PlanPanel.tsx",
  ]) {
    it(`T2942 — ${panel.split("/").pop()} reads and shows them`, () => {
      const src = read(panel);
      expect(src, "must read diagnostics off the response").toMatch(/setDiagnostics\(/);
      expect(src, "must render them").toMatch(/could not take at face value/);
      // Cleared on a new run: a run that fails early returns before the response
      // is read, and a stale list would look like it belonged to this attempt.
      expect(src.match(/setDiagnostics\(\[\]\)/g) ?? [], "must clear on a new run").not.toHaveLength(0);
    });
  }
});
