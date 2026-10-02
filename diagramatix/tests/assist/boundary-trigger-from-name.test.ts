/**
 * T5210 — "add a boundary event called X": the trigger comes from the WORDING of the name unless the
 * sentence said one. (Paul, 2026-10-02: error / cancellation / receive / escalate → Error / Cancel / Message /
 * Escalation; any phrase with a time or date → Timer.)
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { inferBoundaryTrigger } from "@/app/lib/assist/boundaryEventPhrase";
import { EMPTY_DIAGRAM, type DiagramData, type DiagramElement } from "@/app/lib/diagram/types";

describe("T5210 inferBoundaryTrigger", () => {
  it.each([
    ["Payment error", "error"], ["Errors found", "error"],
    ["Claim cancellation", "cancel"], ["Order cancelled", "cancel"],
    ["Receive documents", "message"], ["Documents received", "message"],
    ["Escalate to manager", "escalation"], ["Escalation needed", "escalation"],
  ])("the four words: %s → %s", (name, want) => expect(inferBoundaryTrigger(name)).toBe(want));

  it.each([
    "Timeout", "Time out", "Timer expired", "Wait 3 days", "After two weeks", "Every Friday", "Weekly check",
    "By 5pm", "At 14:30", "Due date passed", "Deadline", "Overdue", "In March", "On the 15th", "Reminder 24 hours later",
  ])("a time or date phrase → timer: %s", (name) => expect(inferBoundaryTrigger(name)).toBe("timer"));

  it.each(["Approve claim", "Check coverage", "Pay supplier", "Amina review", "Timesheet", "Second opinion", ""])(
    "an ordinary name infers nothing: %j", (name) => expect(inferBoundaryTrigger(name)).toBeUndefined());

  it("nothing given, nothing inferred", () => expect(inferBoundaryTrigger(undefined)).toBeUndefined());

  it("the four words are read before a time phrase", () => {
    expect(inferBoundaryTrigger("Escalate after 3 days")).toBe("escalation");
  });
});

const el = (id: string, type: string, x: number, y: number, w: number, h: number, label: string, parentId?: string): DiagramElement =>
  ({ id, type, x, y, width: w, height: h, label, properties: type === "pool" ? { poolType: "white-box" } : {}, ...(parentId ? { parentId } : {}) }) as DiagramElement;
const world = (): DiagramData => ({
  ...EMPTY_DIAGRAM,
  elements: [el("pool", "pool", 0, 0, 760, 300, "Claims"), el("lane", "lane", 30, 0, 730, 300, "Intake", "pool"), el("task", "task", 200, 100, 102, 64, "Review Claim", "lane")],
  connectors: [],
});
function boundaryOf(sentence: string, selected = ["task"]) {
  const h = headlessDiagram(world());
  const ops = parseCommand(sentence);
  expect(ops, sentence).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: selected }));
  return { r, ev: h.data.elements.find((e) => e.boundaryHostId === "task") };
}

describe("T5210 the add-boundary-event command uses it", () => {
  it("the name decides when no trigger was said", () => {
    expect(boundaryOf("add a boundary event called Payment error").ev?.eventType).toBe("error");
    expect(boundaryOf("add a boundary event called Wait 3 days").ev?.eventType).toBe("timer");
    expect(boundaryOf("add a boundary event called Documents received").ev?.eventType).toBe("message");
    expect(boundaryOf("add a boundary event called Claim cancellation").ev?.eventType).toBe("cancel");
    expect(boundaryOf("add a boundary event called Escalation needed").ev?.eventType).toBe("escalation");
  });
  it("the log says it was read from the name", () => {
    expect(boundaryOf("add a boundary event called Payment error").r.summary).toContain("an error event, read from its name");
  });
  it("a trigger SAID in the sentence always wins over the name's wording", () => {
    const { ev } = boundaryOf("add a timer boundary event called Payment error");
    expect(ev?.eventType).toBe("timer");
  });
  it("an ordinary name gets no trigger (as before)", () => {
    const { ev } = boundaryOf("add a boundary event called Approved");
    expect(ev).toBeTruthy();
    expect(ev?.eventType === undefined || ev?.eventType === "none").toBe(true);
  });
});
