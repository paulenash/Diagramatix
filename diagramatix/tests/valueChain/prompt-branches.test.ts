/**
 * Every gateway in a repository prompt must say where its branches GO.
 *
 * The master template has always required it, but nothing checked, so the
 * catalogue drifted: 66 branches across 45 processes name no destination. Paul
 * hit the same ambiguity from the other side on 2026-09-01 reading a Technical
 * Description — "the Decisions are not terminated unambiguously" — and these
 * prompts are the INPUT to regeneration, so a branch that merely stops leaves
 * the model to invent the ending.
 *
 * The unit is the GATEWAY. The template puts the merge on its own line after
 * the branch group rather than repeating it in every branch, so a per-branch
 * reading condemns the house style — which is exactly the mistake the first
 * version of this checker made, reporting 57% where the true figure is 5%.
 */
import { describe, it, expect } from "vitest";
import { checkPromptBranches } from "@/app/lib/valueChain/checkPromptBranches";

const merged = `
Goods Receipt lane:
  Exclusive gateway "Discrepancy type?"
  - branch "Quantity discrepancy": User task "Prepare quantity discrepancy
    notice"
  - branch "Quality or damage discrepancy": User task "Prepare quality
    discrepancy notice"
  Exclusive merge gateway "Discrepancy type"
  Service task "Log discrepancy record"
`;

const selfTerminated = `
Approver lane:
  Exclusive gateway "Decision?"
  - branch "Approved": reach subprocess end
  - branch "Rejected": User task "Record rejection reason",
    followed by End event "Purchase rejected — ends abnormally"
  - branch "More information required": User task "Return package", loop continues
`;

const vague = `
Contract lane:
  Exclusive gateway "Signed?"
  - branch "Complete": continue to next task
  - branch "Incomplete": continue to the Finance lane
`;

describe("a gateway states where its branches go", () => {
  it("T3126 — a merge line after the group resolves every branch under it", () => {
    // The house style. Judging branches one by one flags all of these, which is
    // how a checker ends up reporting eleven times the real defect rate.
    expect(checkPromptBranches(merged)).toEqual([]);
  });

  it("T3127 — a branch may instead state its own fate, in any of the usual words", () => {
    expect(checkPromptBranches(selfTerminated)).toEqual([]);
  });

  it("T3128 — a destination that names no ELEMENT is refused", () => {
    // "continue to next task" and "continue to the Finance lane" read as though
    // something follows while naming nothing that can be drawn.
    const issues = checkPromptBranches(vague);
    expect(issues.map((i) => i.condition).sort()).toEqual(["Complete", "Incomplete"]);
    expect(issues[0].gateway).toBe("Signed?");
  });

  it("T3129 — each offending group is reported ONCE, not once per branch", () => {
    // A branch's body is indented deeper than it, so a naive "is the previous
    // line a branch?" test finds a body line and treats every branch as the
    // start of a new group, reporting the same group repeatedly.
    const issues = checkPromptBranches(vague);
    expect(issues.length).toBe(2);
    expect(new Set(issues.map((i) => i.line)).size).toBe(2);
  });

  it("T3130 — a nested branch's ending does not vouch for a parent that CARRIES ON", () => {
    // The invariant: inner End events close the inner paths, not the outer
    // branch, when the outer branch still has steps after the nested group and
    // never says where they lead.
    const nested = `
  Exclusive gateway "Outer?"
  - branch "A":
    Exclusive gateway "Inner?"
    - branch "X": End event "Done"
    - branch "Y": End event "Also done"
    User task "Then carry on"
  - branch "B": End event "Finished"
`;
    expect(checkPromptBranches(nested).map((i) => i.condition)).toEqual(["A"]);
  });

  it("T3145 — a branch whose every nested path ENDS is itself closed", () => {
    // V23.07 "Yes — hardship eligible" is three levels of gateway with an End
    // event on every leaf and nothing after them. It has no continuation left
    // to state, and demanding one reported four phantom defects.
    const allEnd = `
  Exclusive gateway "Outer?"
  - branch "A":
    User task "Assess it"
    Exclusive gateway "Inner?"
    - branch "X": End event "Done"
    - branch "Y": End event "Also done"
  - branch "B": End event "Finished"
`;
    expect(checkPromptBranches(allEnd)).toEqual([]);
  });

  it("T3146 — a lone surviving branch continues the main line, unless it claims otherwise", () => {
    // V21.01 turns away an unreadable application and carries the readable one
    // straight on: there is nothing to join, so no merge is owed.
    const survivor = `
  Exclusive gateway "Readable?"
  - branch "No": Send task "Request resubmission"
    End event "Returned for resubmission"
  - branch "Yes": User task "Assign reference number"
  Service task "Record the application"
`;
    expect(checkPromptBranches(survivor)).toEqual([]);

    // But V16.06 DOES claim a destination and names a lane, not an element.
    // A sibling ending must not wave that through — it is the whole point.
    const laneClaim = survivor.replace(
      '- branch "Yes": User task "Assign reference number"',
      '- branch "Yes": (continues to Legal lane via sequence flow)');
    expect(checkPromptBranches(laneClaim).map((i) => i.condition)).toEqual(["Yes"]);
  });
});
