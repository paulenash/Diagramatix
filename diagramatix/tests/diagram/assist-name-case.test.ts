/**
 * A renamed item starts with a capital (Paul, 2026-09-17).
 *
 * Dictation hands back a sentence, not a name: "rename it to approve order"
 * comes back lower-case and then sits on the diagram looking like a typo beside
 * every name that was typed by hand.
 *
 * Two things this must NOT do. It must not title-case — a process step is a
 * phrase, and "Send To Customer For Approval" reads worse than what was said.
 * And it must not touch a first word that already carries a capital, because
 * that capital is nearly always deliberate: iPhone, eCommerce, mRNA, XML.
 */
import { describe, it, expect } from "vitest";
import { capitaliseFirstWord, wouldCapitalise } from "@/app/lib/diagram/nameCase";
import { parseCommand } from "@/app/lib/assist/commandGrammar";

describe("T4475 — the first word is capitalised", () => {
  it("capitalises a dictated lower-case name", () => {
    expect(capitaliseFirstWord("approve order")).toBe("Approve order");
    expect(capitaliseFirstWord("check stock")).toBe("Check stock");
    expect(capitaliseFirstWord("pick")).toBe("Pick");
  });

  it("capitalises the first word ONLY", () => {
    // Title case is the obvious wrong turn here. A process step is a phrase.
    expect(capitaliseFirstWord("send to customer for approval")).toBe("Send to customer for approval");
    expect(capitaliseFirstWord("raise a purchase order")).toBe("Raise a purchase order");
  });

  it("leaves a name that is already capitalised alone", () => {
    for (const name of ["Approve Order", "Approve order", "APPROVE ORDER"]) {
      expect(capitaliseFirstWord(name)).toBe(name);
    }
  });

  it("trims, because a dictated name arrives with whitespace", () => {
    expect(capitaliseFirstWord("  approve order  ")).toBe("Approve order");
  });

  it("survives an empty or whitespace-only name", () => {
    expect(capitaliseFirstWord("")).toBe("");
    expect(capitaliseFirstWord("   ")).toBe("");
    expect(capitaliseFirstWord(undefined as unknown as string)).toBe("");
  });
});

describe("T4476 — a deliberate capital inside the first word is left alone", () => {
  it("does not wreck a name whose capital is part of it", () => {
    // Upper-casing the first letter gives IPhone, ECommerce, MRNA — each worse
    // than the lower-case name this rule exists to fix.
    for (const name of ["iPhone sync", "eCommerce checkout", "mRNA batch check", "eBay listing"]) {
      expect(capitaliseFirstWord(name)).toBe(name);
    }
  });

  it("does nothing when the first character has no case at all", () => {
    // Reaching past the digit to the next letter would give "3Rd party check".
    for (const name of ["3rd party check", "24/7 monitoring", "(draft) approve order"]) {
      expect(capitaliseFirstWord(name)).toBe(name);
    }
  });

  it("still capitalises a later-capitalised word's phrase when the first word is plain", () => {
    expect(capitaliseFirstWord("send to SAP")).toBe("Send to SAP");
  });

  it("reports whether it would change anything", () => {
    expect(wouldCapitalise("approve order")).toBe(true);
    expect(wouldCapitalise("Approve order")).toBe(false);
    expect(wouldCapitalise("iPhone sync")).toBe(false);
    expect(wouldCapitalise("")).toBe(false);
  });
});

describe("T4477 — every spoken rename applies it", () => {
  const renameLabel = (utterance: string): string => {
    const ops = parseCommand(utterance);
    expect(ops, `"${utterance}" did not parse`).not.toBeNull();
    const op = ops![0] as { op: string; label?: string };
    expect(["rename", "labelSelected"]).toContain(op.op);
    return op.label ?? "";
  };

  it("rename X to Y", () => {
    expect(renameLabel("rename Check Stock to approve order")).toBe("Approve order");
  });

  it("relabel X as Y", () => {
    expect(renameLabel("relabel Check Stock as approve order")).toBe("Approve order");
  });

  it("change the name of X to Y", () => {
    expect(renameLabel("change the name of Check Stock to approve order")).toBe("Approve order");
  });

  it("call X Y", () => {
    // A one-word reference on purpose: "call Check Stock approve order" is
    // genuinely ambiguous to the grammar (it splits at the first space, giving
    // the reference "Check"), and that ambiguity predates this rule.
    expect(renameLabel("call Review approve order")).toBe("Approve order");
  });

  it("label selected Y", () => {
    expect(renameLabel("label selected approved")).toBe("Approved");
  });

  it("does not capitalise the REFERENCE, which has to keep matching the canvas", () => {
    // "rename check stock to X" must still find an element called "Check Stock"
    // by the same lower-case matching it always used. Capitalising the ref here
    // would be invisible in the happy path and break the fuzzy one.
    const ops = parseCommand("rename check stock to approve order") as Array<{ ref: string; label: string }>;
    expect(ops[0].ref).toBe("check stock");
    expect(ops[0].label).toBe("Approve order");
  });
});

describe("T4478 — the guided rename keeps the name in the case it was spoken", () => {
  it("reads the number off a copy, not the name", async () => {
    // "14 Approve Invoice" in one breath used to have BOTH the number and the
    // name read off a fully lower-cased string, so the name arrived as "approve
    // invoice" before anything could capitalise it — and a name the user
    // capitalised properly mid-phrase was flattened too.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx"),
      "utf8",
    );
    expect(src).toContain("leadingSpokenNumber(t)");
    expect(src, "the pick still reads the name off the lower-cased copy").not.toContain(
      "leadingSpokenNumber(low)",
    );
    // And the single choke point for the guided flow applies the rule.
    expect(src).toContain("capitaliseFirstWord(name.trim()");
  });

  it("the number word itself is still matched case-insensitively", () => {
    // Passing the original case must not break picking by a spoken word.
    expect(capitaliseFirstWord("Approve invoice")).toBe("Approve invoice");
  });
});
