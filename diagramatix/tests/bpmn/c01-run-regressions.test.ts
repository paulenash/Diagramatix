/**
 * T5304 — Paul's full local run of "Create a New Value Chain" (C01 Online Jewellery Shop, 2026-10-10): the eight BPMN plans the AI wrote, laid out by
 * the current code. The run found two defects that no fixture had: a task pulled onto a row another task already held (R8.33), and a connector running
 * through its own target because the target's top face was walled in. Every plan must now lay out with no ERROR from the diagram checker.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { checkDiagram } from "@/app/lib/diagram/checks/diagramChecks";

const DIR = "tests/fixtures/containment-2026-10-09";
const FILES = readdirSync(DIR).filter((f) => f.startsWith("c01-run-") && f.endsWith(".plan.json"));
const lay = (f: string) => { const p = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")); return layoutBpmnDiagram(p.elements, p.connections); };

describe("T5304 the C01 Online Jewellery Shop run", () => {
  it("has all eight process plans", () => expect(FILES).toHaveLength(8));
  for (const f of FILES) {
    it(`${f}: lays out with no errors from the checker`, () => {
      const errors = checkDiagram(lay(f) as never).filter((v) => v.severity === "error");
      expect(errors.map((v) => `${v.rule}: ${v.message.replace(/\s+/g, " ").slice(0, 140)}`)).toEqual([]);
    });
  }
  it("C01.04: the decision task is not on top of the PayPal refund task, and the refund connector does not run through its own target", () => {
    const d = lay("c01-run-c01-04.plan.json");
    const t5 = d.elements.find((e) => e.id === "t5")!, t7 = d.elements.find((e) => e.id === "t7")!;
    const overlap = Math.min(t5.x + t5.width, t7.x + t7.width) > Math.max(t5.x, t7.x) && Math.min(t5.y + t5.height, t7.y + t7.height) > Math.max(t5.y, t7.y);
    expect(overlap).toBe(false);
    expect(checkDiagram(d as never).filter((v) => v.rule === "sequence-clips-own-endpoint")).toEqual([]);
  });
});
