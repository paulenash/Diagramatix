/**
 * spokenText transformations — what log lines say aloud.
 * Pure function tests covering quote removal, number reading, id stripping, verbosity filtering.
 */
import { describe, it, expect } from "vitest";
import { spokenText, type SpeechVerbosity } from "@/app/lib/voice/spokenText";

describe("spokenText — log line transformations", () => {
  describe("verbosity filter", () => {
    it("off → empty string always", () => {
      expect(spokenText("added Task 1 after Receive Order", "off")).toBe("");
      expect(spokenText("no room above Underwriters", "off")).toBe("");
      expect(spokenText("which Review? say a number", "off")).toBe("");
    });

    it("questions → only lines with ?", () => {
      expect(spokenText("which Review? say 1 or 2", "questions")).toContain("which Review");
      expect(spokenText("added Task 1 after Receive Order", "questions")).toBe("");
      expect(spokenText("no room above Underwriters", "questions")).toBe("");
    });

    it("problems → questions + refusals (no, can't, won't, unable, there, nothing)", () => {
      expect(spokenText("which Review? say 1 or 2", "problems")).toContain("which Review");
      expect(spokenText("no room above Underwriters", "problems")).toContain("no room");
      expect(spokenText("can't take Do x into Claims", "problems")).toContain("can't");
      expect(spokenText("added Task 1 after Receive Order", "problems")).toBe("");
    });

    it("everything → all lines through", () => {
      expect(spokenText("which Review? say 1 or 2", "everything")).toContain("which Review");
      expect(spokenText("no room above Underwriters", "everything")).toContain("no room");
      expect(spokenText("added Task 1 after Receive Order", "everything")).toContain("added");
    });
  });

  describe("quote removal", () => {
    it("removes curly quotes", () => {
      const text = 'rename Task 1 to "Review Email"';
      const result = spokenText(text, "everything");
      expect(result).not.toContain('"');
      expect(result).toContain("Review Email");
    });

    it("handles apostrophes in names", () => {
      const text = "rename Task 1 to Alice's Review";
      const result = spokenText(text, "everything");
      expect(result).toContain("Alice");
    });
  });

  describe("arrow to 'to'", () => {
    it("converts arrow symbol to the word 'to'", () => {
      const text = "rename Task 1 → Review Email";
      const result = spokenText(text, "everything");
      expect(result).toContain("to");
      expect(result).not.toContain("→");
    });
  });

  describe("element id stripping", () => {
    it("removes UUIDs", () => {
      const text = "moved 123e4567-e89b-12d3-a456-426614174000 to the left";
      const result = spokenText(text, "everything");
      expect(result).toBe("moved to the left");
    });

    it("removes UUIDs with roles", () => {
      const text = "connected 123e4567-e89b-12d3-a456-426614174000:start to end";
      const result = spokenText(text, "everything");
      expect(result).toBe("connected to end");
    });
  });

  describe("number reading", () => {
    it("reads single digits naturally", () => {
      const text = "Task 1 after Task 2";
      const result = spokenText(text, "everything");
      expect(result).toContain("one");
      expect(result).toContain("two");
    });
  });

  describe("whitespace collapse", () => {
    it("collapses multiple spaces", () => {
      const text = "added    Task    1";
      const result = spokenText(text, "everything");
      expect(result).toBe("added Task one");
    });
  });

  describe("real log lines", () => {
    it("picker question", () => {
      const text = "which Review? say a number, 1 or 2, or cancel";
      const result = spokenText(text, "problems");
      expect(result).toContain("which Review");
      expect(result).toContain("one");
      expect(result).toContain("two");
    });

    it("refusal with names", () => {
      const text = 'no room above Underwriters for a lane called Quality Assurance';
      const result = spokenText(text, "problems");
      expect(result).toContain("no room");
      expect(result).toContain("Underwriters");
    });

    it("rename with digit-suffixed name", () => {
      const text = "rename Task 1 to Review Email";
      const result = spokenText(text, "everything");
      expect(result).toContain("rename");
      expect(result).toContain("Review Email");
    });
  });
});
