/**
 * T5201 — The help reads what was HEARD the way the real Voice Assist does: after the parser's own
 * mis-hear repairs, and with the fragment buffer's rules for when a command ends. (Paul, 2026-10-01:
 * the tile's Speak was far less reliable than the real thing — it read raw words and never ended a command.)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EMPTY_UTTERANCE, heardForHelp, onFinal, onQuiet, type Utterance } from "@/app/lib/assist/commandTree/heard";
import { computePanel } from "@/app/lib/assist/commandTree";
import { resolveAssistHelp } from "@/app/lib/assist/commandTree";
import { FRAGMENT_CONTINUE_MS, FRAGMENT_MAX_WAITS, FRAGMENT_SILENCE_MS } from "@/app/lib/assist/fragmentBuffer";

const tree = resolveAssistHelp({ patterns: null, conventions: null }).tree;
const read = (p: string) => readFileSync(p, "utf8");

describe("T5201 heardForHelp — the parser's own repairs", () => {
  it("a mis-heard leading word is repaired exactly as the parser repairs it", () => {
    expect(heardForHelp("and a message from review").toLowerCase()).toMatch(/^add\b/);
  });
  it("plain words and empty text pass through", () => {
    expect(heardForHelp("rename")).toBe("rename");
    expect(heardForHelp("   ")).toBe("");
  });
  it("while a numbered pick is open, a lost 'one' comes back (“the” → “one”)", () => {
    expect(heardForHelp("the", { numberPick: true })).toBe("one");
    expect(heardForHelp("the", {})).toBe("the");
  });
  it("the panel reads the repaired words: a heard 'and a message …' follows the ADD list", () => {
    const view = computePanel(tree!, { interim: "and a message from review", ghost: false, flow: null, names: undefined });
    expect(view.heard.toLowerCase().startsWith("add")).toBe(true);
  });
});

describe("T5201 the utterance buffer — same numbers, same 'unfinished' test as the live session", () => {
  const say = (u: Utterance, t: string) => { const r = onFinal(u, t); if (r.kind !== "buffered") throw new Error(r.kind); return r.utterance; };

  it("fragments are stitched, then the quiet window commits one command and the buffer is empty again", () => {
    let u = say(EMPTY_UTTERANCE, "rename task 8");
    u = say(u, "to approve");
    const q = onQuiet(u);
    expect(q.kind).toBe("commit");
    if (q.kind === "commit") { expect(q.command).toBe("rename task 8 to approve"); expect(q.utterance).toEqual(EMPTY_UTTERANCE); }
  });

  it("an unfinished command is HELD for the rest, up to the same limit, then runs anyway", () => {
    let u = say(EMPTY_UTTERANCE, "rename task 8 to");
    for (let i = 0; i < FRAGMENT_MAX_WAITS; i++) {
      const q = onQuiet(u);
      expect(q.kind).toBe("wait");
      if (q.kind !== "wait") return;
      expect(q.quietMs).toBe(FRAGMENT_CONTINUE_MS);
      u = q.utterance;
    }
    expect(onQuiet(u).kind).toBe("commit");
  });

  it("the held command is completed by the next fragment — and the hold count restarts", () => {
    let u = say(EMPTY_UTTERANCE, "rename task 8 to");
    const q = onQuiet(u);
    if (q.kind === "wait") u = q.utterance;
    u = say(u, "approve");
    expect(u.waits).toBe(0);
    const c = onQuiet(u);
    expect(c.kind === "commit" && c.command).toBe("rename task 8 to approve");
  });

  it("force (the session ended) commits even an unfinished command", () => {
    expect(onQuiet(say(EMPTY_UTTERANCE, "rename task 8 to"), true).kind).toBe("commit");
  });

  it("cancel / done drop the half command unexamined; stop ends the session", () => {
    expect(onFinal({ buffer: "rename task 8 to", waits: 1 }, "cancel").kind).toBe("clear");
    expect(onFinal({ buffer: "rename task 8 to", waits: 1 }, "stop").kind).toBe("stop");
  });

  it("a second command does NOT pile onto the first (the tile's old defect)", () => {
    const first = onQuiet(say(EMPTY_UTTERANCE, "delete task 8"));
    expect(first.kind).toBe("commit");
    const u = first.kind === "commit" ? first.utterance : EMPTY_UTTERANCE;
    const second = onQuiet(say(u, "rename task 9 to pay"));
    expect(second.kind === "commit" && second.command).toBe("rename task 9 to pay");
  });

  it("the quiet window is the live session's own number", () => {
    const r = onFinal(EMPTY_UTTERANCE, "move task 8");
    expect(r.kind === "buffered" && r.quietMs).toBe(FRAGMENT_SILENCE_MS);
  });
});

describe("T5201 the tile and the panel are wired to it", () => {
  it("computePanel reads heardForHelp; the tile uses heardForHelp, onFinal and onQuiet, and shows the last command", () => {
    expect(read("app/lib/assist/commandTree/panelState.ts")).toContain("heardForHelp(input.interim");
    const tile = read("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx");
    for (const w of ["heardForHelp(", "onFinal(", "onQuiet(", "Last command:"]) expect(tile).toContain(w);
  });
});
