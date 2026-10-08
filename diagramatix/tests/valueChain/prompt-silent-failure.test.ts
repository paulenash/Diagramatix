/**
 * T5285 — the prompt side of "silent failure" (Paul, 2026-10-08: rules R8.47 / R8.48, scan checks B56 / B57). The master template (v9) tells a
 * prompt writer: an exception path never goes straight to an End event — a task sits between — and the End event that finishes it is a
 * Terminate End event. The prompt checker reports both. They are ADVICE: generation fixes a prompt that omits them, so the repository's
 * "undrawable" counts (checkPromptShapes with no second argument) do not include them.
 */
import { describe, expect, it } from "vitest";
import { checkPromptShapes } from "@/app/lib/valueChain/checkPromptShapes";
import { checkPromptReadiness } from "@/app/lib/valueChain/promptReadiness";
import { DEFAULT_MD_PROMPT_BPMN } from "@/app/lib/valueChain/promptTemplates";

const HEAD = 'BPMN: Order — an order is received and fulfilled.\n\n5. Edge-mounted (boundary) events\n\n';
const straight = `${HEAD}Interrupting timer boundary event on "Await reply" — label "No reply in time" — triggers End event "Order abandoned".\n`;
const viaTask = `${HEAD}Interrupting timer boundary event on "Await reply" — label "No reply in time" — triggers User task "Chase the customer",\n  which then ends in Terminate End event "Order abandoned".\n`;
const taskNotTerminate = `${HEAD}Interrupting timer boundary event on "Await reply" — label "No reply in time" — triggers User task "Chase the customer",\n  which then ends in End event "Order abandoned".\n`;
const rejoins = `${HEAD}Interrupting timer boundary event on "Await reply" — label "No reply in time" — triggers User task "Chase the customer"\n  which then flows back to the exclusive merge gateway "Reply handled".\n`;

const kinds = (p: string, advice = true) => checkPromptShapes(p, advice).map((i) => i.kind);

describe("T5285 the prompt checker and the silent-failure rules", () => {
  it("a boundary event straight to an End event is reported, and so is the End not being Terminate", () => {
    expect(kinds(straight)).toContain("boundary-straight-to-end");
    expect(kinds(straight)).toContain("exception-end-not-terminate");
  });
  it("a task between them with a Terminate End event is clean", () => {
    expect(kinds(viaTask)).toEqual([]);
  });
  it("a task then a plain End event is reported only for the End not being Terminate", () => {
    expect(kinds(taskNotTerminate)).toEqual(["exception-end-not-terminate"]);
  });
  it("a path that rejoins at a merge gateway has no End event and nothing to report", () => {
    expect(kinds(rejoins)).toEqual([]);
  });
  it("it is ADVICE: without the second argument the repository's undrawable counts do not include it", () => {
    expect(kinds(straight, false)).toEqual([]);
    expect(checkPromptShapes(straight)).toEqual([]);
  });
  it("the AI Generate console's prompt check reports it in plain English with the line", () => {
    const r = checkPromptReadiness(straight);
    expect(r.some((i) => i.code === "boundary-straight-to-end" && /^Line \d+:/.test(i.message))).toBe(true);
    expect(r.some((i) => i.code === "exception-end-not-terminate" && /Terminate End event/.test(i.message))).toBe(true);
  });
  it("the master template (v9) says both things", () => {
    expect(DEFAULT_MD_PROMPT_BPMN).toMatch(/AN EXCEPTION NEVER ENDS SILENTLY/);
    expect(DEFAULT_MD_PROMPT_BPMN).toMatch(/TERMINATE END EVENT/);
    expect(DEFAULT_MD_PROMPT_BPMN).toMatch(/Terminate End event "<name>"/);
  });
});
