import { describe, it, expect } from "vitest";
import { chainStaleness, diagramFreshness } from "@/app/lib/valueChain/staleness";
import { processCodeForDiagram } from "@/app/lib/valueChain/diagramSource";
import { latestTemplateVersion } from "@/app/lib/valueChain/promptTemplates";

/**
 * Three artefacts, each generated from the one before it, and until now none of
 * them said when the one above had moved:
 *
 *     master prompt template  →  value-chain prompt  →  generated diagram
 *
 * The cost was paid twice. Paul regenerated V22 and got the same thirteen
 * diagnostics because the prompts predated the fix. And V22.04 and V22.06 turned
 * out to be unmeasurable — generated minutes before plan storage shipped —
 * which was only discoverable by comparing a file's timestamp in Downloads
 * against a deploy log.
 *
 * Paul, 2026-09-06: "Can we mark Value Chains that have not had their prompts
 * regenerated since a Master Prompt change… be more specific about which Diagram
 * are in need of new Prompts" and "any existing diagram that was regenerated
 * before the prompt regeneration timestamp must also have a message added in the
 * diagram properties panel."
 */

const OLD = "2020-01-01T00:00:00.000Z";
const FUTURE = "2099-01-01T00:00:00.000Z";
const PROCS = [
  { code: "V22.01", title: "Receive Notification" },
  { code: "V22.04", title: "Triage & Assign" },
  { code: "V22.06", title: "Investigate Where Warranted" },
];

describe("chain staleness — which diagrams need new prompts", () => {
  it("T3252 names the stale processes rather than counting them", () => {
    const st = chainStaleness(PROCS, [
      { type: "bpmn", processCode: "V22.01", generatedAt: FUTURE },
      { type: "bpmn", processCode: "V22.04", generatedAt: OLD },
      { type: "bpmn", processCode: "V22.06", generatedAt: OLD },
    ]);
    // The names are the point: "2 prompts are stale" is a number nobody can act
    // on one diagram at a time, which is what Paul asked for.
    expect(st.stale.map((p) => p.code)).toEqual(["V22.04", "V22.06"]);
    expect(st.stale[0].title).toBe("Triage & Assign");
    expect(st.missing).toEqual([]);
    expect(st.count).toBe(2);
  });

  it("T3253 a process with no prompt at all is MISSING, not stale", () => {
    // Different fault, same remedy — but reporting "stale" for a prompt that was
    // never written would send someone looking for a regeneration that never
    // happened.
    const st = chainStaleness(PROCS, [{ type: "bpmn", processCode: "V22.01", generatedAt: FUTURE }]);
    expect(st.missing.map((p) => p.code)).toEqual(["V22.04", "V22.06"]);
    expect(st.stale).toEqual([]);
    expect(st.count).toBe(2);
  });

  it("T3254 a chain-level prompt counts too, and is reported separately", () => {
    const st = chainStaleness(PROCS, [
      { type: "bpmn", processCode: "V22.01", generatedAt: FUTURE },
      { type: "bpmn", processCode: "V22.04", generatedAt: FUTURE },
      { type: "bpmn", processCode: "V22.06", generatedAt: FUTURE },
      { type: "value-chain", processCode: "", generatedAt: OLD },
    ]);
    expect(st.stale).toEqual([]);
    expect(st.staleChainPrompts).toEqual(["value-chain"]);
    expect(st.count).toBe(1);
  });

  it("T3255 a fully current chain reports nothing at all", () => {
    const st = chainStaleness(PROCS, PROCS.map((p) => ({
      type: "bpmn" as const, processCode: p.code, generatedAt: FUTURE,
    })));
    expect(st.count).toBe(0);
    // And it still says what version it judged against, so the badge can explain
    // itself without a second lookup.
    expect(st.currentVersion).toBe(latestTemplateVersion("bpmn").version);
  });
});

describe("diagram freshness — has my prompt moved on?", () => {
  it("T3256 a diagram older than its prompt's regeneration is warned about", () => {
    const notes = diagramFreshness({
      diagramGeneratedAt: "2026-09-04T08:46:00.000Z",
      promptRegeneratedAt: "2026-09-05T10:00:00.000Z",
      hasPlan: true,
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].level).toBe("warn");
    expect(notes[0].text).toContain("regenerated");
  });

  it("T3257 a diagram NEWER than its prompt says nothing", () => {
    // Silence is the right answer for the common case. A panel that always says
    // something is a panel people stop reading, and then the one that matters
    // goes unread too.
    expect(diagramFreshness({
      diagramGeneratedAt: "2026-09-05T10:00:00.000Z",
      promptRegeneratedAt: "2026-09-04T08:46:00.000Z",
      hasPlan: true,
    })).toEqual([]);
  });

  it("T3258 an older master template is a SEPARATE warning, because the remedy differs", () => {
    // Prompt moved → regenerate the diagram. Template moved → regenerate the
    // PROMPT first, then the diagram. Collapsing them would send someone
    // straight to a regeneration that reproduces the same defect, which is
    // exactly what happened to V22 twice.
    const notes = diagramFreshness({
      diagramGeneratedAt: "2026-09-05T10:00:00.000Z",
      promptRegeneratedAt: "2026-09-05T09:00:00.000Z",
      templateVersionAtGeneration: 5,
      currentTemplateVersion: 7,
      hasPlan: true,
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toContain("v5");
    expect(notes[0].text).toContain("v7");
  });

  it("T3259 a diagram with no stored plan says so, as info rather than a fault", () => {
    // This is the V22.04 / V22.06 case: nothing is WRONG with them, but they
    // cannot be replayed against a changed layout, so testing a fix on them
    // costs an AI call. Worth knowing, not worth alarming about.
    const notes = diagramFreshness({ diagramGeneratedAt: "2026-09-04T08:46:00.000Z", hasPlan: false });
    expect(notes).toHaveLength(1);
    expect(notes[0].level).toBe("info");
    expect(notes[0].text).toContain("cannot be re-laid-out offline");
  });

  it("T3260 a diagram that was never generated from a repository prompt says nothing", () => {
    expect(diagramFreshness({ diagramGeneratedAt: "2026-09-05T10:00:00.000Z", hasPlan: true })).toEqual([]);
  });
});

describe("linking a diagram back to its repository process", () => {
  it("T3261 reads the process code off the diagram's name, including a duplicate suffix", () => {
    // Every repository diagram is named after its prompt, and the batch runner
    // appends " (2)" for a duplicate. That leading code is the only link back
    // for the diagrams generated BEFORE the source stamp existed — which is
    // most of them, and the whole population Paul is asking about.
    expect(processCodeForDiagram("V22.06 Investigate Where Warranted")).toBe("V22.06");
    expect(processCodeForDiagram("V22.05 Assess Loss & Quantum (2)")).toBe("V22.05");
  });

  it("T3262 refuses to match anything that is not exactly a repository code", () => {
    // A wrong match puts "your prompt has moved on" on an unrelated diagram,
    // which is worse than saying nothing — so the pattern is strict and anchored.
    for (const n of ["V2 draft", "Draft V22.06", "V22.6 something", "V226 x", "", null, undefined]) {
      expect(processCodeForDiagram(n), String(n)).toBe("");
    }
  });
});

/**
 * THE ROUND TRIP. Paul, 2026-09-06: "I regenerated prompts for V22 and published
 * BUT red messages remained. Check the round trip behaviour of these warning
 * messages everywhere."
 *
 * A warning that will not clear is worse than no warning: it teaches the reader
 * that the colour means nothing. Every message here must go away when the thing
 * it complains about is actually fixed — so each case below flags, then fixes,
 * then asserts silence.
 */
describe("round trip — every warning clears when the fault is fixed", () => {
  const shipped = new Date(latestTemplateVersion("bpmn").shippedAt).getTime();
  const before = new Date(shipped - 60_000).toISOString();
  const after = new Date(shipped + 60_000).toISOString();

  it("T3269 regenerating a chain's prompts clears the chain badge and the named list", () => {
    const staleRun = chainStaleness(PROCS, PROCS.map((p) => ({
      type: "bpmn" as const, processCode: p.code, generatedAt: before,
    })));
    expect(staleRun.count).toBe(PROCS.length);

    // The regeneration: same prompts, new timestamps. Nothing else changes.
    const afterRun = chainStaleness(PROCS, PROCS.map((p) => ({
      type: "bpmn" as const, processCode: p.code, generatedAt: after,
    })));
    expect(afterRun.count).toBe(0);
    expect(afterRun.stale).toEqual([]);
    expect(afterRun.missing).toEqual([]);
    expect(afterRun.staleChainPrompts).toEqual([]);
  });

  it("T3270 a prompt written one minute after the change is current, one minute before is not", () => {
    // The boundary, stated once. This is where the original bug lived: the
    // cut-off was the END of the day rather than the instant, so an entire
    // local morning's work landed on the wrong side of it.
    const one = (generatedAt: string) => chainStaleness(
      [PROCS[0]], [{ type: "bpmn" as const, processCode: PROCS[0].code, generatedAt }],
    ).count;
    expect(one(before)).toBe(1);
    expect(one(after)).toBe(0);
  });

  it("T3271 regenerating the DIAGRAM clears the prompt-moved warning", () => {
    const promptAt = "2026-09-06T00:00:00.000Z";
    expect(diagramFreshness({
      diagramGeneratedAt: "2026-09-04T00:00:00.000Z", promptRegeneratedAt: promptAt, hasPlan: true,
    })).toHaveLength(1);
    // Regenerated after the prompt moved — the warning has nothing left to say.
    expect(diagramFreshness({
      diagramGeneratedAt: "2026-09-06T00:00:01.000Z", promptRegeneratedAt: promptAt, hasPlan: true,
    })).toEqual([]);
  });

  it("T3272 regenerating the PROMPT first, then the diagram, clears both warnings", () => {
    // The two-step remedy the messages describe. Doing only the second step
    // leaves the template warning standing, which is the point of separating
    // them — and is what cost Paul two V22 passes.
    const halfWay = diagramFreshness({
      diagramGeneratedAt: "2026-09-06T00:00:01.000Z",
      promptRegeneratedAt: "2026-09-06T00:00:00.000Z",
      templateVersionAtGeneration: 5, currentTemplateVersion: 7, hasPlan: true,
    });
    expect(halfWay).toHaveLength(1);
    expect(halfWay[0].text).toContain("v5");

    expect(diagramFreshness({
      diagramGeneratedAt: "2026-09-06T00:00:01.000Z",
      promptRegeneratedAt: "2026-09-06T00:00:00.000Z",
      templateVersionAtGeneration: 7, currentTemplateVersion: 7, hasPlan: true,
    })).toEqual([]);
  });

  it("T3273 regenerating stores a plan, which clears the not-replayable note", () => {
    expect(diagramFreshness({ diagramGeneratedAt: "2026-09-04T00:00:00.000Z", hasPlan: false })).toHaveLength(1);
    expect(diagramFreshness({ diagramGeneratedAt: "2026-09-04T00:00:00.000Z", hasPlan: true })).toEqual([]);
  });

  it("T3274 an unknown template version says nothing rather than claiming v0", () => {
    // A prompt with no date has no knowable version. "Generated from master
    // template v0" is worse than silence, and the prompt-level badge already
    // flags an undated prompt.
    expect(diagramFreshness({
      diagramGeneratedAt: "2026-09-06T00:00:00.000Z",
      templateVersionAtGeneration: 0, currentTemplateVersion: 7, hasPlan: true,
    })).toEqual([]);
  });
});
