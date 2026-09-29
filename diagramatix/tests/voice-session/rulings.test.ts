/**
 * T5081 — Paul's Voice Assist rulings of 2026-09-29 ("all as recommended", "and
 * the smaller items as recommended as well"), pinned on the REAL session hook
 * (app/hooks/useVoiceSession.ts) under React with the fake recogniser, and on
 * Replay's stitchFinals:
 *
 *   1. A stop drops a waiting "clear the diagram?" — and whatever was buffered
 *      as its answer — BEFORE the recogniser stops (mic-loop.test.ts).
 *   2. A stop also closes an open "which one?" pick, and discards its buffered
 *      answer (here; router.test.ts for the typed stop).
 *   3. "stop rename" / "stop numbering" are flow words only; a typed flow word
 *      with nothing open says "cleared — listening for the next command".
 *   4. An AI reply that lands after a stop is dropped ("ignored — you said
 *      stop"); a stop empties the queue however it was given.
 *   5. stitchFinals skips blank finals before measuring the pause.
 *   (a) A diagram switch ends everything of the old diagram, an AI reply
 *       still on its way included (lifecycle.test.ts for the rest).
 *   (b) "connecting…" is cleared when a start fails, is stopped while
 *       connecting, and on the engine's onEnd.
 *   (c) The per-diagram `voice-assist-${diagramId}` key is no longer written.
 *
 * Every log line asserted here is copied from the code, not from memory.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { runningAgainst } from "./loadVoiceSession";
import { editorSource } from "../diagram/assistApplySource";
import { stitchFinals, FRAGMENT_SILENCE_MS, type Final } from "@/app/lib/assist/fragmentBuffer";

let calls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  calls = stubFetch(() => ({ ops: [] }));
});
afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

// ── local helpers ────────────────────────────────────────────────────────────

const CLEARED = "cleared — listening for the next command";
const IGNORED = "ignored — you said stop";
const WAITING = "waiting for the previous command…";
const AI = "/api/ai/command";
const PICK_TASK_LINE = "pick a task by number, then say the new name — “cancel” to stop, “done” when finished";
const WHICH_TASK = "which “task”? say a number (1–3), or “cancel”";
const AUDIT_TRAIL = { ops: [{ op: "add", symbolType: "task", label: "Audit trail" }] };

/** The log as [heard, summary, ok, viaAi] — viaAi absent reads as null. */
const brief = (h: Mounted) => h.log.map((l) => [l.heard, l.summary, l.ok, l.viaAi ?? null]);
const labels = (h: Mounted) => h.data.elements.map((e) => e.label);
const aiCalls = (c = calls) => c.filter((x) => x.url === AI);
const canUndo = (h: Mounted) => (h.d as unknown as { canUndo: boolean }).canUndo;
const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

/** A `fetch` whose AI replies wait for the test (router.test.ts's heldAi): `release` answers the oldest call still waiting. */
function heldAi(instant: unknown = { ops: [] }) {
  const waiting: ((v: unknown) => void)[] = [];
  const s = {
    holding: true,
    calls: [] as { url: string; body: unknown }[],
    release(reply: unknown) { const r = waiting.shift(); if (!r) throw new Error("no AI call is waiting"); r(reply); },
  };
  s.calls = stubFetch(() => (s.holding ? new Promise((r) => { waiting.push(r); }) : instant));
  return s;
}

/** Start a command WITHOUT awaiting it (its AI call is held); the promise comes back boxed. */
async function startCommand(h: Mounted, text: string): Promise<{ done: Promise<void> }> {
  let done!: Promise<void>;
  await h.act(() => { done = h.session.runVoiceCommand(text); });
  return { done };
}

/** Voice Assist on and the (fake) mic open and connected. */
async function micOn(h: Mounted) {
  await h.act(() => h.session.setVoiceAssistOn(true));
  await h.act(() => h.session.toggleAbraListening());
  expect(h.session.voiceListening).toBe(true);
  expect(fakeDictation.current.stopped).toBe(false);
}
/** A final from the current recogniser session. */
async function hear(h: Mounted, text: string) { await h.act(() => fakeDictation.current.cb.onText(text)); }

// ═════════════════════════════════════════════════════════════════════════════

describe("T5081 — (5) Replay's stitchFinals skips blank finals before measuring the pause", () => {
  const withBlank = (finals: Final[], atMs: number, text = " "): Final[] =>
    [...finals, { text, atMs }].sort((a, b) => a.atMs - b.atMs);

  it("a blank final between two COMMANDS no longer joins them: the pause is measured to the next real final, as the live loop measures it", () => {
    const real: Final[] = [{ text: "add a task called Alpha", atMs: 0 }, { text: "add a task called Beta", atMs: 3000 }];
    expect(stitchFinals(real, 3500)).toEqual(["add a task called Alpha", "add a task called Beta"]);
    // Before the ruling the gap was measured to the blank (1000 ms, under the
    // silence), and these came back as ONE command.
    expect(stitchFinals(withBlank(real, 1000), 3500)).toEqual(["add a task called Alpha", "add a task called Beta"]);
    expect(stitchFinals(withBlank(withBlank(real, 500, ""), 1000, "\t "), 3500)).toEqual(stitchFinals(real, 3500));
  });

  it("a blank final between two fragments of ONE sentence changes nothing — one command, exactly as without the blank", () => {
    const real: Final[] = [{ text: "rename Receive order to", atMs: 0 }, { text: "Approve order", atMs: 4000 }];
    expect(stitchFinals(real, 4500)).toEqual(["rename Receive order to Approve order"]);
    for (const at of [500, 2199, 2200, 2500, 3999]) {
      expect(stitchFinals(withBlank(real, at), 4500), `blank at ${at} ms`).toEqual(stitchFinals(real, 4500));
    }
    const plain: Final[] = [{ text: "delete Pay", atMs: 0 }, { text: "supplier", atMs: 1500 }];
    expect(stitchFinals(withBlank(plain, 700), 2000)).toEqual(["delete Pay supplier"]);
  });

  it("the pause is measured to the next REAL final: with a blank between, one ms under the silence joins, the silence itself splits", () => {
    const at = (betaAt: number): Final[] => [
      { text: "add a task called Alpha", atMs: 0 },
      { text: " ", atMs: 1000 },
      { text: "add a task called Beta", atMs: betaAt },
    ];
    expect(stitchFinals(at(FRAGMENT_SILENCE_MS - 1), 5000)).toEqual(["add a task called Alpha add a task called Beta"]);
    expect(stitchFinals(at(FRAGMENT_SILENCE_MS), 5000)).toEqual(["add a task called Alpha", "add a task called Beta"]);
  });

  it("a blank final alone yields nothing; blanks around one command leave just that command", () => {
    expect(stitchFinals([{ text: "   ", atMs: 0 }], 1000)).toEqual([]);
    expect(stitchFinals([{ text: "", atMs: 0 }, { text: " \t", atMs: 500 }], 1000)).toEqual([]);
    expect(stitchFinals([], 1000)).toEqual([]);
    expect(stitchFinals([{ text: " ", atMs: 0 }, { text: "delete Pay supplier", atMs: 100 }, { text: " ", atMs: 200 }], 300)).toEqual(["delete Pay supplier"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe(`T5081 — (3) flow words: a typed one with nothing open is cleared locally; "stop rename" keeps the mic on (${runningAgainst()})`, () => {
  it.each(["done", "cancel", "stop rename", "Stop numbering."])("typed “%s” with nothing open logs “cleared — listening for the next command”, makes NO fetch, and changes nothing", async (word) => {
    const h = await mountSession({ initial: threeTasks() });
    const before = h.data;
    await h.typed(word);
    expect(brief(h)).toEqual([[word, CLEARED, true, null]]);
    expect(h.lastLine?.ops).toBeUndefined();
    expect(calls).toHaveLength(0);
    expect(h.data).toEqual(before);
    expect(canUndo(h)).toBe(false);
    for (const f of [h.session.renameFlow, h.session.messageFlow, h.session.pickFlow, h.session.dividerFlow, h.session.templateFlow, h.session.pendingConfirmRef.current]) expect(f).toBeNull();
  });

  it("with a flow open a typed flow word still closes it, each with its own line: the rename pick, the “which one?” pick, a waiting “clear the diagram?”", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    expect(h.session.renameFlow).toMatchObject({ phase: "pick" });
    await h.typed("stop rename");
    expect(h.session.renameFlow).toBeNull();

    await h.typed("delete the task");
    expect(h.session.pickFlow).not.toBeNull();
    await h.typed("done");
    expect(h.session.pickFlow).toBeNull();

    await h.typed("clear the diagram");
    expect(h.session.pendingConfirmRef.current).not.toBeNull();
    await h.typed("cancel");
    expect(h.session.pendingConfirmRef.current).toBeNull();

    expect(brief(h)).toEqual([
      ["rename tasks", PICK_TASK_LINE, true, false],
      ["", "rename finished", true, null],
      ["delete the task", WHICH_TASK, true, false],
      ["done", "cancelled", true, null],
      ["clear the diagram", "clear the whole diagram (5 elements)? — say “yes” to confirm", true, false],
      ["cancel", "cancelled — did not clear the whole diagram (5 elements)", true, false],
    ]);
    expect(h.data.elements).toHaveLength(5);
    expect(calls).toHaveLength(0);
  });

  it("spoken “stop rename” while a rename pick is open closes it with “rename finished” and the mic stays LISTENING — in the pick phase and the name phase alike", async () => {
    fakeTimers();
    const h = await mountSession({ initial: threeTasks() });
    await micOn(h);
    await hear(h, "rename tasks");                 // renameByType runs at once
    expect(h.session.renameFlow).toMatchObject({ phase: "pick" });
    await hear(h, "stop rename");
    expect(h.session.renameFlow).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename finished", ok: true });
    expect(h.session.voiceListening).toBe(true);
    expect(fakeDictation.current.stopped).toBe(false);

    await hear(h, "rename tasks");
    await hear(h, "two");                          // a number in the pick runs at once
    expect(h.session.renameFlow).toMatchObject({ phase: "name", targetId: "t2" });
    await hear(h, "stop rename");
    expect(h.session.renameFlow).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename finished", ok: true });
    expect(labels(h)).toContain("Check invoice");  // not renamed to "Stop rename"
    expect(h.session.voiceListening).toBe(true);
    expect(fakeDictation.current.stopped).toBe(false);
    expect(fakeDictation.sessions).toHaveLength(1);
    expect(aiCalls()).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe(`T5081 — (2) a stop closes an open “which one?” pick and discards its buffered answer (${runningAgainst()})`, () => {
  it("the mic button's stop with a number buffered for an open “which one?” closes the pick and discards the number — nothing is deleted", async () => {
    fakeTimers();
    const h = await mountSession({ initial: threeTasks() });
    await micOn(h);
    await h.typed("delete the task");
    expect(h.session.pickFlow).not.toBeNull();
    await hear(h, "2");                           // buffered: waiting out the silence
    expect(h.session.voiceInterim).toBe("2");

    await h.act(() => h.session.toggleAbraListening());
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.pickFlow).toBeNull();
    expect(h.session.onScreenBadges ?? null).toBeNull();
    expect(h.session.voiceInterim).toBe("");
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice", "Pay supplier"]);
    expect(brief(h)).toEqual([["delete the task", WHICH_TASK, true, false]]);
    await h.act(() => { vi.advanceTimersByTime(20_000); });
    expect(h.log).toHaveLength(1);
    expect(labels(h)).toContain("Check invoice");
    expect(aiCalls()).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe(`T5081 — (4) an AI reply that lands after a stop is dropped, and a stop empties the queue however it was given (${runningAgainst()})`, () => {
  it.each(["spoken", "button"] as const)("a %s stop while an AI call runs with commands queued: the queue is emptied, the queued commands never run, and the reply is “ignored — you said stop”", async (how) => {
    const ai = heldAi();
    const h = await mountSession({ initial: threeTasks() });
    await micOn(h);
    const first = await startCommand(h, "make it pretty");
    await h.typed("delete Receive order");        // grammar — would run from the queue
    await h.typed("I want a fresh start");        // unparseable — would be a second AI call
    expect(h.session.voiceQueueRef.current).toEqual(["delete Receive order", "I want a fresh start"]);

    if (how === "spoken") await hear(h, "stop");
    else await h.act(() => h.session.toggleAbraListening());
    expect(h.session.voiceQueueRef.current).toEqual([]);
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);

    ai.holding = false;
    await h.act(async () => { ai.release(AUDIT_TRAIL); await first.done; });
    await h.act(() => undefined);
    expect(ai.calls, "the queued AI command never asked").toHaveLength(1);
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice", "Pay supplier"]);
    expect(brief(h)).toEqual([
      ["delete Receive order", WAITING, true, null],
      ["I want a fresh start", WAITING, true, null],
      ["make it pretty", IGNORED, false, true],
    ]);
    expect(h.session.voiceBusy).toBe(false);
  });

  it("a stop while the reply is being READ (the fetch answered, its JSON not yet) is caught too — nothing applied, “ignored — you said stop”", async () => {
    let releaseJson!: (v: unknown) => void;
    const json = new Promise<unknown>((r) => { releaseJson = r; });
    let jsonAsked = false;
    class HeldJson extends Response {
      override async json(): Promise<unknown> { jsonAsked = true; return json; }
    }
    const fetched = stubFetch(() => new HeldJson("{}", { status: 200, headers: { "Content-Type": "application/json" } }));
    const h = await mountSession({ initial: threeTasks() });
    const first = await startCommand(h, "make it pretty");
    expect(jsonAsked, "the call is past the fetch, reading the reply").toBe(true);
    await h.typed("stop");
    await h.act(async () => { releaseJson(AUDIT_TRAIL); await first.done; });
    expect(labels(h)).not.toContain("Audit trail");
    expect(brief(h)).toEqual([
      ["stop", "stopped listening", true, null],
      ["make it pretty", IGNORED, false, true],
    ]);
    expect(aiCalls(fetched)).toHaveLength(1);
    expect(canUndo(h)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe(`T5081 — (a) a diagram switch drops an AI reply still on its way (${runningAgainst()})`, () => {
  it("the reply that lands after the switch is NOT applied, the command queued behind it never runs, and the old diagram's lines are gone — dropped SILENTLY (nobody said stop)", async () => {
    const ai = heldAi();
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("delete Pay supplier");         // a line on the old diagram
    const first = await startCommand(h, "make it pretty");
    await h.typed("delete Receive order");        // queued behind the call
    expect(h.session.voiceQueueRef.current).toEqual(["delete Receive order"]);
    expect(h.log).toHaveLength(2);

    await h.rerender({ diagramId: "diagram-2" });
    expect(h.log).toEqual([]);
    expect(h.session.voiceQueueRef.current).toEqual([]);

    ai.holding = false;
    await h.act(async () => { ai.release(AUDIT_TRAIL); await first.done; });
    await h.act(() => undefined);
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice"]);
    // A switch is not a stop: the reply for the old diagram is dropped without
    // a line — the new diagram's log stays empty (2026-09-29).
    expect(brief(h)).toEqual([]);
    expect(ai.calls).toHaveLength(1);
    expect(h.session.voiceBusy).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe(`T5081 — (b) “connecting…” never outlives the start that raised it (${runningAgainst()})`, () => {
  it("the engine's onEnd while still connecting clears “connecting” and “listening”", async () => {
    const h = await mountSession({ initial: threeTasks() });
    fakeDictation.holdStarts = true;
    await h.act(() => { void h.session.toggleAbraListening(); });
    const s = fakeDictation.current;
    expect(h.session.abraConnecting).toBe(true);
    expect(h.session.voiceListening).toBe(true);
    await h.act(() => s.cb.onEnd?.());
    expect(h.session.abraConnecting).toBe(false);
    expect(h.session.voiceListening).toBe(false);
    // The start then fails: still nothing up.
    await h.act(() => s.resolve(null));
    expect(h.session.abraConnecting).toBe(false);
    expect(h.session.voiceListening).toBe(false);
  });

  it("stopped while connecting, the late handle is stopped when it lands and “connecting” stays off", async () => {
    const h = await mountSession({ initial: threeTasks() });
    fakeDictation.holdStarts = true;
    await h.act(() => { void h.session.toggleAbraListening(); });
    const s = fakeDictation.current;
    expect(h.session.abraConnecting).toBe(true);
    await h.act(() => h.session.toggleAbraListening());     // the stop, while it connects
    expect(h.session.abraConnecting).toBe(false);
    await h.act(() => s.resolve(s.handle));
    expect(s.stopped).toBe(true);
    expect(h.session.abraConnecting).toBe(false);
    expect(h.session.voiceListening).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("T5081 — (c) the per-diagram Voice Assist key is no longer written", () => {
  it("neither the editor nor the voice session writes (or names) `voice-assist-${diagramId}` — it was never read", () => {
    const src = editorSource();
    expect(src).not.toContain("voice-assist-${diagramId}");
    expect(src).not.toMatch(/localStorage\.setItem\(\s*`voice-assist-/);
    // The button and the bar's close still switch Voice Assist, without it.
    expect(src).toContain("setVoiceAssistOn((prev) => !prev);");
    expect(src).toContain("onClose={() => { stopAbraListening(); setVoiceAssistOn(false); }}");
  });
});
