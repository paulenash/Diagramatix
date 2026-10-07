/**
 * T5283 — "Check before you Plan" (Paul, 2026-10-07: use the BPMN prompt skill's approach inside Diagramatix, starting with its self-check).
 * The three deterministic prompt checkers run on whatever is typed into the AI Generate console, before the Plan call, in plain English.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkPromptReadiness, isHousePrompt } from "@/app/lib/valueChain/promptReadiness";

const HEAD = 'BPMN: Approval — a request is approved or rejected.\n\n';
const boundaryOnEvent = `${HEAD}5. Edge-mounted (boundary) events

Interrupting timer boundary event on "Intermediate message catch event
  Approval decision received" — label "Escalation response overdue" —
  triggers User task "Chase delegated approver".
`;
const vagueBranches = `${HEAD}Contract lane:
  Exclusive gateway "Signed?"
  - branch "Complete": continue to next task
  - branch "Incomplete": continue to the Finance lane
`;
const clean = `${HEAD}Goods Receipt lane:
  Exclusive gateway "Discrepancy type?"
  - branch "Quantity discrepancy": User task "Prepare quantity discrepancy notice"
  - branch "Quality or damage discrepancy": User task "Prepare quality discrepancy notice"
  Exclusive merge gateway "Discrepancy type"
  Service task "Log discrepancy record"
`;

describe("T5283 prompt readiness", () => {
  it("only a house-format prompt (opening 'BPMN:') is judged; free text says nothing", () => {
    expect(isHousePrompt(boundaryOnEvent)).toBe(true);
    expect(isHousePrompt("A customer places an order. The warehouse checks stock.")).toBe(false);
    expect(checkPromptReadiness("A customer places an order. If in stock it ships and")).toEqual([]);
  });
  it("a boundary event on a non-activity is reported with its line and a plain sentence", () => {
    const r = checkPromptReadiness(boundaryOnEvent);
    expect(r.some((i) => i.code === "boundary-on-non-activity" && i.line && /^Line \d+:/.test(i.message))).toBe(true);
  });
  it("branches that name no destination are reported, one per gateway, with the way to fix it", () => {
    const r = checkPromptReadiness(vagueBranches).filter((i) => i.code === "branch-without-destination");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].message).toMatch(/Signed\?/);
    expect(r[0].message).toMatch(/End event/);
  });
  it("a cut-off prompt is reported (no line)", () => {
    const r = checkPromptReadiness(`${HEAD}Customer lane:\n  User task "Place the order" then "Wait for the`);
    expect(r.some((i) => i.code === "looks-cut-off" && i.line === undefined)).toBe(true);
  });
  it("a clean prompt has no findings", () => {
    expect(checkPromptReadiness(clean)).toEqual([]);
  });
  it("findings come back in line order", () => {
    const lines = checkPromptReadiness(`${boundaryOnEvent}\n${vagueBranches}`).map((i) => i.line ?? Infinity);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });
  it("the console shows it for BPMN only, under the prompt box, and a finding jumps to its line", () => {
    const panel = readFileSync("app/(dashboard)/diagram/[id]/ai-generate/PromptPanel.tsx", "utf8");
    expect(panel).toContain("{canRefine && <PromptCheck prompt={prompt} onJumpToLine={jumpToLine} />}");
    expect(panel).toContain("setSelectionRange");
    const comp = readFileSync("app/components/ai/PromptCheck.tsx", "utf8");
    expect(comp).toContain("checkPromptReadiness");
    expect(comp).toContain("onJumpToLine(i.line!)");
  });
});
