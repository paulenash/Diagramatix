/**
 * T4587-T4588 — V3, first half: measure before building.
 *
 * V3 is the personal phrase book. Paul's own framing is that it is "worth
 * doing only after V1 and V2 have been used enough to say whether they left
 * anything", and those shipped the same morning. So what ships here is the
 * measurement, not the feature — and the measurement is the thing that decides
 * whether the feature should exist.
 *
 * The distinction it draws is the one the original review asked for as V0:
 * MISHEARD (said again, worked — the recogniser's fault) against REPHRASED
 * (said differently, worked — the grammar's fault). Only the first is
 * something a phrase book could ever learn. A phrase book built on a log that
 * is mostly rephrased would learn the wrong lesson.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  correctionPairs, correctionTally, formatCorrectionTally, CORRECTION_WINDOW,
} from "@/app/lib/assist/correctionPairs";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const said = (heard: string, ok: boolean) => ({ heard, ok });

describe("T4587 — a failed command followed by a working re-issue is a pair", () => {
  it("calls it MISHEARD when the re-issue says the same thing", () => {
    const pairs = correctionPairs([
      said("add a task called Eskalate after Review", false),
      said("add a task called Escalate after Review", true),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].kind, "the words were right in the user's mouth").toBe("misheard");
    expect(pairs[0].gap).toBe(1);
  });

  it("calls it REPHRASED when the re-issue says something different", () => {
    // The user changed their words to suit the grammar. No amount of phonetic
    // learning helps with this one — which is the whole point of separating them.
    const pairs = correctionPairs([
      said("collapse the subprocess", false),
      said("compress the Warehouse pool", true),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].kind).toBe("rephrased");
  });

  it("spots a mis-hear that token overlap alone would miss", () => {
    // A SHORT command is where this matters: "delete escalade" and "delete
    // Escalate" share one word of two, which is 0.5 — under the threshold. The
    // sound is what identifies them as the same sentence said twice, and a
    // one-word command is exactly when the recogniser has least to go on.
    const pairs = correctionPairs([
      said("delete escalade", false),
      said("delete Escalate", true),
    ]);
    expect(pairs[0]?.kind, "token overlap is 0.5 here — only the sound settles it")
      .toBe("misheard");
  });

  it("ignores bookkeeping, which is not a correction of anything", () => {
    // Without this, every failure near the end of a session would look as if
    // it had been fixed, because "stop" always works.
    for (const after of ["stop", "done", "undo that", "yes", "3"]) {
      expect(correctionPairs([said("rename the thing", false), said(after, true)]), after)
        .toEqual([]);
    }
    // And a failure that IS bookkeeping is not a failure worth pairing.
    expect(correctionPairs([said("stop", false), said("add a task called X", true)])).toEqual([]);
  });

  it("does not pair across a gap the user has plainly moved on from", () => {
    const far = [
      said("collapse the subprocess", false),
      said("add a task called A", true),
      said("add a task called B", true),
      said("add a task called C", true),
      said("add a task called D", true),
    ];
    // The first success inside the window claims it; nothing beyond it can.
    expect(correctionPairs(far, 0)).toEqual([]);
    expect(CORRECTION_WINDOW).toBeGreaterThanOrEqual(2);
  });

  it("uses a success once, so three tries is one pair and not two", () => {
    const pairs = correctionPairs([
      said("rename the gateway to Approved", false),
      said("rename the gateway to Approved", false),
      said("rename the gateway to Approved?", true),
    ]);
    expect(pairs, "one correction happened, however many attempts it took").toHaveLength(1);
  });

  it("finds nothing in a session where everything worked", () => {
    expect(correctionPairs([said("add a task called A", true), said("add a task called B", true)]))
      .toEqual([]);
  });
});

describe("T4588 — the tally, which is what decides whether V3 is worth building", () => {
  const session = [
    said("add a task called Eskalate after Review", false),
    said("add a task called Escalate after Review", true),
    said("collapse the subprocess", false),
    said("compress the Warehouse pool", true),
    said("delete the widget", false),        // never corrected
    said("stop", true),                       // bookkeeping
  ];

  it("counts commands, failures and how each failure was fixed", () => {
    const t = correctionTally(session);
    expect(t.commands, "bookkeeping is not a command").toBe(5);
    expect(t.failures).toBe(3);
    expect(t.corrected).toBe(2);
    expect(t.misheard).toBe(1);
    expect(t.rephrased).toBe(1);
  });

  it("separates the recogniser's problem from the grammar's", () => {
    // A session that is all mis-hears says a phrase book has something to learn.
    const asr = correctionTally([
      said("nudge the ware house left", false), said("nudge the Warehouse left", true),
      said("rename Eskalate to Escalate", false), said("rename Escalate to Chase", true),
    ]);
    expect(asr.misheard).toBeGreaterThan(0);
    // One that is all rephrasing says the effort belongs in the grammar instead.
    const grammar = correctionTally([
      said("collapse the subprocess", false), said("compress the pool", true),
      said("swap Task A with Task B", false), said("delete Task A", true),
    ]);
    expect(grammar.rephrased).toBe(2);
    expect(grammar.misheard).toBe(0);
  });

  it("says nothing at all before there is anything to say", () => {
    expect(formatCorrectionTally(correctionTally([]))).toBe("");
    expect(formatCorrectionTally(correctionTally([said("stop", true)]))).toBe("");
  });

  it("reads plainly when the session went well", () => {
    const line = formatCorrectionTally(correctionTally([said("add a task called A", true)]));
    expect(line).toBe("1 command, none needed a second go");
  });

  it("names both kinds when it did not", () => {
    const line = formatCorrectionTally(correctionTally(session));
    expect(line).toContain("5 commands");
    expect(line).toContain("3 didn't land");
    expect(line).toContain("misheard");
    expect(line).toContain("rephrased");
  });

  it("is shown beside the cost, and stores nothing", () => {
    // It is a MEASUREMENT, not the phrase book. Persisting the pairs is V3's
    // second half and is deliberately not built: it would be guessing at the
    // shape of a problem V1 and V2 may already have removed.
    const bar = read("app", "components", "canvas", "VoiceAssistBar.tsx");
    expect(bar).toContain("formatCorrectionTally(correctionTally(log))");
    expect(bar, "computed from the log on screen — no store, no fetch, no beacon")
      .not.toMatch(/correctionPairs?[\s\S]{0,200}(?:fetch|sendBeacon|localStorage)/);
  });
});
