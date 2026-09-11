/**
 * The AI assessment has to arrive WHOLE, and it has to be readable.
 *
 * Paul, 2026-09-11, quoting an assessment that ended mid-word: "...because
 * headcount is unchan". The budget was 512 tokens and the reply ran past it.
 *
 * The budget was the cause; it is not the interesting bug. The interesting bug
 * is that nothing looked at `stop_reason`, so a sentence cut in half was handed
 * to the reader as a finished judgement — there is no visual difference between
 * an assessment that stopped because it was done and one that stopped because it
 * ran out of room. A bigger budget makes that rarer. Only the check makes it
 * visible.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const FACTS = fs.readFileSync(path.join(ROOT, "app/lib/simulation/facts/assessFacts.ts"), "utf8");
const ROUTE = fs.readFileSync(path.join(ROOT, "app/api/projects/[id]/simulation/studies/[studyId]/assess/route.ts"), "utf8");
const VIEW = fs.readFileSync(path.join(ROOT, "app/components/simulation/results/CompareView.tsx"), "utf8");

describe("the AI assessment arrives whole", () => {
  it("T4236 — the output budget is big enough for the reply the prompt asks for", () => {
    const m = FACTS.match(/const ASSESS_MAX_TOKENS = (\d+)/);
    expect(m, "the budget must be a named constant, not a literal buried in the call").not.toBeNull();
    const budget = Number(m![1]);

    // 512 truncated a normal reply. The prompt asks for a verdict plus up to
    // four bullets carrying figures; 1000+ clears that with room to spare.
    expect(budget).toBeGreaterThanOrEqual(1000);
    expect(FACTS).toContain("max_tokens: ASSESS_MAX_TOKENS");
    expect(FACTS, "the old literal budget is gone").not.toContain("max_tokens: 512");
  });

  it("T4237 — a truncated assessment is REPORTED, not served as a finished one", () => {
    // The whole chain has to carry it, or the check is unobservable: detect it
    // in the generator, pass it through the route, say so on the screen.
    expect(FACTS, "generator must inspect stop_reason").toContain('message.stop_reason === "max_tokens"');
    expect(FACTS).toMatch(/truncated\?: boolean/);
    expect(ROUTE, "route must pass the flag to the client").toContain("truncated: result.truncated ?? false");
    expect(VIEW, "the screen must say so").toContain("assessTruncated");
    expect(VIEW).toMatch(/cut off before it finished/i);
  });

  it("T4238 — the assessment is laid out for a reader, not returned as one block of prose", () => {
    // Paul: "Can we format the AI Assessment better. so that a human can more
    // easily read it." A verdict line, then short bullets.
    expect(FACTS, "the prompt must ask for the verdict-plus-bullets shape").toMatch(/Line 1: THE VERDICT/);
    expect(FACTS).toMatch(/each starting "- "/);
    // ...and the old instruction that forbade it is gone.
    expect(FACTS, "the prompt still forbids the bullets it now requires").not.toContain("no bullet points");

    // The renderer parses that shape rather than assuming it.
    expect(VIEW).toContain("function AssessmentBody");
    expect(VIEW).toContain('startsWith("- ")');
  });

  it("T4239 — an assessment with no bullets still renders, rather than vanishing", () => {
    // Two producers write into this box: the model, and summariseComparison (the
    // deterministic fallback). Older stored text, or a model that ignores the
    // format, must degrade to the paragraph that was there before — not to an
    // empty panel.
    const body = VIEW.slice(VIEW.indexOf("function AssessmentBody"));
    expect(body).toMatch(/if \(bullets\.length === 0\)/);
    expect(body).toMatch(/whitespace-pre-line/);
  });
});
