import { describe, it, expect } from "vitest";
import { checkPromptBranches } from "@/app/lib/valueChain/checkPromptBranches";
import { DEFAULT_MD_PROMPT } from "@/app/lib/valueChain/promptTemplates";

/**
 * Auditing the master template for decision-termination and EMIE defects
 * (Paul, 2026-09-03) found four faults, two of which manufactured the exact
 * bugs he had been reporting from generated diagrams:
 *
 *  - The four accepted closing forms had no way to say "this branch flows on
 *    to the next task". A branch that did so was illegal, so the model closed
 *    it with an invented merge gateway that merged ONE branch -- a diamond
 *    that decides nothing. That is "Decisions, Decisions!!".
 *  - Section 4 said a wait is an event and never a task; section 5 said to
 *    model a wait with a deadline as a receive task. Reading 4 first and 5
 *    second yields a timer mounted on an intermediate catch event, which is
 *    the 'boundary-on-non-activity' shape that cannot be drawn.
 *
 * The checker tests come in accept/reject pairs on purpose: a terminator
 * pattern that accepts everything would pass a one-sided test while silently
 * retiring the check.
 */
describe("branch closing form -- continues to a named element", () => {
  const gateway = (branch: string) => [
    'Exclusive gateway "Claim valid?"',
    '  - branch "yes": ' + branch,
    '  - branch "no": End event "Claim rejected"',
  ].join("\n");

  it("T3179 accepts a branch that flows on to an element named with its type", () => {
    const issues = checkPromptBranches(gateway('(continues to User task "Assess claim")'));
    expect(issues).toEqual([]);
  });

  it("T3180 still reports a branch naming only a lane -- the case the check exists for", () => {
    const issues = checkPromptBranches(gateway("(continues to the Legal lane via sequence flow)"));
    expect(issues).toHaveLength(1);
    expect(issues[0].condition).toBe("yes");
  });

  it("T3181 accepts every activity noun the template offers, and no bare quoted name", () => {
    for (const form of [
      'Service task "Record in OMS"',
      'Expanded Subprocess "Do Until Approved"',
      'Exclusive gateway "Complete"',
      'Intermediate message catch event "Reply arrives"',
    ]) {
      expect(checkPromptBranches(gateway("(continues to " + form + ")"))).toEqual([]);
    }
    // A quoted name with no type word in front of it does not say what to draw.
    expect(checkPromptBranches(gateway('(continues to "Assess claim")'))).toHaveLength(1);
  });
});

/**
 * The template rules themselves. These are wording pins, which is unusual, but
 * each of these sentences is the sole thing standing between the generator and
 * a defect class that took a fortnight to trace back to its cause -- and the
 * failure mode of losing one is silent, appearing only as bad diagrams weeks
 * later.
 */
describe("BPMN master template -- rules that must not be dropped", () => {
  const t = DEFAULT_MD_PROMPT.bpmn;

  it("T3182 requires a merge only where two or more branches converge", () => {
    expect(t).toMatch(/TWO OR MORE branches actually come back/);
    expect(t).toMatch(/merges one thing/);
  });

  it("T3183 resolves the wait rule against the boundary-event rule", () => {
    // Section 4 forbids modelling a wait as a task; section 5 needs a task to
    // hang a timer on. Without the carve-out naming the receive task the two
    // instructions contradict, and the model obeys whichever it read last.
    expect(t).toMatch(/ONE EXCEPTION/);
    expect(t).toMatch(/a bare wait is an event, a wait that can time out/);
    expect(t).toMatch(/A BOUNDARY EVENT ATTACHES ONLY TO AN ACTIVITY/);
  });

  it("T3184 makes an exception path terminate the way a branch does", () => {
    expect(t).toMatch(/THE EXCEPTION PATH MUST SAY WHERE IT GOES/);
    expect(t).toMatch(/NEVER returns to the activity it/);
  });

  it("T3185 forbids a gateway whose branches all land in the same place", () => {
    expect(t).toMatch(/A GATEWAY MUST CHANGE WHERE THE WORK GOES/);
  });

  it("T3186 keeps the parallel join mandatory despite the merge rule above it", () => {
    // The "merge only where branches converge" rule is the EXCLUSIVE case. A
    // parallel split must ALWAYS be joined -- every branch runs, and without
    // the join the tokens never reconvene and the process cannot complete.
    // Applying the exclusive rule to a parallel split is a live hazard, so the
    // template has to name the distinction rather than leave it inferred.
    expect(t).toMatch(/MUST be\s+closed by a matching Parallel merge gateway/);
    expect(t).toMatch(/not subject to the rule above/);
    expect(t).toMatch(/Inclusive merge gateway/);
  });

  it("T3187 offers no non-interrupting flavour the layout engine would override", () => {
    // bpmnLayout.ts forces every boundaryHostId event to interrupting (Paul,
    // 2026-08-27). A template that invites the other flavour asks for something
    // silently rewritten, which is worse than not offering it.
    expect(t).toMatch(/EVERY EDGE-MOUNTED EVENT IS INTERRUPTING/);
    expect(t).not.toMatch(/interrupting or non-interrupting/);
  });
});
