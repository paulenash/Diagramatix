/**
 * T4767 — what a line of text sounds like when Diagramatix says it.
 *
 * `speechTransform` is the cleanup every spoken string gets; `spokenText` puts
 * it behind the verbosity gate for Voice Assist's log lines. Animate's narration
 * uses the transform WITHOUT the gate — a bare label is neither a question nor a
 * refusal, and the gate would silence the whole tour.
 */
import { describe, it, expect } from "vitest";
import { spokenText, speechTransform } from "@/app/lib/voice/spokenText";

describe("T4767 — the verbosity gate", () => {
  it("off says nothing, ever", () => {
    for (const s of ["added Task 1 after Receive Order", "no room above Underwriters", "which Review? say a number"]) {
      expect(spokenText(s, "off")).toBe("");
    }
  });

  it("questions: only what needs an answer", () => {
    expect(spokenText("which Review? say 1 or 2", "questions")).toContain("which Review");
    expect(spokenText("no room above Underwriters", "questions")).toBe("");
    expect(spokenText("added Task 1 after Receive Order", "questions")).toBe("");
  });

  it("problems (the default): questions AND refusals, but successes stay silent", () => {
    expect(spokenText("which Review? say 1 or 2", "problems")).toContain("which Review");
    expect(spokenText("no room above Underwriters", "problems")).toContain("no room");
    expect(spokenText("can't take Do x into Claims", "problems")).toContain("can't");
    expect(spokenText("there are no events, activities, gateways, data objects or data stores to put in a pool", "problems")).toContain("there are no events");
    expect(spokenText("added Task 1 after Receive Order", "problems")).toBe("");
  });

  it("everything: successes too", () => {
    expect(spokenText("added Task 1 after Receive Order", "everything")).toContain("added");
  });
});

describe("T4767 — the transform", () => {
  it("drops quotation marks, straight and curly", () => {
    expect(speechTransform('rename Task 1 to "Review Email"')).toBe("rename Task one to Review Email");
    expect(speechTransform("put 2 elements in a new pool “Northwind Freight”")).toBe("put two elements in a new pool Northwind Freight");
  });

  it("keeps apostrophes — “can't” read as “cant” is audibly wrong", () => {
    expect(speechTransform("can't take Do x into Claims")).toBe("can't take Do x into Claims");
    expect(speechTransform("rename Task 1 to Alice's Review")).toContain("Alice's");
    expect(speechTransform("can’t move it")).toBe("can't move it");
  });

  it("reads the arrow as the word", () => {
    expect(speechTransform("Receive Order → Check Stock")).toBe("Receive Order to Check Stock");
  });

  it("never reads an element id aloud", () => {
    expect(speechTransform("moved 123e4567-e89b-12d3-a456-426614174000 to the left")).toBe("moved to the left");
    expect(speechTransform("connected 123e4567-e89b-12d3-a456-426614174000:start to end")).toBe("connected to end");
  });

  it("says a lone digit as a word, so the picker asks for “one or two”", () => {
    expect(speechTransform("say 1 or 2, or cancel")).toBe("say one or two, or cancel");
  });

  it("leaves longer numbers and digits inside words alone", () => {
    expect(speechTransform("the 2026 plan")).toBe("the 2026 plan");
    expect(speechTransform("Review1 after Task2")).toBe("Review1 after Task2");
  });

  it("collapses whitespace", () => {
    expect(speechTransform("  added    Task    1  ")).toBe("added Task one");
  });
});
