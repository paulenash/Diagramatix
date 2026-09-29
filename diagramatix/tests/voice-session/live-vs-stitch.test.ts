/**
 * Stage 4 of mobile voice — THE LIVE LOOP AGREES WITH REPLAY'S stitchFinals.
 *
 * `stitchFinals` (app/lib/assist/fragmentBuffer.ts) is the Replay tab's SECOND
 * implementation of the fragment policy: it takes every final with its time and
 * reconstructs the commands the live buffer would have run. The file says so
 * plainly — two implementations of one policy, agreeing on the numbers and the
 * predicate, able to diverge if the SHAPE of the loop changes. "The Replay tab
 * scores the same" is only evidence about the live loop if the two agree.
 *
 * These tests drive the REAL live loop (the voice session under React, the
 * fake recogniser, fake timers) with timed finals and compare the commands it
 * RAN — each run writes exactly one log line whose `heard` is the text run —
 * with stitchFinals(finals, endMs):
 *   • on the gap grid around every threshold (2200, 5400, 8600, 11800 ms);
 *   • on Paul's recorded boundary session, with his own pauses;
 * and give each KNOWN difference its own test (T5078): the mic stop word,
 * the flow-end words, the early flushes (renameByType, a number in a rename
 * pick) and the 2-minute idle close. A whitespace-only final was one too,
 * until Paul's ruling of 2026-09-29 made stitchFinals skip blank finals; its
 * test now pins that the two agree.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { readFileSync } from "node:fs";
import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { stitchFinals, FRAGMENT_SILENCE_MS, FRAGMENT_CONTINUE_MS, FRAGMENT_MAX_WAITS, type Final } from "@/app/lib/assist/fragmentBuffer";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { isFlowEndWord } from "@/app/lib/assist/stopWords";
import type { DiagramData } from "@/app/lib/diagram/types";

let calls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  calls = stubFetch(() => ({ ops: [] }));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

// ── local helpers ────────────────────────────────────────────────────────────

const WAITING = "waiting for the previous command…";
const CLEARED = "cleared — listening for the next command";

/** Let the AI fallback's fetch → json → apply chain finish (setImmediate is real). */
async function drain(h: Mounted) {
  // One round is enough today (each h.act settles three more); two for margin.
  for (let i = 0; i < 2; i++) await h.act(() => new Promise<void>((r) => setImmediate(r)));
}
async function listen(h: Mounted) {
  await h.act(() => h.session.setVoiceAssistOn(true));
  await h.act(() => h.session.toggleAbraListening());
  expect(h.session.voiceListening).toBe(true);
}
async function say(h: Mounted, text: string) {
  await h.act(() => fakeDictation.current.cb.onText(text));
  await drain(h);
}
async function wait(h: Mounted, ms: number) {
  await h.act(() => { vi.advanceTimersByTime(ms); });
  await drain(h);
}
/** The texts the session RAN: one log line per run, `heard` = the text (not the queue's or the escape's notes). */
const ran = (h: Mounted) => h.log.filter((l) => l.heard && l.summary !== WAITING && l.summary !== CLEARED).map((l) => l.heard);
/** The instructions sent to the AI fallback. */
const aiInstructions = () => calls.filter((c) => c.url === "/api/ai/command").map((c) => (c.body as { instruction: string }).instruction);

type End = "button" | "socket";
/**
 * Speak `finals` into the live loop at their times, stop at `endMs` (the mic
 * button, or the socket closing — both force the last flush), and report what ran.
 */
async function live(finals: readonly Final[], endMs: number, end: End, initial: DiagramData = threeTasks()) {
  calls.length = 0;
  fakeDictation.reset();
  const h = await mountSession({ initial });
  await listen(h);
  let now = 0;
  for (const f of finals) {
    if (f.atMs > now) { await wait(h, f.atMs - now); now = f.atMs; }
    await say(h, f.text);
  }
  if (endMs > now) await wait(h, endMs - now);
  if (end === "button") await h.act(() => h.session.toggleAbraListening());
  else await h.act(() => fakeDictation.current.cb.onEnd?.());
  await drain(h);
  const out = { ran: ran(h), ai: aiInstructions(), log: [...h.log], listening: h.session.voiceListening };
  await h.unmount();
  return out;
}

/** Finals with a gap between each. */
const timed = (texts: string[], gaps: number[]): Final[] => {
  let at = 0;
  return texts.map((text, i) => { if (i > 0) at += gaps[i - 1]; return { text, atMs: at }; });
};

/** The gap grid: each threshold, one ms either side where it matters. */
const GRID = [0, 2199, 2200, 2201, 5399, 5400, 8599, 8600, 11799, 11800];
/** Two ways to end: a short tail closed by the mic button; a long tail (the timers flush) closed by the socket. */
const TAILS: { tail: number; end: End }[] = [{ tail: 500, end: "button" }, { tail: 20_000, end: "socket" }];

/** Run one shape over the grid; return live and stitched tables side by side. */
async function gridTables(texts: string[], gapsFor: (g: number) => number[]) {
  const liveT: Record<string, string[]> = {};
  const stitchT: Record<string, string[]> = {};
  const aiT: Record<string, string[]> = {};
  const aiExpected: Record<string, string[]> = {};
  for (const g of GRID) {
    for (const { tail, end } of TAILS) {
      const finals = timed(texts, gapsFor(g));
      const endMs = finals[finals.length - 1].atMs + tail;
      const key = `gap ${g} / ${end} after ${tail}`;
      const r = await live(finals, endMs, end);
      liveT[key] = r.ran;
      stitchT[key] = stitchFinals(finals, endMs);
      aiT[key] = r.ai;
      // What reached the AI is exactly the stitched commands the grammar does not read.
      aiExpected[key] = stitchT[key].filter((c) => !parseCommand(c));
    }
  }
  return { liveT, stitchT, aiT, aiExpected };
}

// ════════════════════════════════════════════════════════════════════════════

describe("T5077 — the live loop runs the commands Replay's stitchFinals reconstructs", () => {
  it("the policy's numbers are the ones the grid straddles (2200 silence, +3200 per hold, 3 holds)", () => {
    expect([FRAGMENT_SILENCE_MS, FRAGMENT_CONTINUE_MS, FRAGMENT_MAX_WAITS]).toEqual([2200, 3200, 3]);
    const thresholds = [0, 1, 2, 3].map((k) => FRAGMENT_SILENCE_MS + k * FRAGMENT_CONTINUE_MS);
    expect(thresholds).toEqual([2200, 5400, 8600, 11800]);
    for (const t of thresholds) expect(GRID).toEqual(expect.arrayContaining([t - 1, t]));
  });

  it("timing: a complete command runs 2200 ms after its final; a held half runs 11800 ms after (three 3200 ms holds), not a millisecond before", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "add a task called Alpha");
    expect(h.session.voiceInterim).toBe("add a task called Alpha");
    await wait(h, 2199);
    expect(ran(h)).toEqual([]);
    await wait(h, 1);
    expect(ran(h)).toEqual(["add a task called Alpha"]);
    expect(h.data.elements.some((e) => e.label === "Alpha")).toBe(true);
    expect(h.session.voiceInterim).toBe("");

    await say(h, "rename Receive order to");
    for (const hold of [2199, 1, 3199, 1, 3199, 1, 3199]) {       // to 11799 ms: 2200, 5400, 8600 each re-held
      await wait(h, hold);
      expect(ran(h)).toEqual(["add a task called Alpha"]);
      expect(h.session.voiceInterim).toBe("rename Receive order to");
    }
    expect(aiInstructions()).toEqual([]);
    await wait(h, 1);                                             // 11800 ms: the hold budget is spent — it runs, to the AI
    expect(ran(h)).toEqual(["add a task called Alpha", "rename Receive order to"]);
    expect(aiInstructions()).toEqual(["rename Receive order to"]);
    await h.unmount();
  });

  it("two complete commands — the grid agrees: joined below 2200 ms, two commands from 2200 ms", async () => {
    const t = await gridTables(["add a task called Alpha", "add a task called Beta"], (g) => [g]);
    expect(t.liveT).toEqual(t.stitchT);
    expect(t.aiT).toEqual(t.aiExpected);
    // Not vacuous: both outcomes occur, split exactly at the silence.
    expect(t.stitchT["gap 2199 / button after 500"]).toEqual(["add a task called Alpha add a task called Beta"]);
    expect(t.stitchT["gap 2200 / button after 500"]).toEqual(["add a task called Alpha", "add a task called Beta"]);
  }, 120_000);

  it("an incomplete “rename X to” + its completion — the grid agrees: held up to 11799 ms and joined, split from 11800 ms", async () => {
    const t = await gridTables(["rename Receive order to", "Approve order"], (g) => [g]);
    expect(t.liveT).toEqual(t.stitchT);
    expect(t.aiT).toEqual(t.aiExpected);
    for (const g of [0, 2200, 5400, 8600, 11799]) expect(t.stitchT[`gap ${g} / socket after 20000`]).toEqual(["rename Receive order to Approve order"]);
    expect(t.stitchT["gap 11800 / socket after 20000"]).toEqual(["rename Receive order to", "Approve order"]);
  }, 120_000);

  it("three fragments (complete, half, completion) — the grid agrees in all three regimes", async () => {
    const t = await gridTables(["add a task called Alpha", "rename Receive order to", "Approve order"], (g) => [g, g]);
    expect(t.liveT).toEqual(t.stitchT);
    expect(t.aiT).toEqual(t.aiExpected);
    expect(t.stitchT["gap 2199 / button after 500"]).toHaveLength(1);
    expect(t.stitchT["gap 2200 / button after 500"]).toEqual(["add a task called Alpha", "rename Receive order to Approve order"]);
    expect(t.stitchT["gap 11800 / button after 500"]).toHaveLength(3);
  }, 120_000);

  it("three fragments on a two-gap grid (“rename” … “Receive order” … “to Approve order”) — every pair of gaps agrees", async () => {
    const texts = ["rename", "Receive order", "to Approve order"];
    const mismatches: string[] = [];
    const shapes = new Set<string>();
    for (const g1 of GRID) {
      for (const g2 of GRID) {
        const finals = timed(texts, [g1, g2]);
        const endMs = finals[2].atMs + 500;
        const r = await live(finals, endMs, "button");
        const s = stitchFinals(finals, endMs);
        shapes.add(JSON.stringify(s));
        if (JSON.stringify(r.ran) !== JSON.stringify(s)) mismatches.push(`${g1}/${g2}: live ${JSON.stringify(r.ran)} vs stitch ${JSON.stringify(s)}`);
      }
    }
    expect(mismatches).toEqual([]);
    // The grid reaches every way the three can be cut.
    expect([...shapes].sort()).toEqual([
      JSON.stringify(["rename Receive order to Approve order"]),
      JSON.stringify(["rename", "Receive order to Approve order"]),
      JSON.stringify(["rename Receive order", "to Approve order"]),
      JSON.stringify(["rename", "Receive order", "to Approve order"]),
    ].sort());
  }, 300_000);

  it("the stitched command is what the diagram got: joined, the grammar renames; split, both halves went to the AI and nothing was renamed", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "rename Receive order to");
    await wait(h, 11_799);
    await say(h, "Approve order");
    await wait(h, 2200);
    expect(h.data.elements.find((e) => e.id === "t1")?.label).toBe("Approve order");
    expect(aiInstructions()).toEqual([]);
    expect(h.lastLine?.ops).toEqual([{ op: "rename", ref: "Receive order", label: "Approve order" }]);
    await h.unmount();

    calls.length = 0;
    const h2 = await mountSession({ initial: threeTasks() });
    await listen(h2);
    await say(h2, "rename Receive order to");
    await wait(h2, 11_800);
    await say(h2, "Approve order");
    await wait(h2, 2200);
    expect(aiInstructions()).toEqual(["rename Receive order to", "Approve order"]);
    expect(h2.log.map((l) => l.viaAi)).toEqual([true, true]);
    expect(h2.data.elements.find((e) => e.id === "t1")?.label).toBe("Receive order");
    await h2.unmount();
  });

  it("Paul's recorded boundary session (boundary-session-4.json), replayed with his own pauses: the live loop runs exactly stitchFinals' commands", async () => {
    const session = JSON.parse(readFileSync("tests/fixtures/voice-debug/boundary-session-4.json", "utf8")) as {
      diagram: DiagramData; heard: Final[];
    };
    const finals = session.heard;
    const endMs = finals[finals.length - 1].atMs + 3000;          // replayClip gives the last segment 3 s
    const r = await live(finals, endMs, "button", structuredClone(session.diagram));
    // The flow-end words never enter the buffer live (T5078 below), so they are
    // compared apart: the stitch is given the rest, the live loop's own lines for them are set aside.
    const stitched = stitchFinals(finals.filter((f) => !isFlowEndWord(f.text)), endMs);
    expect(r.ran.filter((t) => !isFlowEndWord(t))).toEqual(stitched);
    // The session really was cut by its pauses — halves joined, and the five "done"s each answered on their own.
    expect(stitched).toEqual(expect.arrayContaining([
      "move selected lines top boundary up one hundred",
      "move underwriters team top boundary up one hundred",
      "move claim team bottom boundary down one hundred",
      "move underwriters check-in line top boundary down to tasks",
    ]));
    expect(stitched.length).toBeLessThan(finals.length - 5);
    expect(r.log.filter((l) => l.heard === "done")).toHaveLength(finals.filter((f) => f.text === "done").length);
  }, 120_000);
});

// ════════════════════════════════════════════════════════════════════════════

describe("T5078 — the known differences between the live loop and stitchFinals, each pinned", () => {
  it("CURRENT: the spoken mic stop word drops a command still in the buffer — stitchFinals keeps it (with “stop” appended)", async () => {
    // A quirk kept deliberately by the move: onText clears the buffer BEFORE
    // stopAbraListening, so its forced flush finds nothing — a complete command
    // said less than 2.2 s before "stop" is never run. A spoken stop writes no line.
    const finals = timed(["add a task called Alpha", "stop"], [1000]);
    expect(stitchFinals(finals, 1500)).toEqual(["add a task called Alpha stop"]);
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "add a task called Alpha");
    await wait(h, 1000);
    await say(h, "stop");
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.sessions).toHaveLength(1);
    expect(fakeDictation.current.stopped).toBe(true);
    await wait(h, 20_000);                                         // no flush is left pending either
    expect(h.log).toEqual([]);
    expect(aiInstructions()).toEqual([]);
    expect(h.data.elements.some((e) => /alpha/i.test(e.label ?? ""))).toBe(false);
    await h.unmount();
  });

  it("a spoken “stop” is never a command: after a command has run, stitchFinals emits “stop” as one more; the live loop just closes the mic", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "add a task called Alpha");
    await wait(h, 3000);
    await say(h, "Stop.");
    expect(stitchFinals(timed(["add a task called Alpha", "Stop."], [3000]), 3500)).toEqual(["add a task called Alpha", "Stop."]);
    expect(ran(h)).toEqual(["add a task called Alpha"]);
    expect(h.log).toHaveLength(1);                                // no "stopped listening" — that line is the TYPED stop's
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.current.stopped).toBe(true);
    await h.typed("stop");
    expect(h.lastLine).toMatchObject({ heard: "stop", summary: "stopped listening", ok: true });
    await h.unmount();
  });

  it("a “stop” said during a held “rename X to”: stitchFinals makes it a rename to “Stop”; the live loop drops the half and renames nothing", async () => {
    const finals = timed(["rename Receive order to", "stop"], [4000]);
    const stitched = stitchFinals(finals, 4500);
    expect(stitched).toEqual(["rename Receive order to stop"]);
    expect(parseCommand(stitched[0])).toEqual([{ op: "rename", ref: "Receive order", label: "Stop" }]);
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "rename Receive order to");
    await wait(h, 4000);
    await say(h, "stop");
    await wait(h, 20_000);
    expect(ran(h)).toEqual([]);
    expect(aiInstructions()).toEqual([]);
    expect(h.data.elements.find((e) => e.id === "t1")?.label).toBe("Receive order");
    expect(h.session.voiceListening).toBe(false);
    await h.unmount();
  });

  it("a flow-end word (“cancel”) during a held half, nothing open: stitchFinals makes it a rename to “Cancel”; the live loop drops the half, says so, and keeps listening", async () => {
    const finals = timed(["rename Receive order to", "cancel"], [3000]);
    const stitched = stitchFinals(finals, 3500);
    expect(stitched).toEqual(["rename Receive order to cancel"]);
    expect(parseCommand(stitched[0])).toEqual([{ op: "rename", ref: "Receive order", label: "Cancel" }]);
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "rename Receive order to");
    await wait(h, 3000);
    await say(h, "cancel");
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "cancel", summary: CLEARED, ok: true });
    expect(h.session.voiceInterim).toBe("");
    await wait(h, 20_000);                                         // the pending hold was cancelled too
    expect(ran(h)).toEqual([]);
    expect(aiInstructions()).toEqual([]);
    expect(h.data.elements.find((e) => e.id === "t1")?.label).toBe("Receive order");
    expect(h.session.voiceListening).toBe(true);
    // Still listening, and the next command is heard on its own.
    await say(h, "add a task called Beta");
    await wait(h, 2200);
    expect(ran(h)).toEqual(["add a task called Beta"]);
    await h.unmount();
  });

  it("CURRENT: a flow-end word inside the silence window drops a COMPLETE command too — stitchFinals runs “add a task called Alpha cancel”", async () => {
    // A quirk kept deliberately by the move: the escape drops the buffer
    // unexamined, whole commands included.
    const finals = timed(["add a task called Alpha", "cancel"], [1000]);
    expect(stitchFinals(finals, 1500)).toEqual(["add a task called Alpha cancel"]);
    const r = await live(finals, 1500, "button");
    expect(r.ran).toEqual([]);
    expect(r.log.map((l) => [l.heard, l.summary])).toEqual([["cancel", CLEARED]]);
    expect(r.ai).toEqual([]);
  });

  it("a flow-end word with a flow open runs at once, outside the buffer: “done” closes the rename pick without waiting out the silence", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "rename tasks");
    expect((h.session.renameFlow as { phase: string } | null)?.phase).toBe("pick");
    await wait(h, 1000);
    await say(h, "done");                                           // no timer advanced: it has already run
    expect(h.session.renameFlow).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename finished", ok: true });
    expect(stitchFinals(timed(["rename tasks", "done"], [1000]), 1500)).toEqual(["rename tasks done"]);
    await h.unmount();
  });

  it("early flush — renameByType: “rename tasks” runs the moment it is heard, no silence wait; stitchFinals joins it with what follows", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "rename tasks");
    expect(ran(h)).toEqual(["rename tasks"]);                       // at 0 ms
    expect(h.lastLine?.ops).toEqual([{ op: "renameByType", itemType: "task" }]);
    expect(h.session.voiceInterim).toBe("");
    expect(stitchFinals(timed(["rename tasks", "2", "Approve order"], [1000, 1000]), 2500)).toEqual(["rename tasks 2 Approve order"]);
    await h.unmount();
  });

  it("early flush — a number in a rename pick: “2” is taken the moment it is heard, the name after it is a command of its own; stitchFinals runs “2 Approve order” as one — the same label either way", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "rename tasks");
    const flow = h.session.renameFlow as { phase: "pick"; targets: { n: number; id: string }[] };
    const target = flow.targets.find((t) => t.n === 2)!;
    expect(target).toBeDefined();
    await wait(h, 1000);
    await say(h, "2");                                              // no timer advanced
    expect(h.session.renameFlow).toMatchObject({ phase: "name", targetId: target.id });
    expect(h.labelEdits).toEqual([target.id]);
    expect(h.log).toHaveLength(1);                                  // a bare pick writes no line of its own
    await wait(h, 1000);
    await say(h, "Approve order");
    await wait(h, 2199);
    expect(h.log).toHaveLength(1);                                  // the name waits out the ordinary silence
    await wait(h, 1);
    expect(h.lastLine).toMatchObject({ heard: "Approve order", ok: true });
    expect(h.data.elements.find((e) => e.id === target.id)?.label).toBe("Approve order");
    expect(stitchFinals(timed(["2", "Approve order"], [1000]), 3500)).toEqual(["2 Approve order"]);

    // The one-breath form stitchFinals produces lands on the same label.
    const h2 = await mountSession({ initial: threeTasks() });
    await listen(h2);
    await say(h2, "rename tasks");
    await h2.typed("2 Approve order");
    expect(h2.data.elements.find((e) => e.id === target.id)?.label).toBe("Approve order");
    await h.unmount();
    await h2.unmount();
  });

  it("the 2-minute idle close: the live loop shuts the mic after 120000 ms without a final (so a later final is never heard); stitchFinals has no such limit", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await listen(h);
    await say(h, "add a task called Alpha");
    await wait(h, 119_999);
    expect(h.session.voiceListening).toBe(true);
    await wait(h, 1);
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.log.map((l) => [l.heard, l.summary])).toEqual([
      ["add a task called Alpha", "added Alpha"],
      ["", "Voice Assist closed — 2 minutes idle"],
    ]);
    expect(stitchFinals(timed(["add a task called Alpha", "add a task called Beta"], [130_000]), 131_000))
      .toEqual(["add a task called Alpha", "add a task called Beta"]);
    await h.unmount();
  });

  it("a whitespace-only final inside the silence window — the live loop ignores it and runs the first command at 2200 ms, and Replay's stitchFinals now agrees (no longer a difference)", async () => {
    // Paul's ruling, 2026-09-29: stitchFinals (app/lib/assist/fragmentBuffer.ts)
    // skips blank finals before measuring the pause. It used to measure the gap
    // to the blank (1000 ms, under the silence) and so join these two into one
    // command, where the live loop — whose onText returns on a blank before
    // touching the buffer or its timer — runs two.
    const finals: Final[] = [{ text: "add a task called Alpha", atMs: 0 }, { text: " ", atMs: 1000 }, { text: "add a task called Beta", atMs: 3000 }];
    const r = await live(finals, 3500, "button");
    expect(r.ran).toEqual(["add a task called Alpha", "add a task called Beta"]);
    expect(stitchFinals(finals, 3500)).toEqual(r.ran);
    expect(stitchFinals(finals, 3500), "the blank changes nothing").toEqual(stitchFinals(finals.filter((f) => f.text.trim()), 3500));
  });
});
