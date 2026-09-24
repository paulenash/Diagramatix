/**
 * "Selected" is a command word, and the recogniser kept returning "connect".
 *
 * Once you can say "surround the selected elements" or "rename the selected
 * pool", the word `selected` is what says WHICH thing to act on — losing it
 * does not degrade the command, it retargets it. Two causes, both ours:
 * `connect` sits in the recogniser's keyword boost list and `selected` did not,
 * and the two are close in en-AU once the final consonant is clipped.
 *
 * The repair is deliberately narrow. `connect` is a real verb, so rewriting it
 * anywhere would break "connect Review to Approve". It is only rewritten where
 * it sits directly after another verb — a position `connect` never legitimately
 * occupies.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  repairSelectedWord,
  isSelectionWord,
  SCOPE_VERBS_FOR_SELECTED,
} from "@/app/lib/assist/selectedWord";
import { parseCommand } from "@/app/lib/assist/commandGrammar";

/** The verbs Paul named. Each must repair; the rest of the list is a bonus. */
const PAULS_VERBS = ["surround", "enclose", "rename", "move", "delete", "nudge", "wrap"];

describe("T4466 — a misheard 'selected' is put back after a command verb", () => {
  for (const verb of PAULS_VERBS) {
    it(`repairs it after "${verb}"`, () => {
      const r = repairSelectedWord(`${verb} connect`);
      expect(r.text).toBe(`${verb} selected`);
      expect(r.corrected).toBe(true);
    });

    it(`repairs it after "${verb} the"`, () => {
      expect(repairSelectedWord(`${verb} the connected pool`).text).toBe(`${verb} the selected pool`);
    });
  }

  it("covers every verb it claims to, including Paul's seven", () => {
    for (const verb of PAULS_VERBS) {
      expect(SCOPE_VERBS_FOR_SELECTED as readonly string[]).toContain(verb);
    }
    for (const verb of SCOPE_VERBS_FOR_SELECTED) {
      expect(repairSelectedWord(`${verb} connect`).corrected, `${verb} not repaired`).toBe(true);
    }
  });

  it("handles the other words that lose the same syllable", () => {
    expect(repairSelectedWord("surround collected").text).toBe("surround selected");
    expect(repairSelectedWord("move elected").text).toBe("move selected");
    expect(repairSelectedWord("rename connecting").text).toBe("rename selected");
  });

  it("keeps the filler the speaker used", () => {
    expect(repairSelectedWord("wrap these connected").text).toBe("wrap these selected");
    expect(repairSelectedWord("delete those connect").text).toBe("delete those selected");
  });

  it("keeps sentence capitalisation", () => {
    expect(repairSelectedWord("Surround Connect with a pool").text).toBe("Surround Selected with a pool");
  });
});

describe("T4467 — the repair does not eat a real 'connect' command", () => {
  it("leaves connect as a verb alone", () => {
    for (const said of [
      "connect Review to Approve",
      "connect them",
      "connect the start to Receive Order",
      "link Review to Approve",
    ]) {
      expect(repairSelectedWord(said), said).toEqual({ text: said, corrected: false });
    }
  });

  it("does not touch the word connector", () => {
    // The prefix trap: "connector" starts with "connect". Renaming a connector
    // by name is a real command and must survive untouched.
    for (const said of [
      "rename connector Order Placed to Order Received",
      "delete connector Order Placed",
      "label connector Yes",
      "move connectors down",
    ]) {
      expect(repairSelectedWord(said), said).toEqual({ text: said, corrected: false });
    }
  });

  it("does not repair a bare 'connect' with no verb in front of it", () => {
    expect(repairSelectedWord("connect").corrected).toBe(false);
    expect(repairSelectedWord("collected").corrected).toBe(false);
  });

  it("leaves an utterance that already says selected alone", () => {
    const said = "surround the selected elements with a pool";
    expect(repairSelectedWord(said)).toEqual({ text: said, corrected: false });
  });

  it("is safe to run over every utterance", () => {
    for (const said of ["", "undo that", "add a task called Approve after Review", "stop"]) {
      expect(repairSelectedWord(said).text).toBe(said);
    }
  });
});

describe("T4468 — the repaired utterance parses as the user meant it", () => {
  const sameAsSpokenProperly = (misheard: string, proper: string) => {
    const got = parseCommand(misheard);
    const want = parseCommand(proper);
    expect(want, `the control phrase "${proper}" does not parse — fix the test, not the code`).not.toBeNull();
    expect(got).toEqual(want);
  };

  it("surround", () => {
    sameAsSpokenProperly(
      "surround connect with a pool called Finance",
      "surround selected with a pool called Finance",
    );
  });

  it("wrap", () => {
    sameAsSpokenProperly(
      "wrap connect in a pool called Finance",
      "wrap selected in a pool called Finance",
    );
  });

  it("label", () => {
    sameAsSpokenProperly("label connect Approved", "label selected Approved");
  });

  it("still parses a genuine connect command as a connect", () => {
    const ops = parseCommand("connect Review to Approve");
    expect(ops).toEqual([{ op: "connect", fromRef: "Review", toRef: "Approve" }]);
  });
});

describe("T4469 — the recogniser is told to expect the word", () => {
  it("boosts 'selected' at least as strongly as the word it loses to", () => {
    // The parser repair is the second line of defence. This is the first: if
    // `connect` is boosted and `selected` is not, the recogniser will keep
    // preferring it and every repair is a guess made after the fact.
    // The boost list moved to `asrParams.ts` on 2026-09-24, so the live socket
    // and a replayed clip cannot ask for different things. The rule is the same;
    // only its address changed.
    const src = readFileSync(join(process.cwd(), "app", "lib", "dictation", "asrParams.ts"), "utf8");
    const weight = (word: string): number => {
      const m = src.match(new RegExp(`"${word}(?::(\\d+))?"`));
      expect(m, `${word} is not in the keyword boost list`).not.toBeNull();
      return m![1] ? Number(m![1]) : 1;
    };
    expect(weight("selected")).toBeGreaterThanOrEqual(weight("connect"));
  });
});

describe("T4470 — the words that already mean the selection", () => {
  it("recognises them, and nothing else", () => {
    expect(isSelectionWord("selected")).toBe(true);
    expect(isSelectionWord(" Selection ")).toBe(true);
    expect(isSelectionWord("connect")).toBe(false);
    expect(isSelectionWord("pool")).toBe(false);
  });
});
