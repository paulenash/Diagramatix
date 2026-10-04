/**
 * T5235 — the endpoint allocator against REAL generated diagrams: the 30 captured AI plans of the layout corpus.
 * Not wired into generation yet (slice 2): this only proves it behaves on real data before anything depends on it.
 *   • it never throws and never mutates its input;
 *   • it is idempotent on every diagram;
 *   • after it, no Activity or Event face holds two ruled connectors on the same point (gateways are out of scope);
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations } from "@/app/lib/diagram/checks/layoutViolations";
import { spreadEndpoints } from "@/app/lib/diagram/endpointSpread";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".plan.json")).sort() : [];

function diagram(f: string): DiagramData {
  const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
  const r = layoutBpmnDiagram(plan.elements, plan.connections);
  return { elements: r.elements, connectors: r.connectors } as DiagramData;
}
/** `shared attachment point <el>|<side>|<off> — …` entries whose element is NOT a gateway. */
function sharedOnNonGateways(d: DiagramData): string[] {
  const typeOf = new Map(d.elements.map((e: DiagramElement) => [e.id, e.type] as const));
  return findLayoutViolations(d).filter((v) => v.startsWith("shared attachment point") && typeOf.get(v.slice("shared attachment point ".length).split("|")[0]) !== "gateway");
}

describe("T5235 the allocator on the layout corpus", () => {
  it("the corpus is there", () => expect(files.length).toBeGreaterThanOrEqual(20));

  it("every diagram: no throw, no mutation, idempotent, and no shared point left on an Activity or an Event", () => {
    const problems: string[] = [];
    let diagramsChanged = 0;
    for (const f of files) {
      const d = diagram(f);
      const before = JSON.stringify(d.connectors);
      let once!: ReturnType<typeof spreadEndpoints>;
      try { once = spreadEndpoints(d.elements, d.connectors); } catch (e) { problems.push(`${f} threw: ${(e as Error).message}`); continue; }
      if (JSON.stringify(d.connectors) !== before) problems.push(`${f}: input was mutated`);
      if (once.changedIds.length) diagramsChanged++;
      const twice = spreadEndpoints(d.elements, once.connectors);
      if (twice.changedIds.length) problems.push(`${f}: not idempotent (second run changed ${twice.changedIds.join(", ")})`);
      const after = sharedOnNonGateways({ ...d, connectors: once.connectors });
      if (after.length && !once.unresolved.length) problems.push(`${f}: still shares ${after.join("; ")}`);
    }
    expect(problems).toEqual([]);
    // Information, not an assertion: how many of the real diagrams the rule would touch (a number to watch in slice 2).
    console.log(`endpoint-spread corpus: ${diagramsChanged} of ${files.length} diagrams change`);
  });
});
