/**
 * BPMN "Refine" — response parsing + prompt-append behaviour.
 */
import { describe, it, expect } from "vitest";
import { parseRefineQuestions } from "@/app/lib/ai/refineQuestions";
import { appendRefinements } from "@/app/lib/diagram/clarifications";

describe("parseRefineQuestions", () => {
  const good = JSON.stringify({
    questions: [
      { label: "Process initiator", question: "Who starts it?", type: "single", options: ["Customer", "Sales rep"] },
      { label: "Systems involved", question: "Which systems?", type: "multi", options: ["SAP", "Salesforce", "Email"] },
    ],
  });

  it("parses well-formed questions", () => {
    const qs = parseRefineQuestions(good);
    expect(qs).toHaveLength(2);
    expect(qs[0].type).toBe("single");
    expect(qs[1].type).toBe("multi");
    expect(qs[1].options).toEqual(["SAP", "Salesforce", "Email"]);
  });

  it("tolerates markdown fences and surrounding prose", () => {
    const wrapped = "Here you go:\n```json\n" + good + "\n```\nHope that helps!";
    expect(parseRefineQuestions(wrapped)).toHaveLength(2);
  });

  it("returns [] on unparseable output (safe no-op)", () => {
    expect(parseRefineQuestions("I couldn't do that.")).toEqual([]);
    expect(parseRefineQuestions("")).toEqual([]);
  });

  it("returns [] when the model says nothing is missing", () => {
    expect(parseRefineQuestions('{"questions":[]}')).toEqual([]);
  });

  it("drops malformed questions (bad type, <2 options, missing label)", () => {
    const mixed = JSON.stringify({
      questions: [
        { label: "OK", question: "Fine?", type: "single", options: ["a", "b"] },
        { label: "Bad type", question: "?", type: "dropdown", options: ["a", "b"] },
        { label: "Too few", question: "?", type: "single", options: ["only one"] },
        { question: "No label", type: "single", options: ["a", "b"] },
      ],
    });
    const qs = parseRefineQuestions(mixed);
    expect(qs).toHaveLength(1);
    expect(qs[0].label).toBe("OK");
  });

  it("caps at 6 questions", () => {
    const many = JSON.stringify({
      questions: Array.from({ length: 10 }, (_, i) => ({
        label: `L${i}`, question: `Q${i}?`, type: "single", options: ["a", "b"],
      })),
    });
    expect(parseRefineQuestions(many)).toHaveLength(6);
  });
});

describe("appendRefinements", () => {
  it("appends labelled lines in a CLARIFICATIONS block, skipping empties", () => {
    const out = appendRefinements("Employee onboarding", [
      { label: "Process initiator", answer: "HR" },
      { label: "Rejection path", answer: "" }, // skipped
      { label: "Systems involved", answer: "SAP, Email" },
    ]);
    expect(out).toContain("Employee onboarding");
    expect(out).toContain("CLARIFICATIONS");
    expect(out).toContain("- Process initiator: HR");
    expect(out).toContain("- Systems involved: SAP, Email");
    expect(out).not.toContain("Rejection path");
  });

  it("returns the prompt unchanged when every answer is empty", () => {
    const p = "Some prompt";
    expect(appendRefinements(p, [{ label: "x", answer: "" }])).toBe(p);
  });

  it("MERGES a second round into the one existing block (no duplicate header)", () => {
    const round1 = appendRefinements("Onboarding", [{ label: "Initiator", answer: "HR" }]);
    const round2 = appendRefinements(round1, [{ label: "End state", answer: "Account active" }]);
    // exactly one CLARIFICATIONS header
    expect(round2.match(/CLARIFICATIONS/g)).toHaveLength(1);
    expect(round2).toContain("- Initiator: HR");
    expect(round2).toContain("- End state: Account active");
  });
});
