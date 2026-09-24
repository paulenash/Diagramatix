/**
 * T4601-T4603 — three defects from Paul's live session, 21 September 2026.
 *
 * His log, verbatim:
 *
 *   rule  "Add a start event."                   → added start-event
 *   rule  "Add a task called receive order"      → added receive order
 *   ✨AI  "after the start."  →  "add a task called receive order after Start"
 *                                               → added receive order
 *   rule  "Add a task called check stock"        → added check stock
 *   ✨AI  "after receive order." → "add a task called check stock after
 *         receive order" → which "receive order"? 2 match: "receive order",
 *         "receive order" — say the name; added check stock after check stock
 *
 * Three separate things went wrong, and they compounded:
 *
 *  1. A STRANDED TAIL BECAME A NEW ELEMENT. "Add a task called receive order"
 *     is complete, so it ran. "after the start." then arrived with no sentence
 *     in front of it. The hold rules could not help — the first half was
 *     finished — so it reached the AI, which had the diagram in front of it,
 *     saw the newest element, helpfully reconstructed the whole command, and
 *     added a SECOND "receive order".
 *  2. EVERY LATER REFERENCE WAS THEN AMBIGUOUS, because two elements shared a
 *     name that the user only ever said once.
 *  3. THE AMBIGUITY WAS REPORTED AND THE COMMAND RAN ANYWAY. The add branch
 *     pushed the error, set `anyFail`, and fell through to the recency
 *     fallback — anchoring to whatever was added last. Hence the last line:
 *     the error, a semicolon, and "added check stock after check stock".
 *
 * (3) is the serious one: a failed reference is not permission to pick a
 * different element. (1) is what made it reachable.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { capitaliseFirstWord, needsCapital } from "@/app/lib/diagram/nameCase";
import { editorWithApplyLayer } from "./assistApplySource";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("T4601 — a stranded 'after X' is a connection, not a new element", () => {
  it("reads Paul's exact tail as a connect, never an add", () => {
    expect(parseCommand("after the start.")).toEqual([
      { op: "connect", fromRef: "the start", toRef: "the last" },
    ]);
    expect(parseCommand("after receive order.")).toEqual([
      { op: "connect", fromRef: "receive order", toRef: "the last" },
    ]);
  });

  it("never reaches the AI, which is what invented the duplicate", () => {
    // The whole failure needed the tail to fall through to a model that could
    // see the diagram. A deterministic answer removes that possibility.
    for (const said of ["after the start", "and after Review", "that's after Approve"]) {
      const ops = parseCommand(said);
      expect(ops, said).not.toBeNull();
      expect(ops![0].op, said).toBe("connect");
    }
  });

  it("reverses for 'before'", () => {
    expect(parseCommand("before Approve")).toEqual([
      { op: "connect", fromRef: "the last", toRef: "Approve" },
    ]);
  });

  it("leaves a WHOLE command that merely begins with the connective alone", () => {
    // "After Review add a task called X" is a sentence, not a tail. Treating
    // it as a bare connect would drop the add entirely — the opposite defect.
    const ops = parseCommand("after Review add a task called Approve");
    expect(ops?.[0].op).not.toBe("connect");
  });

  it("does not swallow an ordinary add that names an anchor", () => {
    expect(parseCommand("add a task called Check Stock after Receive Order")?.[0])
      .toMatchObject({ op: "add", label: "Check Stock", afterRef: "Receive Order" });
  });
});

describe("T4602 — a named anchor that does not resolve STOPS the command", () => {
  const body = editorWithApplyLayer();

  it("does not fall through to the recency fallback after an error", () => {
    // The defect verbatim: `if ("err" in a) { results.push(a.err); anyFail =
    // true; }` with no `continue`, so the next line took voiceLastId instead.
    expect(body, "the error must end the op, not annotate it")
      .toMatch(/if \("err" in a\) \{ results\.push\(a\.err\); anyFail = true; continue; \}/);
    expect(body, "the old shape is what produced “…say the name; added check stock after check stock”")
      .not.toMatch(/if \("err" in a\) \{ results\.push\(a\.err\); anyFail = true; \}\s*\n\s*if \(!anchor/);
  });

  it("raises the picker when the anchor is ambiguous, rather than guessing", () => {
    // They can see which one they meant; numbering the candidates is cheaper
    // than making them rephrase a command that was unambiguous to them.
    expect(body).toMatch(/const a = resolve1\(op\.afterRef, \{ strict: true \}\);/);
    expect(body).toMatch(/if \("err" in a && a\.ambiguous\)[\s\S]{0,300}buildPickFlow\(ops, op\.afterRef, a\.ambiguous, els\)/);
  });

  it("keeps the recency fallback for when NO anchor was named", () => {
    // "add a task" with nothing after it still follows the last thing added —
    // that convenience is the reason the fallback exists, and it is only wrong
    // when the user DID name something.
    expect(body).toMatch(/if \(!anchor && voiceLastId\.current\)/);
  });
});

describe("T4603 — activity, gateway and event labels start with a capital", () => {
  it("covers the three families Paul named, and not containers", () => {
    for (const t of ["task", "subprocess", "subprocess-expanded", "gateway", "start-event", "intermediate-event", "end-event"]) {
      expect(needsCapital(t), t).toBe(true);
    }
    // Pools and lanes have their own rules — never the bare kind word, always
    // unique — in the same reducer branch. A third rule on top would make a
    // rename harder to predict than it already is.
    for (const t of ["pool", "lane", "sublane", "text-annotation", "review-comment"]) {
      expect(needsCapital(t), t).toBe(false);
    }
  });

  it("capitalises the first word only, not every word", () => {
    expect(capitaliseFirstWord("receive order")).toBe("Receive order");
    expect(capitaliseFirstWord("send to customer for approval"))
      .toBe("Send to customer for approval");
  });

  it("leaves a deliberate capital alone", () => {
    // Blindly upper-casing gives IPhone, ECommerce, MRNA — worse than the
    // problem being fixed.
    for (const n of ["iPhone sync", "eCommerce order", "mRNA batch", "3rd party check"]) {
      expect(capitaliseFirstWord(n), n).toBe(n);
    }
  });

  it("is enforced in the REDUCER, so every path obeys it", () => {
    // It was applied on a voice rename only, which is why "add a task called
    // receive order" left a lower-case name next to every name that was typed.
    // The palette, an inline edit, a spoken command and an AI apply all end up
    // in these two branches.
    const reducer = read("app", "hooks", "useDiagram.ts");
    expect(reducer, "UPDATE_LABEL — renames and the voice add").toMatch(
      /: target && needsCapital\(target\.type\)\s*\n\s*\? capitaliseFirstWord\(action\.payload\.label\)/,
    );
    expect(reducer, "ADD_ELEMENT — a label that arrives WITH the element").toMatch(
      /needsCapital\(action\.payload\.symbolType\)\s*\n\s*\? capitaliseFirstWord\(initial\?\.label \?\? label\)/,
    );
  });

  it("keeps the assist working copy in step with the reducer", () => {
    // Otherwise the log line and the next command's reference describe a name
    // the diagram does not have.
    const body = editorWithApplyLayer();
    expect(body).toMatch(/const addedLabel = op\.label && needsCapital\(op\.symbolType\) \? capitaliseFirstWord\(op\.label\) : op\.label;/);
    expect(body).toMatch(/syntheticElement\(newId, op\.symbolType, center, w, h, \{ label: addedLabel,/);
  });
});
