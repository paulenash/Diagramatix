/**
 * Risk & Control — the element annotation helper + the two structure checks
 * (B38 control-coverage, B39 segregation-of-duties). Pure, no DB.
 */
import { describe, it, expect } from "vitest";
import { getRiskControl, riskControlPatch, hasRiskControl } from "@/app/lib/diagram/riskControl";
import { checkControlCoverage, checkSegregationOfDuties } from "@/app/lib/diagram/checks/diagramChecks";
import type { DiagramElement } from "@/app/lib/diagram/types";

const el = (over: Partial<DiagramElement>): DiagramElement => ({
  id: "e", type: "task", x: 0, y: 0, width: 100, height: 60, label: "", properties: {}, ...over,
});

describe("riskControl element helpers", () => {
  it("T0626 — riskControlPatch merges over the current annotation (shallow-merge safe)", () => {
    const e = el({ properties: { risk: { riskRefs: [{ itemId: "r1", code: "R-01", label: "Fraud" }] } } });
    // Adding controlRefs must NOT drop the existing riskRefs.
    const patch = riskControlPatch(e, { controlRefs: [{ itemId: "c1", code: "C-01", label: "Approval" }] });
    expect(patch.risk.riskRefs).toHaveLength(1);
    expect(patch.risk.controlRefs).toHaveLength(1);
    expect(getRiskControl({ properties: {} })).toEqual({});
    expect(hasRiskControl(e)).toBe(true);
    expect(hasRiskControl(el({}))).toBe(false);
  });
});

describe("B38 control-coverage", () => {
  it("T0627 — flags a step with a risk but no control; clean when a control is attached", () => {
    const gap = checkControlCoverage({
      elements: [el({ id: "t1", label: "Pay invoice", properties: { risk: { riskRefs: [{ itemId: "r1", code: "R-01", label: "Fraud" }] } } })],
      connectors: [],
    });
    expect(gap).toHaveLength(1);
    expect(gap[0].rule).toBe("control-coverage");
    expect(gap[0].ids).toEqual(["t1"]);

    const covered = checkControlCoverage({
      elements: [el({ id: "t1", properties: { risk: { riskRefs: [{ itemId: "r1", code: "R-01", label: "Fraud" }], controlRefs: [{ itemId: "c1", code: "C-01", label: "Approval" }] } } })],
      connectors: [],
    });
    expect(covered).toHaveLength(0);
  });
});

describe("B39 segregation-of-duties", () => {
  it("T0628 — flags a lane that both originates and approves; clean when split across lanes", () => {
    const lane = el({ id: "L1", type: "lane", label: "Clerk" });
    const breach = checkSegregationOfDuties({
      elements: [
        lane,
        el({ id: "t1", label: "Raise invoice", parentId: "L1" }),
        el({ id: "t2", label: "Approve invoice", parentId: "L1" }),
      ],
      connectors: [],
    });
    expect(breach).toHaveLength(1);
    expect(breach[0].rule).toBe("segregation-of-duties");
    expect(breach[0].ids).toContain("L1");

    const clean = checkSegregationOfDuties({
      elements: [
        el({ id: "L1", type: "lane", label: "Clerk" }),
        el({ id: "L2", type: "lane", label: "Manager" }),
        el({ id: "t1", label: "Raise invoice", parentId: "L1" }),
        el({ id: "t2", label: "Approve invoice", parentId: "L2" }),
      ],
      connectors: [],
    });
    expect(clean).toHaveLength(0);
  });
});
