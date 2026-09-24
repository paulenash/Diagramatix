/**
 * T4717–T4720 — the Voice Assist debug log: what it remembers, and what it
 * refuses to conflate.
 *
 * Paul, 2026-09-24: "Add a Debug feature that can be turned on for SuperAdmin
 * that allows me to type a comment next to each attempted command to indicate
 * whether it worked or to comment on how it worked. In addition, the ability to
 * take a snapshot."
 *
 * The log entry shape moved out of `VoiceAssistBar.tsx` to make these tests
 * possible at all — the suite is node-only with no jsdom, so nothing in a .tsx
 * can be reached except as source text.
 */
import { describe, it, expect } from "vitest";
import {
  disputeCount, isDisputed, touchedFor, describeTouched,
  type CommandLogEntry, type TouchBox,
} from "@/app/lib/assist/commandLog";
import { correctionTally } from "@/app/lib/assist/correctionPairs";
import { isVoiceDebugOn, setVoiceDebug, VOICE_DEBUG_KEY } from "@/app/lib/assist/voiceDebug";

/** A tiny in-memory localStorage, so the toggle can be tested without a browser. */
const fakeStore = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    read: (k: string) => map.get(k) ?? null,
  };
};
/** Storage that throws on every access — a private window, or blocked site data. */
const brokenStore = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

const box = (o: Partial<TouchBox> & { id: string }): TouchBox =>
  ({ x: 0, y: 0, width: 100, height: 60, ...o });

describe("T4717 — an enriched entry is still something correctionPairs can read", () => {
  it("the session tally is identical with and without the debug fields", () => {
    // `correctionPairs.LoggedCommand` consumes this shape STRUCTURALLY, and the
    // tally it computes is already on screen under the Cost readout. Every new
    // field is optional for this reason; a required one would have broken the
    // readout silently.
    const bare: CommandLogEntry[] = [
      { id: "1", heard: "add a task called Approve", summary: "couldn't do that", ok: false },
      { id: "2", heard: "add a task called Approve", summary: "added Approve", ok: true },
      { id: "3", heard: "rename it to Sign", summary: "renamed", ok: true },
    ];
    const enriched: CommandLogEntry[] = bare.map((e, i) => ({
      ...e,
      at: 1_700_000_000_000 + i * 1000,
      note: "a comment",
      verdict: "worked",
      ops: [{ op: "add", symbolType: "task", label: "Approve" }] as CommandLogEntry["ops"],
      flow: "rename",
      touched: [{ id: "t1", type: "task", label: "Approve", changes: ["added"] }],
      snapshotId: "snap1",
    }));
    expect(correctionTally(enriched)).toEqual(correctionTally(bare));
    expect(correctionTally(enriched).misheard, "the misheard pair is still seen").toBe(1);
  });
});

describe("T4718 — the debug toggle defaults OFF and fails CLOSED", () => {
  it("nothing stored means not recording", () => {
    // The opposite of goldFlash, on purpose: nobody should accumulate annotated
    // sessions, with snapshots of their diagrams in them, that they did not ask
    // for.
    expect(isVoiceDebugOn(fakeStore())).toBe(false);
  });

  it("only the exact string turns it on", () => {
    expect(isVoiceDebugOn(fakeStore({ [VOICE_DEBUG_KEY]: "true" }))).toBe(true);
    for (const junk of ["false", "1", "yes", "TRUE", ""]) {
      expect(isVoiceDebugOn(fakeStore({ [VOICE_DEBUG_KEY]: junk })), `"${junk}" must not start a recording`).toBe(false);
    }
  });

  it("a blocked or private store reads OFF, never on", () => {
    // goldFlash fails OPEN, because a missed highlight costs nothing. Here a
    // wrong answer silently starts capturing diagram content down an error
    // path, which is not something to do by accident.
    expect(isVoiceDebugOn(brokenStore)).toBe(false);
    expect(() => setVoiceDebug(true, brokenStore), "and writing must not throw").not.toThrow();
  });

  it("round-trips through the store", () => {
    const s = fakeStore();
    setVoiceDebug(true, s);
    expect(s.read(VOICE_DEBUG_KEY)).toBe("true");
    expect(isVoiceDebugOn(s)).toBe(true);
    setVoiceDebug(false, s);
    expect(isVoiceDebugOn(s)).toBe(false);
  });
});

describe("T4719 — touchedFor keeps what the gold flash deliberately drops", () => {
  it("reports a DELETE, which flashTargets cannot", () => {
    // flashTargets drops deletes ("there is nothing left to outline") and that
    // is right for a highlight and wrong for evidence: "it deleted the wrong
    // lane" is exactly the report somebody needs to file.
    const before = [box({ id: "a", label: "Keep" }), box({ id: "b", label: "Prepare" })];
    const after = [box({ id: "a", label: "Keep" })];
    const touched = touchedFor(before, after);
    expect(touched).toEqual([{ id: "b", type: undefined, label: "Prepare", changes: ["deleted"] }]);
  });

  it("reports a rename, a re-parent and a subtype change — none of which move anything", () => {
    const before = [
      box({ id: "a", label: "Old" }),
      box({ id: "b", parentId: "L1" }),
      box({ id: "c", marks: "task" }),
    ];
    const after = [
      box({ id: "a", label: "New" }),
      box({ id: "b", parentId: "L2" }),
      box({ id: "c", marks: "task|user" }),
    ];
    const kinds = Object.fromEntries(touchedFor(before, after).map((t) => [t.id, t.changes]));
    expect(kinds).toEqual({ a: ["renamed"], b: ["reparented"], c: ["remarked"] });
  });

  it("reports EVERY change an element had, not just the most interesting one", () => {
    // A command that renames and moves did both; evidence naming one sends the
    // reader looking in the wrong place.
    const before = [box({ id: "a", label: "Old", x: 0, y: 0 })];
    const after = [box({ id: "a", label: "New", x: 200, y: 40, width: 140 })];
    const t = touchedFor(before, after)[0];
    expect(new Set(t.changes)).toEqual(new Set(["renamed", "resized", "moved"]));
  });

  it("ignores sub-pixel noise, and says nothing when nothing changed", () => {
    const before = [box({ id: "a" })];
    expect(touchedFor(before, [box({ id: "a", x: 0.4, y: -0.4 })]), "float noise is not a change").toEqual([]);
    expect(touchedFor(before, before)).toEqual([]);
    expect(touchedFor([], []), "an empty diagram touches nothing").toEqual([]);
  });

  it("an add is an add, and reads back in English", () => {
    const touched = touchedFor([], [box({ id: "n", type: "task", label: "Approve" })]);
    expect(touched[0].changes).toEqual(["added"]);
    expect(describeTouched(touched[0])).toBe("Approve added");
    expect(describeTouched({ id: "x", type: "gateway", changes: ["moved", "resized"] }))
      .toBe("gateway moved + resized");
  });
});

describe("T4720 — the human's verdict is never folded into the system's ok", () => {
  it("“it said it worked and it did not” is its own thing, and is counted", () => {
    // The most dangerous failure there is: the system reported success and did
    // the wrong thing. No generated test can ever find this class, because the
    // system believes it passed — only a person watching can say so.
    const log: CommandLogEntry[] = [
      { id: "1", heard: "a", summary: "added", ok: true, verdict: "worked" },
      { id: "2", heard: "b", summary: "added a lane", ok: true, verdict: "wrong" },   // the dispute
      { id: "3", heard: "c", summary: "couldn't", ok: false, verdict: "wrong" },      // an honest failure
      { id: "4", heard: "d", summary: "added", ok: true, verdict: "partly" },
      { id: "5", heard: "e", summary: "added", ok: true },                            // unjudged
    ];
    expect(disputeCount(log), "only the one that lied").toBe(1);
    expect(log.filter((e) => !e.ok).length, "failures are counted separately").toBe(1);
    expect(isDisputed(log[1])).toBe(true);
    expect(isDisputed(log[2]), "an admitted failure is not a dispute").toBe(false);
    expect(isDisputed(log[3]), "partly is a grumble, not a dispute").toBe(false);
    expect(isDisputed(log[4]), "no verdict is not a dispute").toBe(false);
  });
});
