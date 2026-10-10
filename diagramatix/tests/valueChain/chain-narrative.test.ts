/**
 * T5300 — "Create a New Value Chain", slice 2 (Paul, 2026-10-10): the sixth master template (Value Chain Narrative) and the two AI calls
 * that come before a chain exists — suggesting 5-12 processes and building the structured narrative. A fake model stands in for the AI.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CHAIN_NARRATIVE_CATEGORY, CHAIN_NARRATIVE_HISTORY, DEFAULT_CHAIN_NARRATIVE_BRIEFING, MAX_PROCESSES, MIN_PROCESSES, NARRATIVE_LABELS,
  buildChainNarrativeBriefing, chainNarrativeUserMessage, latestChainNarrativeVersion, normaliseBrief, parseProcessSuggestions,
  rewriteChainCode, validateBuiltNarrative, type BriefInput,
} from "@/app/lib/valueChain/chainNarrative";
import { buildChainNarrative, suggestProcesses, stripNarrativeFence, NARRATIVE_TOKEN_LIMITS, type Complete } from "@/app/lib/valueChain/chainNarrativeAi";
import { BUILTIN_BY_CATEGORY } from "@/app/lib/ai/builtinRuleCategories";
import { MD_PROMPT_TYPES } from "@/app/lib/valueChain/promptTemplates";

const procs = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Process Number ${i + 1}`, details: `Details of ${i + 1}.` }));
const brief = (n = 6): BriefInput => ({ title: "Customer Onboarding", generalNarrative: "Sales captures a new customer, checks identity and credit, sets up accounts and welcomes them.", processes: procs(n) });

/** A narrative that satisfies the contract for `code` and `b`. */
function goodNarrative(code: string, b: BriefInput): string {
  const rows = b.processes.map((p, i) => `| ${code}.${String(i + 1).padStart(2, "0")} ${p.title} | Customer | Sales (officer) | CRM |`).join("\n");
  const subs = b.processes.map((p, i) => `### ${code}.${String(i + 1).padStart(2, "0")} — ${p.title}\nThe officer does it. (assumed)`).join("\n\n");
  return [
    `## ${code} — ${b.title}`, "",
    NARRATIVE_LABELS[0], "Sales and Operations.", "",
    NARRATIVE_LABELS[1], "The customer.", "",
    NARRATIVE_LABELS[2], b.processes.map((p) => p.title).join(", ") + ".", "",
    NARRATIVE_LABELS[3], "CRM.", "",
    NARRATIVE_LABELS[4], "Onboarding policy.", "",
    NARRATIVE_LABELS[5], "Forms and confirmations.", "",
    NARRATIVE_LABELS[6], "Customer records.", "",
    NARRATIVE_LABELS[7], "Each row matches the pools...", "",
    "| Process | External Actors | Teams (key role) | IT Systems |", "| --- | --- | --- | --- |", rows, "",
    `${NARRATIVE_LABELS[8]} (every distinct participant across ${code}):`, "- Customer", "",
    subs, "",
  ].join("\n");
}

describe("T5300 the sixth master template", () => {
  it("is a read-only built-in plus editable additions, registered beside the other five but NOT one of the five prompt kinds", () => {
    const rule = BUILTIN_BY_CATEGORY[CHAIN_NARRATIVE_CATEGORY];
    expect(rule).toBeDefined();
    expect(rule.builtin).toBe(DEFAULT_CHAIN_NARRATIVE_BRIEFING);
    expect(rule.extractAdditions("  house rule  ")).toBe("house rule");
    expect(MD_PROMPT_TYPES as string[]).not.toContain("chain-narrative");        // it must not join the staleness machinery
    expect(CHAIN_NARRATIVE_CATEGORY).toBe("md-prompt-chain-narrative");
  });
  it("is offered in the rules editor and its list", () => {
    expect(readFileSync("app/api/bpmn-rules/route.ts", "utf8")).toContain("CHAIN_NARRATIVE_CATEGORY");
    const editor = readFileSync("app/(dashboard)/dashboard/rules/RulesEditor.tsx", "utf8");
    expect(editor).toContain('"md-prompt-chain-narrative": "Repository Prompt — Value Chain Narrative"');
  });
  it("has a history shaped like the other templates', and the newest entry is the version in force", () => {
    for (const v of CHAIN_NARRATIVE_HISTORY) {
      expect(v.version).toBeGreaterThan(0);
      expect(v.description.trim().length).toBeGreaterThan(20);
      expect(v.commit).toMatch(/^[0-9a-f]{7,}$/);
      expect(v.shippedAt.slice(0, 10)).toBe(v.at);
    }
    expect(CHAIN_NARRATIVE_HISTORY.map((v) => v.version)).toEqual(CHAIN_NARRATIVE_HISTORY.map((_, i) => i + 1));   // 1,2,3… append-only, no gaps
    expect(latestChainNarrativeVersion()).toBe(CHAIN_NARRATIVE_HISTORY[CHAIN_NARRATIVE_HISTORY.length - 1]);
  });
  it("tells the model all nine parts, in order, and bans invention", () => {
    for (const l of NARRATIVE_LABELS) expect(DEFAULT_CHAIN_NARRATIVE_BRIEFING).toContain(l);
    expect(DEFAULT_CHAIN_NARRATIVE_BRIEFING).toMatch(/Do NOT invent/);
    expect(DEFAULT_CHAIN_NARRATIVE_BRIEFING).toContain("(assumed)");
    expect(buildChainNarrativeBriefing("Use British spelling.")).toContain("## Additional Rules — house conventions\nUse British spelling.");
    expect(buildChainNarrativeBriefing("")).toBe(DEFAULT_CHAIN_NARRATIVE_BRIEFING);
  });
});

describe("T5300 what the author types is bounded", () => {
  it("accepts 5 to 12 processes and refuses 4 and 13", () => {
    expect(normaliseBrief(brief(MIN_PROCESSES)).problems).toEqual([]);
    expect(normaliseBrief(brief(MAX_PROCESSES)).problems).toEqual([]);
    expect(normaliseBrief(brief(4)).problems.join(" ")).toMatch(/at least 5/);
    expect(normaliseBrief(brief(13)).problems.join(" ")).toMatch(/at most 12/);
  });
  it("needs a name, a real description, and distinct named processes", () => {
    const b = brief();
    expect(normaliseBrief({ ...b, title: " " }).problems.join(" ")).toMatch(/name/i);
    expect(normaliseBrief({ ...b, generalNarrative: "too short" }).problems.join(" ")).toMatch(/few sentences/);
    const dup = { ...b, processes: [...b.processes.slice(0, 4), { title: "process number 1", details: "" }] };
    expect(normaliseBrief(dup).problems.join(" ")).toMatch(/Two processes are called/);
    const blank = { ...b, processes: [...b.processes.slice(0, 4), { title: "", details: "x" }] };
    expect(normaliseBrief(blank).problems.join(" ")).toMatch(/needs a name/);
  });
  it("trims and tidies whitespace", () => {
    const n = normaliseBrief({ ...brief(), title: "  Customer   Onboarding ", processes: brief().processes.map((p) => ({ ...p, title: `  ${p.title}  ` })) });
    expect(n.brief.title).toBe("Customer Onboarding");
    expect(n.brief.processes[0].title).toBe("Process Number 1");
  });
});

describe("T5300 the built narrative is held to the contract", () => {
  const b = brief();
  it("a correct narrative passes", () => expect(validateBuiltNarrative(goodNarrative("C01", b), "C01", b)).toEqual([]));
  it("reports a wrong heading, a missing part, a renamed process, a missing process and a missing matrix", () => {
    const g = goodNarrative("C01", b);
    expect(validateBuiltNarrative(g.replace("## C01 — Customer Onboarding", "## C01 — Something Else"), "C01", b).join(" ")).toMatch(/first line/);
    expect(validateBuiltNarrative(g.replace(NARRATIVE_LABELS[3], ""), "C01", b).join(" ")).toMatch(/Typical IT systems/);
    expect(validateBuiltNarrative(g.replace("— Process Number 2", "— Renamed"), "C01", b).join(" ")).toMatch(/Process subsection 2/);
    expect(validateBuiltNarrative(g.replace(/### C01\.06[\s\S]*$/, ""), "C01", b).join(" ")).toMatch(/exactly 6 process subsections \(found 5\)/);
    expect(validateBuiltNarrative(g.replace("| Process | External Actors |", "| X | Y |"), "C01", b).join(" ")).toMatch(/matrix/);
  });
  it("re-issues a narrative under the final chain code without touching other text", () => {
    const g = goodNarrative("C01", b);
    const r = rewriteChainCode(g, "C01", "C07");
    expect(validateBuiltNarrative(r, "C07", b)).toEqual([]);
    expect(r).not.toMatch(/\bC01\b/);
    expect(rewriteChainCode("C010 and C01.02 and C01", "C01", "C02")).toBe("C010 and C02.02 and C02");
    expect(rewriteChainCode(g, "C01", "C01")).toBe(g);
  });
  it("the request names every process by its final code and exact name", () => {
    const m = chainNarrativeUserMessage({ code: "C03", brief: b });
    expect(m).toContain("CHAIN CODE: C03");
    expect(m).toContain("C03.01 — Process Number 1");
    expect(m).toContain("C03.06 — Process Number 6");
    expect(m).toContain('beginning with the line "## C03 — Customer Onboarding"');
  });
});

describe("T5300 suggested processes", () => {
  const json = (titles: string[]) => JSON.stringify({ processes: titles.map((t) => ({ title: t, details: `About ${t}.` })) });
  it("reads fenced or wrapped JSON, strips codes, drops duplicates, clamps to 12", () => {
    const titles = Array.from({ length: 15 }, (_, i) => `Step ${String.fromCharCode(65 + i)} Work`);
    const out = parseProcessSuggestions("```json\n" + json(["C01.01 — Receive Order", ...titles, "step a work"]) + "\n```")!;
    expect(out).toHaveLength(MAX_PROCESSES);
    expect(out[0].title).toBe("Receive Order");
    expect(new Set(out.map((p) => p.title.toLowerCase())).size).toBe(out.length);
  });
  it("is null when fewer than 5 usable processes come back, or the text is not JSON", () => {
    expect(parseProcessSuggestions(json(["A one", "B two", "C three", "D four"]))).toBeNull();
    expect(parseProcessSuggestions("Here are some ideas")).toBeNull();
  });
  it("suggestProcesses never throws: a failing model gives null", async () => {
    const boom: Complete = async () => { throw new Error("down"); };
    expect(await suggestProcesses({ title: "X", generalNarrative: "y", complete: boom })).toBeNull();
    const ok: Complete = async () => ({ text: json(["A one", "B two", "C three", "D four", "E five"]), ranOut: false });
    expect(await suggestProcesses({ title: "X", generalNarrative: "y", complete: ok })).toHaveLength(5);
  });
});

describe("T5300 building the narrative", () => {
  const b = brief();
  it("returns a valid narrative with the template version and the house-rule hash it used", async () => {
    const complete: Complete = async () => ({ text: goodNarrative("C01", b), ranOut: false });
    const r = await buildChainNarrative({ code: "C01", brief: b, additions: "", complete });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.templateVersion).toBe(latestChainNarrativeVersion().version); expect(r.additionsHash).toMatch(/^[0-9a-f]{12}$/); }
  });
  it("sends the built-in plus the house rules as the system prompt", async () => {
    let system = "";
    const complete: Complete = async (a) => { system = a.system; return { text: goodNarrative("C01", b), ranOut: false }; };
    await buildChainNarrative({ code: "C01", brief: b, additions: "Say Org, not organisation.", complete });
    expect(system).toContain("Say Org, not organisation.");
  });
  it("gives a bad first answer one correction round that names what was wrong", async () => {
    const calls: string[] = [];
    const complete: Complete = async (a) => {
      calls.push(a.user);
      return { text: calls.length === 1 ? "## C01 — Wrong\n\nNo structure." : goodNarrative("C01", b), ranOut: false };
    };
    const r = await buildChainNarrative({ code: "C01", brief: b, additions: "", complete });
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("BROKE THE OUTPUT CONTRACT");
    expect(calls[1]).toContain("The first line must be exactly");
  });
  it("gives up honestly after the correction round fails too", async () => {
    const complete: Complete = async () => ({ text: "not a narrative", ranOut: false });
    const r = await buildChainNarrative({ code: "C01", brief: b, additions: "", complete });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/could not be built/);
  });
  it("retries with more room when the answer ran out of tokens", async () => {
    const limits: number[] = [];
    const complete: Complete = async (a) => { limits.push(a.maxTokens); return { text: goodNarrative("C01", b), ranOut: limits.length === 1 }; };
    const r = await buildChainNarrative({ code: "C01", brief: b, additions: "", complete });
    expect(r.ok).toBe(true);
    expect(limits).toEqual([NARRATIVE_TOKEN_LIMITS[0], NARRATIVE_TOKEN_LIMITS[1]]);
  });
  it("strips a code fence wrapped round the whole answer", () => {
    expect(stripNarrativeFence("```markdown\n## C01 — X\nbody\n```")).toBe("## C01 — X\nbody");
  });
});
