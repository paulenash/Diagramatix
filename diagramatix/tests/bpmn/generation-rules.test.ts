/**
 * BPMN generation rules (T0717, T0718):
 *  1. Task / Subprocess names get HARD line breaks by word count
 *     (≤2 unchanged; 3-4 → after word 2; 5-6 → after word 3; >6 → every 3).
 *  2. Any set of Lanes must have a containing Pool — orphan lanes are wrapped
 *     in a white-box pool named "Process".
 * Both are enforced deterministically in normaliseAiPlan (all BPMN generation).
 */
import { describe, it, expect } from "vitest";
import { hardWrapProcessName } from "@/app/lib/diagram/textMetrics";
import { normaliseAiPlan } from "@/app/lib/ai/planBpmn";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

describe("hardWrapProcessName (T0717)", () => {
  it("leaves 1-2 word names unchanged", () => {
    expect(hardWrapProcessName("Print Check")).toBe("Print Check");
    expect(hardWrapProcessName("Approve")).toBe("Approve");
  });
  it("breaks 3-4 word names after the 2nd word", () => {
    expect(hardWrapProcessName("Send Back to Requester")).toBe("Send Back\nto Requester");
    expect(hardWrapProcessName("Send to Department Head")).toBe("Send to\nDepartment Head");
  });
  it("breaks 5-6 word names after the 3rd word", () => {
    expect(hardWrapProcessName("Fill Out Check Request Form")).toBe("Fill Out Check\nRequest Form");
    expect(hardWrapProcessName("Send to Vice President for Approval")).toBe("Send to Vice\nPresident for Approval");
  });
  it("breaks names over 6 words after every 3rd word", () => {
    expect(hardWrapProcessName("one two three four five six seven")).toBe("one two three\nfour five six\nseven");
  });
  it("is idempotent (\\n counts as whitespace)", () => {
    const once = hardWrapProcessName("Fill Out Check Request Form");
    expect(hardWrapProcessName(once)).toBe(once);
  });
});

describe("normaliseAiPlan generation rules (T0718)", () => {
  it("hard-wraps every generated task + collapsed subprocess name", () => {
    const plan = {
      elements: [
        { id: "t", type: "task", label: "Send Back to Requester" },
        { id: "sp", type: "subprocess", label: "Review And Approve Request" },
        { id: "e", type: "start-event", label: "Application Received Today Now" }, // events NOT wrapped
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    expect(plan.elements.find((e) => e.id === "t")!.label).toBe("Send Back\nto Requester");
    expect(plan.elements.find((e) => e.id === "sp")!.label).toBe("Review And\nApprove Request");
    expect(plan.elements.find((e) => e.id === "e")!.label).toBe("Application Received Today Now"); // unchanged
  });

  it("wraps orphan lanes in a 'Process' pool and re-parents their elements", () => {
    const plan = {
      elements: [
        { id: "l1", type: "lane", label: "Sales" },
        { id: "l2", type: "lane", label: "Finance" },
        { id: "t", type: "task", label: "Do", lane: "l1" },
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    const pool = plan.elements.find((e) => e.type === "pool");
    expect(pool).toBeTruthy();
    expect(pool!.label).toBe("Process");
    expect(pool!.poolType).toBe("white-box");
    expect(plan.elements.find((e) => e.id === "l1")!.parentPool).toBe(pool!.id);
    expect(plan.elements.find((e) => e.id === "l2")!.parentPool).toBe(pool!.id);
    expect(plan.elements.find((e) => e.id === "t")!.pool).toBe(pool!.id);
  });

  it("does NOT inject a pool when lanes already have one", () => {
    const plan = {
      elements: [
        { id: "p", type: "pool", label: "Company", poolType: "white-box" },
        { id: "l1", type: "lane", label: "Sales", parentPool: "p" },
      ] as AiElement[],
      connections: [] as AiConnection[],
    };
    normaliseAiPlan(plan);
    expect(plan.elements.filter((e) => e.type === "pool")).toHaveLength(1);
    expect(plan.elements.find((e) => e.type === "pool")!.id).toBe("p");
  });
});
