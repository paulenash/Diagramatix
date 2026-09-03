/**
 * A prompt must not ask for something BPMN cannot draw.
 *
 * Paul, 2026-09-03, reading V22.07: a message "in the middle of nowhere … A
 * missing Black-box Pool???", and an event that "should be an EMIE on Task
 * 'Escalate to delegated approver' probably?". Then: "Is this a Master Prompt
 * issue?" It is. Both were faithful renderings of what the prompt asked for,
 * and the master template never forbade either:
 *
 *   §5 said "the task it is attached to" — a slot, with no rule that the host
 *      must be an ACTIVITY. 25 prompts across 21 processes mount a boundary
 *      event on an intermediate catch event.
 *   §6 said "<source> → <target>" — with no rule that a message flow crosses a
 *      POOL boundary. 39 flows across 20 processes run lane-to-lane inside one
 *      pool.
 *
 * Faults spread that evenly across independently generated chains are
 * template-level, not content-level.
 */
import { describe, it, expect } from "vitest";
import { checkPromptShapes } from "@/app/lib/valueChain/checkPromptShapes";
import { DEFAULT_MD_PROMPT } from "@/app/lib/valueChain/promptTemplates";

describe("the master template forbids what cannot be drawn", () => {
  it("T3172 — it says a boundary event attaches only to an activity", () => {
    const t = DEFAULT_MD_PROMPT.bpmn;
    expect(t).toMatch(/ONLY TO AN ACTIVITY/i);
    expect(t, "and names the wait-with-a-deadline case that caused it").toMatch(/Receive task/i);
  });

  it("T3173 — it says a message flow must cross a pool boundary", () => {
    const t = DEFAULT_MD_PROMPT.bpmn;
    expect(t).toMatch(/MUST CROSS A POOL BOUNDARY/i);
    expect(t, "and says what to do instead").toMatch(/sequence flow/i);
  });
});

describe("undrawable instructions are detected in the prompt text", () => {
  const boundaryOnEvent = `
5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Intermediate message catch event
  Approval decision received" — label "Escalation response overdue" —
  triggers User task "Chase delegated approver".
`;
  const boundaryOnTask = `
5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Await approval decision" — label
  "Escalation response overdue" — triggers User task "Chase approver".
`;

  it("T3174 — a boundary event on an intermediate event is reported", () => {
    const v = checkPromptShapes(boundaryOnEvent);
    expect(v.map((x) => x.kind)).toContain("boundary-on-non-activity");
  });

  it("T3175 — one on a task is not (the negative control)", () => {
    expect(checkPromptShapes(boundaryOnTask)).toEqual([]);
  });

  it("T3176 — a lane-to-lane message flow is reported", () => {
    const v = checkPromptShapes(`
6. Connectors

Message flows:
  Claims Assessment lane (Send task "Escalate to delegated approver") →
    Claims Management lane (Message start event "Escalation received")
    (escalation package)
`);
    expect(v.map((x) => x.kind)).toContain("message-within-pool");
  });

  it("T3177 — a flow that reaches a POOL is not (the negative control)", () => {
    const v = checkPromptShapes(`
6. Connectors

Message flows:
  Claims Assessment lane (Service task "Record final decision") → Claims
    Management Platform (final decision and rationale)
`);
    expect(v).toEqual([]);
  });

  it("T3178 — a wrapped instruction is still read whole", () => {
    // Every one of these instructions wraps in the real document, so matching
    // line by line would miss almost all of them.
    const v = checkPromptShapes(boundaryOnEvent);
    expect(v[0].detail, "the host name was rejoined across the line break")
      .toMatch(/Intermediate message catch event/i);
  });
});
