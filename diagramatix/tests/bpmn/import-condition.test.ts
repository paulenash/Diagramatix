/**
 * IO-05 — a sequence flow's condition expression must survive a .bpmn import.
 *
 * The importer detected `<conditionExpression>` but discarded the body and wrote
 * the literal string "true" onto a private `_condition` field, losing the actual
 * routing logic of every conditional flow. It now extracts the real expression
 * into the connector's `branchCondition`.
 */
import { describe, it, expect } from "vitest";
import { buildBpmnXml } from "@/app/lib/diagram/bpmn/exportBpmnXml";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";
import type { DiagramData } from "@/app/lib/diagram/types";

/** start → gateway → (A with a condition | B default) → end. */
function diagramWithCondition(): DiagramData {
  return {
    elements: [
      { id: "start", type: "start-event", label: "In", x: 0, y: 100, width: 40, height: 40, properties: {} },
      { id: "gw", type: "gateway", gatewayType: "exclusive", label: "Amount?", x: 100, y: 95, width: 50, height: 50, properties: {} },
      { id: "a", type: "task", label: "Escalate", x: 220, y: 20, width: 120, height: 70, properties: {} },
      { id: "b", type: "task", label: "Auto-approve", x: 220, y: 160, width: 120, height: 70, properties: {} },
      { id: "end", type: "end-event", label: "Out", x: 420, y: 100, width: 40, height: 40, properties: {} },
    ],
    connectors: [
      { id: "c0", sourceId: "start", targetId: "gw", type: "sequence", waypoints: [] },
      { id: "cA", sourceId: "gw", targetId: "a", type: "sequence", waypoints: [], branchCondition: "amount > 10000" },
      { id: "cB", sourceId: "gw", targetId: "b", type: "sequence", waypoints: [], isDefaultFlow: true },
      { id: "cA2", sourceId: "a", targetId: "end", type: "sequence", waypoints: [] },
      { id: "cB2", sourceId: "b", targetId: "end", type: "sequence", waypoints: [] },
    ],
  } as unknown as DiagramData;
}

describe("BPMN import — condition expressions (IO-05)", () => {
  it("preserves the real condition text, not the literal \"true\"", async () => {
    const xml = buildBpmnXml(diagramWithCondition(), "cond");
    // Sanity: the export carries the expression we set.
    expect(xml).toContain("amount &gt; 10000");

    const back = await importBpmnXml(xml, "cond");
    const conds = back.data.connectors
      .map((c) => c.branchCondition)
      .filter((v): v is string => typeof v === "string");

    // Exactly one flow carried a condition, and it is the decoded expression.
    expect(conds).toContain("amount > 10000");
    expect(conds).not.toContain("true");
  });
});
