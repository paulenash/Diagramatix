/**
 * Task markers — deterministic message-driven assignment (T0739).
 *
 * normaliseAiPlan assigns the MESSAGE-driven markers in code (not the model):
 *   • message to/from an IT-System black-box pool (isSystem=true) → "user"
 *   • only SENDS to an external-entity pool (isSystem=false)       → "send"
 *   • only RECEIVES from an external-entity pool                   → "receive"
 *   • both directions with an external entity                     → "none"
 * A task with NO black-box-pool message keeps the model's wording-based choice
 * (service / user / send / receive / manual), defaulting to "none". Default is
 * always "none". User is ONLY for IT-System interaction.
 */
import { describe, it, expect } from "vitest";
import { normaliseAiPlan } from "@/app/lib/ai/planBpmn";
import type { AiElement, AiConnection } from "@/app/lib/diagram/bpmnLayout";

const POOLS: AiElement[] = [
  { id: "p1", type: "pool", label: "Company", poolType: "white-box" },
  { id: "pSys", type: "pool", label: "Salesforce", poolType: "black-box", isSystem: true },
  { id: "pCust", type: "pool", label: "Customer", poolType: "black-box", isSystem: false },
] as AiElement[];

function run(tasks: AiElement[], conns: AiConnection[]) {
  const plan = { elements: [...POOLS, ...tasks], connections: conns };
  normaliseAiPlan(plan);
  return (id: string) => plan.elements.find((e) => e.id === id)!.taskType;
}

describe("task markers — deterministic message rules (T0739)", () => {
  it("IT-System message (either direction) → user", () => {
    const tt = run(
      [
        { id: "a", type: "task", label: "Key into system", pool: "p1", taskType: "manual" },
        { id: "b", type: "task", label: "Read from system", pool: "p1" },
      ] as AiElement[],
      [
        { sourceId: "a", targetId: "pSys", type: "message" },
        { sourceId: "pSys", targetId: "b", type: "message" },
      ] as AiConnection[],
    );
    expect(tt("a")).toBe("user"); // overrides the model's wrong "manual"
    expect(tt("b")).toBe("user");
  });

  it("only sends to an external entity → send; only receives → receive", () => {
    const tt = run(
      [
        { id: "s", type: "task", label: "Notify customer", pool: "p1" },
        { id: "r", type: "task", label: "Await confirmation", pool: "p1" },
      ] as AiElement[],
      [
        { sourceId: "s", targetId: "pCust", type: "message" },
        { sourceId: "pCust", targetId: "r", type: "message" },
      ] as AiConnection[],
    );
    expect(tt("s")).toBe("send");
    expect(tt("r")).toBe("receive");
  });

  it("both directions with an external entity → none", () => {
    const tt = run(
      [{ id: "c", type: "task", label: "Correspond", pool: "p1", taskType: "send" }] as AiElement[],
      [
        { sourceId: "c", targetId: "pCust", type: "message" },
        { sourceId: "pCust", targetId: "c", type: "message" },
      ] as AiConnection[],
    );
    expect(tt("c")).toBe("none");
  });

  it("no black-box message keeps the model's wording-based marker; empty defaults to none", () => {
    const tt = run(
      [
        { id: "auto", type: "task", label: "Auto-generate invoice", pool: "p1", taskType: "service" },
        { id: "sys", type: "task", label: "Key into AP System", pool: "p1", taskType: "user" },
        { id: "plain", type: "task", label: "Review application", pool: "p1" },
      ] as AiElement[],
      [] as AiConnection[],
    );
    expect(tt("auto")).toBe("service"); // automated — preserved
    expect(tt("sys")).toBe("user");     // wording implies IT system, no pool — preserved
    expect(tt("plain")).toBe("none");   // plain human step, no marker → default none
  });

  it("a sequence flow (not a message) does not drive a marker", () => {
    const tt = run(
      [{ id: "x", type: "task", label: "Do", pool: "p1" }] as AiElement[],
      [{ sourceId: "x", targetId: "pCust", type: "sequence" }] as AiConnection[],
    );
    expect(tt("x")).toBe("none");
  });
});
