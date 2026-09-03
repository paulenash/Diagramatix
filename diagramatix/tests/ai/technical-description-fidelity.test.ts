/**
 * What a Technical Description must carry if it is to be a PROMPT.
 *
 * Paul, 2026-09-04, ran the round trip on V22.07 — diagram → Technical
 * Description → regenerate → diff — and the structure came back perfect: same
 * 17 activities, same 7 message flows, same lanes, pools, systems and data
 * objects. The only delta was five user tasks arriving back as SERVICE tasks,
 * which the diff tool then narrated as an automation programme:
 *
 *   "the retrieval, limit-checking and record-keeping clerical spine ... has
 *    been automated end-to-end on both branches"
 *
 * Nothing had been automated. The description never stated the task marker, so
 * the regeneration re-inferred it from the wording and inferred it the same way
 * every time: anything phrased as touching a system became a service task. That
 * is silent semantic loss wearing the clothes of a business decision, and it
 * matters beyond the picture — taskType drives simulation resourcing and FTE,
 * the Task Mining automation score, and SOP generation, all of which move in the
 * direction that flatters automation.
 *
 * Reading the description itself found three more faults the diff could not
 * show, because each produces text a regeneration merely has to GUESS at rather
 * than a difference it can report. They are pinned here together: this file is
 * the answer to "is the Technical Description lossless enough to be the stored
 * prompt?", and every one of these was found by looking at real output.
 */
import { describe, it, expect } from "vitest";
import { buildBpmnPrompt } from "@/app/lib/diagram/prompt-from-diagram";
import type { DiagramElement, Connector } from "@/app/lib/diagram/types";

let n = 0;
const el = (over: Partial<DiagramElement> & { id: string; type: string }): DiagramElement =>
  ({ x: 100 * ++n, y: 100, width: 120, height: 60, label: "", ...over } as unknown as DiagramElement);
const c = (sourceId: string, targetId: string, type = "sequence"): Connector =>
  ({ id: `c${++n}`, sourceId, targetId, type } as unknown as Connector);

/** A pool, two lanes, and one task of each marker we care about. */
function fixture(over: { taskType?: string; taskLabel?: string } = {}) {
  const elements: DiagramElement[] = [
    el({ id: "p", type: "pool", label: "Insurer" }),
    el({ id: "ln", type: "lane", label: "Claims Assessment", parentId: "p" }),
    el({ id: "s", type: "start-event", label: "Outcome received", parentId: "ln" }),
    el({
      id: "t1", type: "task", parentId: "ln",
      label: over.taskLabel ?? "Retrieve claim file",
      taskType: over.taskType ?? "user",
    }),
    el({ id: "e", type: "end-event", label: "Decided", parentId: "ln" }),
  ];
  const connectors: Connector[] = [c("s", "t1"), c("t1", "e")];
  return buildBpmnPrompt(elements, connectors);
}

describe("Technical Description — what must survive the round trip", () => {
  it("T3192 states the task marker, so a regeneration need not guess it", () => {
    expect(fixture({ taskType: "user" })).toMatch(/User task "Retrieve claim file"/);
    expect(fixture({ taskType: "service" })).toMatch(/Service task "Retrieve claim file"/);
    expect(fixture({ taskType: "send" })).toMatch(/Send task "Retrieve claim file"/);
  });

  it("T3193 calls an unmarked task a plain Task rather than saying nothing", () => {
    // "none" is a real marker meaning an undecorated box. Omitting the word
    // entirely is what let the model fill the silence with its own inference.
    expect(fixture({ taskType: "none" })).toMatch(/Task "Retrieve claim file"/);
  });

  it("T3194 flattens a wrapped label to one line", () => {
    // The canvas stores the break; trim() only removes the outer ones. Left in,
    // "from claims platform" lands at column 0 and reads as a new instruction.
    const out = fixture({ taskLabel: "Retrieve claim file,\nassessment and quantum\nfrom claims platform" });
    expect(out).toMatch(/Retrieve claim file, assessment and quantum from claims platform/);
    expect(out).not.toMatch(/\nassessment and quantum/);
  });

  it("T3195 says the SUBPROCESS ends, not the process, inside a subprocess", () => {
    const elements: DiagramElement[] = [
      el({ id: "p", type: "pool", label: "Insurer" }),
      el({ id: "ln", type: "lane", label: "Claims Management", parentId: "p" }),
      el({ id: "sp", type: "subprocess-expanded", label: "Repeat Until Approved", parentId: "ln" }),
      el({ id: "is", type: "start-event", label: "", parentId: "sp" }),
      el({ id: "it", type: "task", label: "Examine referral", taskType: "user", parentId: "sp" }),
      el({ id: "ie", type: "end-event", label: "", parentId: "sp" }),
      el({ id: "s", type: "start-event", label: "Referred", parentId: "ln" }),
      el({ id: "e", type: "end-event", label: "Decided", parentId: "ln" }),
    ];
    const out = buildBpmnPrompt(elements, [c("s", "sp"), c("sp", "e"), c("is", "it"), c("it", "ie")]);
    // Read literally, "the process ends" inside a loop told a regeneration to
    // terminate everything.
    expect(out).toMatch(/The subprocess ends here\./);
    // And an unnamed event no longer offers a placeholder as if it were a name:
    // a regeneration would invent a different one each time and never settle.
    expect(out).not.toMatch(/<unnamed/);
  });

  it("T3196 describes a repeated data artifact once, with all of its readers", () => {
    // A data object is deliberately duplicated beside a remote consumer to keep
    // the diagram readable. Listed twice, it asks for two artifacts of one name.
    const elements: DiagramElement[] = [
      el({ id: "p", type: "pool", label: "Insurer" }),
      el({ id: "ln", type: "lane", label: "Claims Assessment", parentId: "p" }),
      el({ id: "s", type: "start-event", label: "Received", parentId: "ln" }),
      el({ id: "t1", type: "task", label: "Review cover", taskType: "user", parentId: "ln" }),
      el({ id: "t2", type: "task", label: "Examine referral", taskType: "user", parentId: "ln" }),
      el({ id: "e", type: "end-event", label: "Decided", parentId: "ln" }),
      el({ id: "d1", type: "data-object", label: "Claim File", parentId: "ln" }),
      el({ id: "d2", type: "data-object", label: "Claim File", parentId: "ln" }),
    ];
    const out = buildBpmnPrompt(elements, [
      c("s", "t1"), c("t1", "t2"), c("t2", "e"),
      c("d1", "t1", "associationBPMN"), c("d2", "t2", "associationBPMN"),
    ]);
    const section = out.slice(out.indexOf("**Data objects and stores**"));
    const entries = section.split("\n").filter((l) => /^- Claim File \(data object\)/.test(l));
    expect(entries).toHaveLength(1);
    // Both consumers still named — de-duplicating must not lose a reader.
    expect(section).toMatch(/Review cover/);
    expect(section).toMatch(/Examine referral/);
  });
});
