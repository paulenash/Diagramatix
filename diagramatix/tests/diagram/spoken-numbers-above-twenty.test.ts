/**
 * Paul, 2026-09-29: "add template, templates displayed, I say 22 or 27, I get
 * template 20." Number words stopped at "twenty", so "twenty two" was read as
 * 20 with "two" left over. The template window has dozens of cards.
 */
import { describe, it, expect } from "vitest";
import { leadingSpokenNumber } from "@/app/lib/assist/spokenNumber";
import { parseTemplateAnswer, type TemplateCard } from "@/app/lib/assist/templatePick";

const cards = Array.from({ length: 40 }, (_, i) => ({ n: i + 1, name: `Pattern ${String.fromCharCode(65 + (i % 26))}${i}`, id: `t${i + 1}` })) as unknown as TemplateCard[];

describe("T5082 — numbers above twenty, spoken", () => {
  it("'twenty two', 'twenty-seven', 'thirty' and 'ninety nine' are read whole, with what follows kept", () => {
    expect(leadingSpokenNumber("twenty two")).toMatchObject({ n: 22, rest: "" });
    expect(leadingSpokenNumber("Twenty-seven.")).toMatchObject({ n: 27, rest: "" });
    expect(leadingSpokenNumber("thirty")).toMatchObject({ n: 30 });
    expect(leadingSpokenNumber("ninety nine")).toMatchObject({ n: 99 });
    expect(leadingSpokenNumber("twenty five Approve Order")).toMatchObject({ n: 25, rest: "Approve Order" });
    expect(leadingSpokenNumber("twenty")).toMatchObject({ n: 20, rest: "" });
    expect(leadingSpokenNumber("twenty Approve")).toMatchObject({ n: 20, rest: "Approve" });
    expect(leadingSpokenNumber("22 Approve")).toMatchObject({ n: 22, rest: "Approve" });
  });

  it("in the template window, saying 22 or 27 picks card 22 or 27 — never 20", () => {
    for (const [said, n] of [["twenty two", 22], ["twenty-seven", 27], ["twenty seven", 27], ["22", 22], ["thirty five", 35], ["twenty", 20]] as const) {
      const a = parseTemplateAnswer(said, cards, false);
      expect(a, said).toMatchObject({ kind: "pick", card: { n } });
    }
  });
});
