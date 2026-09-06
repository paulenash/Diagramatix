import { describe, it, expect } from "vitest";
import { renderLibraryMd, parseLibraryFromMd, type ImportedChain } from "@/app/lib/valueChain/library";
import { renderProvenance, parseProvenance } from "@/app/lib/valueChain/promptTemplates";

/**
 * The library through a file and back.
 *
 * Paul, 2026-09-06, having regenerated the whole Process Repository on prod:
 * "I plan to export it as a .md file and import it into the local db."
 *
 * That round trip used to LOSE which model wrote each prompt and when — and the
 * importer then stamped `generatedAt = now`, which is worse than losing it. A
 * prompt written to an old template came back looking freshly current, and every
 * staleness warning that exists to catch exactly that went quiet. A file is a
 * copy of the library, not a laundering of it.
 *
 * So provenance rides in an HTML comment between the label and the fence, where
 * markdown readers ignore it and the prompt text is untouched.
 */
const CHAIN: ImportedChain = {
  code: "V22", title: "Claims", groupName: "Operate", sortOrder: 0,
  narrative: "The claims value chain, end to end.\n\nIt runs from notification to closure.",
  processes: [
    { code: "V22.01", title: "Receive Notification", sortOrder: 0 },
    { code: "V22.02", title: "Triage", sortOrder: 1 },
  ],
  prompts: [
    {
      type: "value-chain", processCode: "", name: "V22 Claims — Value Chain",
      prompt: "Draw the claims value chain.",
      model: "claude-opus-5", generatedAt: "2026-09-06T02:11:00.000Z",
    },
    {
      type: "bpmn", processCode: "V22.01", name: "V22.01 Receive Notification",
      prompt: "Draw the notification process.\n\nWith a second paragraph.",
      model: "claude-opus-5", generatedAt: "2026-09-06T02:12:00.000Z",
    },
    {
      // The honest unknown: a prompt nobody can attribute.
      type: "bpmn", processCode: "V22.02", name: "V22.02 Triage",
      prompt: "Draw the triage process.",
      model: null, generatedAt: null,
    },
  ],
};

describe("provenance survives the .md round trip", () => {
  const md = renderLibraryMd([CHAIN]);
  const back = parseLibraryFromMd(md);

  it("T3275 the model and the date come back exactly as they went in", () => {
    const p = back[0].prompts.find((x) => x.processCode === "V22.01")!;
    expect(p.model).toBe("claude-opus-5");
    expect(p.generatedAt).toBe("2026-09-06T02:12:00.000Z");
    const chainLevel = back[0].prompts.find((x) => x.type === "value-chain")!;
    expect(chainLevel.model).toBe("claude-opus-5");
    expect(chainLevel.generatedAt).toBe("2026-09-06T02:11:00.000Z");
  });

  it("T3276 an unattributed prompt stays unattributed — it is not given a default", () => {
    // The whole point. Inventing a date here is what made an old prompt look
    // freshly current, and a null date reads as stale, which errs towards
    // regenerating — the safe direction.
    const p = back[0].prompts.find((x) => x.processCode === "V22.02")!;
    expect(p.model).toBeNull();
    expect(p.generatedAt).toBeNull();
  });

  it("T3277 the prompt TEXT is untouched by carrying provenance", () => {
    // A comment that leaked into the prompt would be sent to the model on the
    // next generation, which is the one thing this must never do.
    for (const src of CHAIN.prompts) {
      const p = back[0].prompts.find((x) => x.type === src.type && x.processCode === src.processCode)!;
      expect(p.prompt).toBe(src.prompt);
      expect(p.prompt).not.toContain("diagramatix:");
    }
  });

  it("T3278 the chain, its processes and its names survive alongside", () => {
    expect(back).toHaveLength(1);
    expect(back[0].code).toBe("V22");
    expect(back[0].processes.map((p) => p.code)).toEqual(["V22.01", "V22.02"]);
    expect(back[0].prompts).toHaveLength(3);
  });

  it("T3279 a file written BEFORE provenance existed still imports, as unknown", () => {
    // Every .md already in the repo and in Paul's Downloads is one of these.
    // They must keep working, and must not acquire a fabricated history.
    const legacy = md.replace(/<!-- diagramatix:[^>]*-->\n?/g, "");
    expect(legacy).not.toContain("diagramatix:");
    const old = parseLibraryFromMd(legacy);
    expect(old[0].prompts).toHaveLength(3);
    for (const p of old[0].prompts) {
      expect(p.model).toBeNull();
      expect(p.generatedAt).toBeNull();
    }
  });

  it("T3280 a malformed provenance comment reads as unknown, never as a default", () => {
    expect(parseProvenance(null)).toEqual({ model: null, generatedAt: null });
    expect(parseProvenance("model=; generated=not-a-date")).toEqual({ model: null, generatedAt: null });
    expect(parseProvenance("generated=2026-09-06T02:12:00.000Z"))
      .toEqual({ model: null, generatedAt: "2026-09-06T02:12:00.000Z" });
  });

  it("T3281 nothing is written when there is nothing to say", () => {
    // An empty comment would be noise in every .md for no gain.
    expect(renderProvenance({})).toBe("");
    expect(renderProvenance({ model: null, generatedAt: null })).toBe("");
    expect(renderProvenance({ model: "claude-opus-5" })).toBe("<!-- diagramatix: model=claude-opus-5 -->");
  });
});

/**
 * The whole library through a file and back — the shape that matters when an
 * environment is moved.
 *
 * Paul, 2026-09-06: "How do I transfer the whole Process Repository from prod to
 * local. Intact and not requiring re generation…"
 *
 * Measuring the answer found the export doubling every process. A chain's
 * narrative already carries its own `### V01.03 — …` headings — that is where a
 * process's write-up lives — and the renderer emitted a second set underneath,
 * so 277 processes came back as 554 with the prompts hanging off the copies.
 * Nothing had ever measured DATABASE → md → back; the existing test measures
 * FILE → parse, which cannot see this.
 */
describe("the whole library survives export and re-import", () => {
  const LIB: ImportedChain[] = [{
    code: "V01", title: "Order to Cash", groupName: "Operate", sortOrder: 0,
    // A narrative in the real shape: chain intro, then a section per process.
    narrative: [
      "The order-to-cash chain, end to end.",
      "",
      "### V01.01 — Receive Order",
      "",
      "How an order arrives.",
      "",
      "### V01.02 — Check Credit",
      "",
      "How credit is checked.",
    ].join("\n"),
    processes: [
      { code: "V01.01", title: "Receive Order", sortOrder: 0 },
      { code: "V01.02", title: "Check Credit", sortOrder: 1 },
    ],
    prompts: [
      { type: "value-chain", processCode: "", name: "V01 Order to Cash — Value Chain", prompt: "Draw the chain.", model: "claude-opus-5", generatedAt: "2026-09-06T02:00:00.000Z" },
      { type: "bpmn", processCode: "V01.01", name: "V01.01 Receive Order", prompt: "Draw receiving.", model: "claude-opus-5", generatedAt: "2026-09-06T02:01:00.000Z" },
      { type: "bpmn", processCode: "V01.02", name: "V01.02 Check Credit", prompt: "Draw the credit check.", model: "claude-opus-5", generatedAt: "2026-09-06T02:02:00.000Z" },
    ],
  }];

  const back = parseLibraryFromMd(renderLibraryMd(LIB));

  it("T3297 processes are not duplicated by the headings the narrative already has", () => {
    // The defect: 2 processes came back as 4.
    expect(back[0].processes.map((p) => p.code)).toEqual(["V01.01", "V01.02"]);
  });

  it("T3298 every prompt comes back attached to the right process", () => {
    expect(back[0].prompts).toHaveLength(3);
    for (const src of LIB[0].prompts) {
      const got = back[0].prompts.find((p) => p.type === src.type && p.processCode === src.processCode)!;
      expect(got, `${src.type} ${src.processCode}`).toBeTruthy();
      expect(got.prompt.trim()).toBe(src.prompt.trim());
      expect(got.model).toBe(src.model);
      expect(got.generatedAt).toBe(src.generatedAt);
    }
  });

  it("T3299 the per-process write-up in the narrative is kept, not thrown away", () => {
    // The prompts are spliced INTO the narrative, so each process's own prose
    // stays under its own heading where a reader expects it.
    expect(back[0].narrative).toContain("How an order arrives.");
    expect(back[0].narrative).toContain("How credit is checked.");
  });

  it("T3300 a process the narrative never mentions is still carried", () => {
    // Added in the library after the narrative was written. Better in the wrong
    // place than silently dropped.
    const extra: ImportedChain[] = [{
      ...LIB[0],
      processes: [...LIB[0].processes, { code: "V01.03", title: "Ship Goods", sortOrder: 2 }],
      prompts: [...LIB[0].prompts, {
        type: "bpmn" as const, processCode: "V01.03", name: "V01.03 Ship Goods",
        prompt: "Draw shipping.", model: null, generatedAt: null,
      }],
    }];
    const r = parseLibraryFromMd(renderLibraryMd(extra));
    expect(r[0].processes.map((p) => p.code)).toEqual(["V01.01", "V01.02", "V01.03"]);
    expect(r[0].prompts.find((p) => p.processCode === "V01.03")?.prompt.trim()).toBe("Draw shipping.");
  });
});
