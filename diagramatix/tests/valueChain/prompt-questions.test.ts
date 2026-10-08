/**
 * T5287 — questions before a Process Repository process prompt is written (Paul, 2026-10-08: bring the Repository's prompt generation into
 * line with the prompt skill; up to 10 questions covering entity alignment, task detail and exception handling, plus whatever else the
 * process needs; the person can still use Refine Prompt afterwards). A fixed core list tailored by ONE small AI call; never dependent on it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CORE_QUESTIONS, ENTITY_ALIGN_LISTS, MAX_PROMPT_QUESTIONS, answersBlock, choosePromptQuestions, coreQuestionSet, mergeQuestions,
  parseTailoring, wantsEntityNames,
} from "@/app/lib/valueChain/promptQuestions";
import { buildUserMessage } from "@/app/lib/valueChain/generatePrompt";
import { formatEntityNames } from "@/app/lib/valueChain/entityNames";

const extra = (label: string) => ({ label, question: `${label}?`, type: "single" as const, options: ["a", "b"] });

describe("T5287 the core questions", () => {
  it("cover entity alignment, task detail and exception handling, and fit in ten", () => {
    const labels = CORE_QUESTIONS.map((q) => q.label);
    expect(labels).toEqual(expect.arrayContaining(["Entity alignment", "Task detail", "Exception handling"]));
    expect(CORE_QUESTIONS.length).toBeLessThanOrEqual(MAX_PROMPT_QUESTIONS);
    expect(new Set(CORE_QUESTIONS.map((q) => q.id)).size).toBe(CORE_QUESTIONS.length);
    for (const q of CORE_QUESTIONS) {
      expect(q.options.length, q.id).toBeGreaterThanOrEqual(2);
      expect(["single", "multi"]).toContain(q.type);
    }
  });
  it("the fixed set is what is asked when nothing tailors it", () => {
    const s = coreQuestionSet();
    expect(s.questions).toHaveLength(CORE_QUESTIONS.length);
    expect(s.source).toBe("core");
    expect(s.alreadyAnswered).toEqual([]);
  });
});

describe("T5287 tailoring", () => {
  it("parses a fenced reply with prose around it, drops unknown ids and malformed extras", () => {
    const t = parseTailoring('Here you go:\n```json\n{"resolved":[{"id":"task-detail","answer":"Detailed"},{"id":"nonsense","answer":"x"},{"id":"timing","answer":""}],"extra":[{"label":"Route","question":"Which?","type":"single","options":["a","b"]},{"label":"Bad","question":"?","type":"single","options":["only"]}]}\n```');
    expect(t.resolved).toEqual([{ id: "task-detail", answer: "Detailed" }]);
    expect(t.extra.map((q) => q.label)).toEqual(["Route"]);
  });
  it("rubbish gives nothing, never a throw", () => {
    expect(parseTailoring("not json at all")).toEqual({ resolved: [], extra: [] });
    expect(parseTailoring("")).toEqual({ resolved: [], extra: [] });
  });
  it("resolved core questions are struck and reported; extras are added; the total never exceeds ten", () => {
    const many = Array.from({ length: 12 }, (_, i) => extra(`Extra ${i}`));
    const s = mergeQuestions({ resolved: [{ id: "task-detail", answer: "Detailed" }], extra: many });
    expect(s.questions.length).toBe(MAX_PROMPT_QUESTIONS);
    expect(s.questions.some((q) => q.label === "Task detail")).toBe(false);
    expect(s.alreadyAnswered).toEqual([{ label: "Task detail", answer: "Detailed" }]);
    expect(s.source).toBe("ai");
  });
  it("an extra that repeats a core label is dropped", () => {
    const s = mergeQuestions({ resolved: [], extra: [extra("Task detail"), extra("Approval route")] });
    expect(s.questions.filter((q) => q.label === "Task detail")).toHaveLength(1);
    expect(s.questions.some((q) => q.label === "Approval route")).toBe(true);
  });
  it("the AI call tailors the list; a failing call falls back to the core list; an empty narrative makes no call", async () => {
    const ok = await choosePromptQuestions({
      apiKey: "k", processTitle: "V01.03 Check Credit", narrative: "Credit is checked.",
      complete: async () => JSON.stringify({ resolved: [{ id: "decisions", answer: "Only the main ones" }], extra: [extra("Credit bureau")] }),
    });
    expect(ok.source).toBe("ai");
    expect(ok.questions.some((q) => q.label === "Credit bureau")).toBe(true);
    expect(ok.questions.some((q) => q.label === "Decisions")).toBe(false);

    const failed = await choosePromptQuestions({ apiKey: "k", processTitle: "p", narrative: "n", complete: async () => { throw new Error("boom"); } });
    expect(failed.source).toBe("core");
    expect(failed.questions).toHaveLength(CORE_QUESTIONS.length);

    let called = false;
    const none = await choosePromptQuestions({ apiKey: "k", processTitle: "p", narrative: "   ", complete: async () => { called = true; return "{}"; } });
    expect(called).toBe(false);
    expect(none.source).toBe("core");
  });
});

describe("T5287 the answers reach the generator", () => {
  it("answersBlock leaves out skipped questions, and is empty when everything was skipped", () => {
    expect(answersBlock([{ label: "Task detail", answer: "Standard" }, { label: "Systems", answer: "  " }])).toMatch(/- Task detail: Standard/);
    expect(answersBlock([{ label: "Task detail", answer: "Standard" }, { label: "Systems", answer: "" }])).not.toMatch(/Systems/);
    expect(answersBlock([{ label: "x", answer: "" }])).toBe("");
  });
  it("only the entity-lists answer asks for the organisation's names", () => {
    expect(wantsEntityNames([{ label: "Entity alignment", answer: ENTITY_ALIGN_LISTS }])).toBe(true);
    expect(wantsEntityNames([{ label: "Entity alignment", answer: "Use generic role names only (no organisation-specific names)" }])).toBe(false);
    expect(wantsEntityNames([{ label: "Task detail", answer: ENTITY_ALIGN_LISTS }])).toBe(false);
  });
  it("buildUserMessage carries the answers and the entity names only when given, before the instruction", () => {
    const base = { chainCode: "V01", chainTitle: "Order", narrative: "N", subs: [], target: { type: "bpmn" as const, code: "V01.01", title: "Receive" } };
    const plain = buildUserMessage(base);
    expect(plain).not.toMatch(/AUTHOR'S ANSWERS|ORGANISATION'S OWN NAMES/);
    const full = buildUserMessage({ ...base, answers: answersBlock([{ label: "Task detail", answer: "Detailed" }]), entityNames: "- OrgStructure — Org: Finance" });
    expect(full).toMatch(/AUTHOR'S ANSWERS/);
    expect(full).toMatch(/ORGANISATION'S OWN NAMES/);
    expect(full.indexOf("AUTHOR'S ANSWERS")).toBeLessThan(full.indexOf("Write the BPMN diagram prompt"));
  });
  it("entity names are grouped by list, de-duplicated and capped", () => {
    const text = formatEntityNames([
      { name: "Org", kind: "OrgStructure", nodes: [{ name: "Finance", level: "OrgUnit" }, { name: "Finance", level: "Team" }, { name: "AP", level: "Team" }] },
      { name: "Apps", kind: "System", nodes: [{ name: "SAP", level: "System" }] },
    ]);
    expect(text.split("\n")).toEqual(["- OrgStructure — Org: Finance; AP", "- System — Apps: SAP"]);
    const huge = formatEntityNames([{ name: "L", kind: "Participant", nodes: Array.from({ length: 500 }, (_, i) => ({ name: `n${i}`, level: "Participant" })) }]);
    expect(huge.split(";").length).toBeLessThanOrEqual(200);
  });
});

describe("T5287 wiring", () => {
  it("the library route has a 'questions' action and gives the answers only to BPMN process prompts", () => {
    const route = readFileSync("app/api/admin/value-chain-library/route.ts", "utf8");
    expect(route).toContain('action === "questions"');
    expect(route).toContain("choosePromptQuestions");
    expect(route).toContain('...(target.type === "bpmn" ? { answers: answersText || undefined, entityNames: entityNames || undefined } : {})');
  });
  it("the .md upload tool asks first for BPMN prompts and gives the answers only to BPMN prompts", () => {
    const route = readFileSync("app/api/admin/md-prompts/route.ts", "utf8");
    expect(route).toContain('body?.action === "questions"');
    expect(route).toContain('...(target.type === "bpmn" ? { answers: answersText || undefined, entityNames: entityNames || undefined } : {})');
    const ui = readFileSync("app/(dashboard)/dashboard/admin/md-prompts/MdPromptsClient.tsx", "utf8");
    expect(ui).toContain('if (!types.includes("bpmn")) { void doRun(); return; }');
    expect(ui).toContain('onSubmit={(answers) => { setPendingQs(null); void doRun(answers); }}');
    expect(ui).toContain("body: JSON.stringify({ md, chainCode: chain.code, types, answers }),");
  });
  it("creating a project from the Repository asks first (library source, BPMN selected) and tailors each process prompt, falling back to the stored one", () => {
    const ui = readFileSync("app/(dashboard)/dashboard/admin/md-diagrams/MdDiagramsClient.tsx", "utf8");
    expect(ui).toContain('if (source !== "library" || bpmn.length === 0) { void doRun(); return; }');
    expect(ui).toContain('action: "questions"');
    expect(ui).toContain("void doRun(answers);");
    const route = readFileSync("app/lib/valueChain/runLibraryProject.ts", "utf8");
    expect(route).toContain('answerItems.length > 0 && fromLibrary && d.type === "bpmn" && procCode && libNarrative.trim()');
    expect(route).toContain("prompt tailored to your answers");
    expect(route).toContain("using the stored one");
    expect(route).toContain("tailoredFromAnswers: true");
  });
  it("the Repository screen asks the questions first for BPMN regeneration, and chain-level prompts regenerate as before", () => {
    const ui = readFileSync("app/(dashboard)/dashboard/admin/value-chain-library/ValueChainLibraryClient.tsx", "utf8");
    expect(ui).toContain('if (!types.includes("bpmn")) { void runRegenerate(code, types, processCode, processCodes); return; }');
    expect(ui).toContain('action: "questions"');
    expect(ui).toContain("void runRegenerate(p.code, p.types, p.processCode, p.processCodes, answers);");
  });
});
