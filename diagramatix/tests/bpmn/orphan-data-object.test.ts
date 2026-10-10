/**
 * T5298 — an unattached data object (Paul, 2026-10-10, V01.08 "Payment Record"): when every consumer of a data object is far away, the
 * long-association splitter gives each its own copy; it used to leave the ORIGINAL behind with no connector — a duplicate the scanner
 * reports and nobody can find. The copies carry every link, so the original goes.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { checkDiagram } from "@/app/lib/diagram/checks/diagramChecks";

const plan = JSON.parse(readFileSync("tests/fixtures/containment-2026-10-09/paul-V01.08.plan.json", "utf8"));

describe("T5298 no orphaned data object after the long-association split", () => {
  const data = layoutBpmnDiagram(plan.elements, plan.connections);
  const artifacts = data.elements.filter((e) => e.type === "data-object" || e.type === "data-store");

  it("every data object or store has at least one connector", () => {
    const loose = artifacts.filter((a) => !data.connectors.some((c) => c.sourceId === a.id || c.targetId === a.id));
    expect(loose.map((a) => `${a.id} "${a.label}"`)).toEqual([]);
  });

  it("the scanner finds no 'Data Object without an association' on V01.08", () => {
    const hits = checkDiagram(data as never).filter((v) => v.message.includes("has no association connector"));
    expect(hits.map((v) => v.message)).toEqual([]);
  });

  it("the information is not lost: 'Payment Record' is still drawn beside each of its consumers", () => {
    const copies = artifacts.filter((a) => a.label === "Payment Record");
    expect(copies.length).toBeGreaterThanOrEqual(2);
    for (const c of copies) expect(data.connectors.some((k) => k.sourceId === c.id || k.targetId === c.id)).toBe(true);
  });
});
