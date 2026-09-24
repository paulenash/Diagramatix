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
  it("the parser repair is now the ONLY defence, because boosting made it worse", () => {
    // This used to assert that `selected` was boosted at least as hard as
    // `connect` — the recogniser's half of the fix, with the parser repair as
    // the second line of defence.
    //
    // Measured on 2026-09-25 against 100 recorded commands, that half was doing
    // harm: `selected:3` was caught turning "delete Review" into "SELECTED
    // review", and the keyword list as a whole scored 80% where an empty list
    // scored 92%. The boost is gone; the repair stands alone and is tested
    // above, on real transcripts.
    const src = readFileSync(join(process.cwd(), "app", "lib", "dictation", "asrParams.ts"), "utf8");
    const list = src.slice(src.indexOf("export const COMMAND_KEYWORDS"), src.indexOf("function appendKeyterms"));
    expect(list, "no word may be boosted without a measurement").not.toMatch(/"[a-z]+(?::\d)?"/i);
    expect(src, "and the reason is recorded where the next person will look")
      .toMatch(/NO KEYWORDS AT ALL\s+92%/);
    // The repair itself is what protects the word now.
    expect(repairSelectedWord("rename connect pool to Finance").corrected, "the repair still fires").toBe(true);
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
