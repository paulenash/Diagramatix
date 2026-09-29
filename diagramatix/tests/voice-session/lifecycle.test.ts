/**
 * Stage 4 of mobile voice — the voice session's LIFECYCLE, and the debug
 * recording / gold flash wiring, pinned as behaviour before the block moves
 * out of DiagramEditor.tsx into app/hooks/useVoiceSession.ts (and checked,
 * unchanged, after — the harness runs whichever text exists).
 *
 * T5075 — what a new diagram id resets: since Paul's ruling of 2026-09-29,
 * EVERYTHING of the old diagram (the confirmation, the "which one?", the
 * boundary follow-up, the rename, message, divider and template flows, the
 * queue, the buffer — discarded, not run — an AI reply still on its way, the
 * mic, "connecting", and the command log, cleared); Voice Assist switched
 * off, and unmount.
 *
 * T5076 — one apply, one log line carrying its ops; the debug recording's
 * snapshot + "touched" on every command, a queued one included (the settle
 * effect runs before the drain effect); the gold flash's runId.
 *
 * Tests named "CURRENT:" pin a quirk of today's code ON PURPOSE: the move is
 * unedited, so the quirk moves with it. Fixing one is a separate, deliberate
 * change that updates its test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});
// Every apply is one call into the apply layer: a spy around the real one
// counts them (T5076). Behaviour is unchanged — it calls straight through.
vi.mock("@/app/lib/assist/applyAssistOps", async (orig) => {
  const real = await orig<typeof import("@/app/lib/assist/applyAssistOps")>();
  return { ...real, applyAssistOps: vi.fn(real.applyAssistOps) };
});

import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { applyAssistOps as applyAssistOpsSpy } from "@/app/lib/assist/applyAssistOps";
import { GOLD_FLASH_KEY } from "@/app/lib/assist/goldFlash";
import { VOICE_DEBUG_KEY } from "@/app/lib/assist/voiceDebug";
import type { DebugSnapshot } from "@/app/lib/assist/debugSessionFile";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const applies = vi.mocked(applyAssistOpsSpy);

/** What the AI route answers — per test; a function may return a Promise it resolves later. */
let aiReply: (body: { instruction: string }) => unknown;
let fetchCalls: { url: string; body: unknown }[] = [];
let win: ReturnType<typeof stubWindow>;

beforeEach(() => {
  fakeDictation.reset();
  applies.mockClear();
  win = stubWindow();
  aiReply = () => ({ ops: [] });
  fetchCalls = stubFetch((url, body) => (url === "/api/ai/command" ? aiReply(body as { instruction: string }) : {}));
});
afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
const aiInstructions = () => fetchCalls.filter((c) => c.url === "/api/ai/command").map((c) => (c.body as { instruction: string }).instruction);
const el = (h: Mounted, id: string) => h.data.elements.find((e) => e.id === id);
const snapshots = (h: Mounted) => h.session.debugSnapshots as DebugSnapshot[];
const roleOf = (s: DebugSnapshot) => (s.diagramJson as unknown as { _voiceDebug: { role: string } })._voiceDebug.role;
/** A few more rounds of act, for an async command that finished outside h.act (the AI reply, then the drain). */
const settleMore = async (h: Mounted, rounds = 3) => { for (let i = 0; i < rounds; i++) await h.act(() => {}); };
/** A reply the test releases when it chooses — the AI call "in flight". */
function deferred() {
  let release!: (v: unknown) => void;
  const promise = new Promise<unknown>((r) => { release = r; });
  return { promise, release };
}

/** threeTasks, plus a second lane (so there is a divider) and a second pool (so "the pool" is ambiguous and a message has somewhere to go). */
function twoLanesTwoPools(): DiagramData {
  const d = threeTasks();
  d.elements.find((e) => e.id === "lane1")!.height = 125;
  for (const e of d.elements) if (e.type === "task") e.y = 30;
  d.elements.push(
    { id: "lane2", type: "lane", x: 30, y: 125, width: 870, height: 125, label: "Manager", parentId: "pool1", properties: {} } as unknown as DiagramElement,
    { id: "t4", type: "task", x: 320, y: 150, width: 120, height: 70, label: "Approve", parentId: "lane2", properties: {} } as unknown as DiagramElement,
    { id: "pool2", type: "pool", x: 0, y: 350, width: 900, height: 150, label: "Supplier", properties: { poolType: "black-box" } } as unknown as DiagramElement,
  );
  return d;
}

/** Voice Assist on and the (fake) mic open and connected. */
async function micOn(h: Mounted) {
  await h.act(() => h.session.setVoiceAssistOn(true));
  await h.act(() => h.session.toggleAbraListening());
  expect(h.session.voiceListening).toBe(true);
  expect(fakeDictation.current.stopped).toBe(false);
}

describe("T5075 — the session's lifecycle: a new diagram, Voice Assist off, unmount", () => {
  it("a new diagram switches Voice Assist off and drops a parked confirmation — the “yes” after it goes to the AI and clears nothing", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.act(() => h.session.setVoiceAssistOn(true));
    await h.typed("clear the diagram");
    expect(h.lastLine).toMatchObject({ heard: "clear the diagram", summary: "clear the whole diagram (5 elements)? — say “yes” to confirm", ok: true });
    expect(h.session.pendingConfirmRef.current).toEqual({ ops: [{ op: "clear" }], what: "clear the whole diagram (5 elements)", viaAi: false });

    await h.rerender({ diagramId: "diagram-2" });
    expect(h.session.voiceAssistOn).toBe(false);
    expect(h.session.pendingConfirmRef.current).toBeNull();

    await h.typed("yes");
    expect(aiInstructions()).toEqual(["yes"]);
    expect(h.lastLine).toMatchObject({ heard: "yes", summary: "didn’t understand that", ok: false, viaAi: true });
    expect(h.data.elements).toHaveLength(5);
    expect(applies).not.toHaveBeenCalled();
  });

  it("a new diagram drops an open “which one?” — the number after it is not an answer and moves nothing", async () => {
    const h = await mountSession({ initial: twoLanesTwoPools() });
    await h.typed("nudge pool down");
    expect(h.lastLine?.summary).toBe("which “the pool”? say a number (1–2), or “cancel”");
    expect(h.session.pickFlow).toMatchObject({ ref: "the pool", ops: [{ op: "nudgePool", direction: "down", ref: "the pool" }] });

    await h.rerender({ diagramId: "diagram-2" });
    expect(h.session.pickFlow).toBeNull();

    await h.typed("1");
    expect(aiInstructions()).toEqual(["1"]);
    expect(h.lastLine).toMatchObject({ heard: "1", summary: "didn’t understand that", ok: false, viaAi: true });
    expect([el(h, "pool1")!.y, el(h, "pool2")!.y]).toEqual([0, 350]);
  });

  it("a new diagram forgets a boundary command's follow-up — “sixty pixels” is the AI's to read, not another move", async () => {
    const h = await mountSession({ initial: threeTasks() });
    // Control: on the same diagram the follow-up is read locally, without the AI.
    await h.typed("move the pool right boundary right");
    expect(h.lastLine?.summary).toBe("moved Company's right boundary right 20px");
    await h.typed("sixty pixels");
    expect(h.lastLine?.summary).toBe("moved Company's right boundary right 40px (60px right in all)");
    expect(el(h, "pool1")!.width).toBe(960);
    expect(aiInstructions()).toEqual([]);

    await h.typed("move the pool right boundary right");
    expect(el(h, "pool1")!.width).toBe(980);
    await h.rerender({ diagramId: "diagram-2" });
    await h.typed("sixty pixels");
    expect(aiInstructions()).toEqual(["sixty pixels"]);
    expect(h.lastLine).toMatchObject({ heard: "sixty pixels", summary: "didn’t understand that", ok: false, viaAi: true });
    expect(el(h, "pool1")!.width).toBe(980);
  });

  // Paul's ruling, 2026-09-29 (a): a diagram switch ends every numbered flow
  // of the old diagram — its numbers were taken from a diagram that is gone.
  // (The harness keeps the old diagram's data across the rerender, so "1"
  // below WOULD still name the same task had the flow survived.)
  it("a new diagram closes the guided rename — the next answer is no answer: it goes to the AI and renames nothing", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("rename tasks");
    expect(h.session.renameFlow).toMatchObject({ phase: "pick", itemType: "task" });

    await h.rerender({ diagramId: "diagram-2" });
    expect(h.session.renameFlow).toBeNull();
    expect(h.session.onScreenBadges ?? null).toBeNull();

    await h.typed("1 Book order");
    expect(el(h, "t1")!.label).toBe("Receive order");
    expect(h.data.elements.some((e) => e.label === "Book order")).toBe(false);
    expect(aiInstructions()).toEqual(["1 Book order"]);
    expect(h.log.map((l) => [l.heard, l.ok, l.viaAi])).toEqual([["1 Book order", false, true]]);
  });

  it("a new diagram closes “move dividers” — its next answer moves no divider", async () => {
    const h = await mountSession({ initial: twoLanesTwoPools() });
    await h.typed("move dividers");
    expect(h.session.dividerFlow).toMatchObject({ order: ["divider:lane1|lane2"] });

    await h.rerender({ diagramId: "diagram-2" });
    expect(h.session.dividerFlow).toBeNull();

    await h.typed("1 down 20 pixels");
    expect(el(h, "lane2")!.y).toBe(125);
    expect(h.log.some((l) => l.summary.startsWith("1 → moved"))).toBe(false);
    // With nothing open, "done" is the flow word with nothing to close.
    await h.typed("done");
    expect(h.lastLine).toMatchObject({ heard: "done", summary: "cleared — listening for the next command", ok: true });
  });

  it("a new diagram closes the numbered message pick and clears the command log — the old diagram's lines go with it", async () => {
    const h = await mountSession({ initial: twoLanesTwoPools() });
    await h.typed("delete Approve");
    await h.typed("add a message");
    expect(h.session.messageFlow).toMatchObject({ mode: "pair" });
    expect(h.log).toHaveLength(2);

    await h.rerender({ diagramId: "diagram-2" });
    expect(h.session.messageFlow).toBeNull();
    expect(h.log).toEqual([]);

    // Nothing is open, so "done" closes nothing — and costs no AI call.
    await h.typed("done");
    expect(h.log.map((l) => [l.heard, l.summary, l.ok])).toEqual([["done", "cleared — listening for the next command", true]]);
    expect(h.session.messageFlow).toBeNull();
    expect(aiInstructions()).toEqual([]);
  });

  // Paul's ruling, 2026-09-29 (a): the buffer is the old diagram's. The reset
  // empties it BEFORE it stops the recogniser (whose stop fires onEnd and
  // force-flushes), so a half-heard command is dropped with the old diagram.
  it("with the mic on, a new diagram stops it and DISCARDS the fragment still in the buffer — it never runs", async () => {
    fakeTimers();
    const h = await mountSession({ initial: threeTasks() });
    await micOn(h);
    await h.act(() => fakeDictation.current.cb.onText("delete Pay supplier"));
    expect(h.session.voiceInterim).toBe("delete Pay supplier");
    expect(h.log).toHaveLength(0);

    await h.rerender({ diagramId: "diagram-2" });
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);
    expect(h.session.abraConnecting).toBe(false);
    expect(h.session.voiceAssistOn).toBe(false);
    expect(h.session.voiceInterim).toBe("");
    expect(h.log).toEqual([]);
    expect(el(h, "t3")!.label).toBe("Pay supplier");
    // Its silence timer went with it: the fragment does not run later either.
    await h.act(() => { vi.advanceTimersByTime(20_000); });
    expect(h.log).toEqual([]);
    expect(el(h, "t3")!.label).toBe("Pay supplier");
    expect(aiInstructions()).toEqual([]);
  });

  // Paul's ruling, 2026-09-29 (a) with (1): the parked confirmation and the
  // buffer are both dropped BEFORE the recogniser stops, so a buffered "yes"
  // can never answer "clear the diagram?" on the way out.
  it("a new diagram drops a waiting “clear the diagram?” before a buffered “yes” can answer it — nothing is cleared, and the log starts empty", async () => {
    fakeTimers();
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("clear the diagram");
    await micOn(h);
    await h.act(() => fakeDictation.current.cb.onText("yes"));
    expect(h.data.elements).toHaveLength(5);

    await h.rerender({ diagramId: "diagram-2" });
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.data.elements).toHaveLength(5);
    expect(h.session.pendingConfirmRef.current).toBeNull();
    expect(h.log).toEqual([]);
    await h.act(() => { vi.advanceTimersByTime(20_000); });
    expect(h.data.elements).toHaveLength(5);
    expect(h.log).toEqual([]);
    expect(applies).not.toHaveBeenCalled();
    expect(aiInstructions()).toEqual([]);
  });

  it("turning Voice Assist off with the mic on stops the recogniser and closes the open flow; the 2-minute idle close is disarmed", async () => {
    fakeTimers();
    const h = await mountSession({ initial: threeTasks() });
    await micOn(h);
    await h.typed("rename tasks");
    expect(h.session.renameFlow).toMatchObject({ phase: "pick" });

    await h.act(() => h.session.setVoiceAssistOn(false));
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);
    expect(h.session.abraConnecting).toBe(false);
    expect(h.session.renameFlow).toBeNull();
    expect(h.log).toHaveLength(1);               // closing the flow on stop writes no line

    await h.act(() => { vi.advanceTimersByTime(120_000); });
    expect(h.log).toHaveLength(1);               // no "Voice Assist closed — 2 minutes idle"
    expect(fakeDictation.sessions).toHaveLength(1);
  });

  // The order stopAbraListening keeps (restated by Paul's ruling, 2026-09-29:
  // "a name still buffered for an open rename is read first"): only a
  // QUESTION's buffered answer is discarded before the recogniser stops. The
  // recogniser's stop() fires onEnd synchronously, and onEnd force-flushes —
  // so the buffer runs INSIDE stop(), while the rename flow is still open, and
  // the flow reads it as its answer; the flows close after.
  it("turning Voice Assist off with a fragment buffered — the recogniser's own onEnd flushes it BEFORE the flows close, so the open rename flow reads it", async () => {
    fakeTimers();
    const h = await mountSession({ initial: threeTasks() });
    await micOn(h);
    await h.typed("rename tasks");
    // No number in it, so the rename pick does not flush it at once: it sits in the buffer.
    await h.act(() => fakeDictation.current.cb.onText("delete Pay supplier"));
    expect(h.session.voiceInterim).toBe("delete Pay supplier");
    expect(h.log).toHaveLength(1);

    await h.act(() => h.session.setVoiceAssistOn(false));
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.renameFlow).toBeNull();
    expect(h.log).toHaveLength(2);
    expect(h.lastLine).toMatchObject({ heard: "delete Pay supplier", summary: "say the number of the item to rename", ok: false });
    expect(el(h, "t3")!.label).toBe("Pay supplier");   // not run as a command
    expect(aiInstructions()).toEqual([]);
  });

  // CURRENT (quirk kept deliberately by the move): the off-effect stops only a
  // handle it already holds. One still arriving (token, permission, socket)
  // is taken up when it lands — voiceStopRequested was never set — so the mic
  // goes live with Voice Assist off, and says "listening" until the 2-minute
  // idle close shuts it.
  it("CURRENT: turning Voice Assist off while the recogniser is still connecting does not stop it — the late handle goes live until the 2-minute idle close", async () => {
    fakeTimers();
    fakeDictation.holdStarts = true;
    const h = await mountSession({ initial: threeTasks() });
    await h.act(() => h.session.setVoiceAssistOn(true));
    await h.act(() => { void h.session.toggleAbraListening(); });
    expect(h.session.abraConnecting).toBe(true);

    await h.act(() => h.session.setVoiceAssistOn(false));
    await h.act(() => fakeDictation.current.resolve(fakeDictation.current.handle));
    expect(h.session.voiceAssistOn).toBe(false);
    expect(fakeDictation.current.stopped).toBe(false);
    expect(h.session.voiceListening).toBe(true);

    await h.act(() => { vi.advanceTimersByTime(119_999); });
    expect(fakeDictation.current.stopped).toBe(false);
    await h.act(() => { vi.advanceTimersByTime(1); });
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);
    expect(h.lastLine).toMatchObject({ heard: "", summary: "Voice Assist closed — 2 minutes idle", ok: true });
  });

  it("unmounting with the mic on stops the recogniser", async () => {
    fakeTimers();
    const h = await mountSession({ initial: threeTasks() });
    await micOn(h);
    await h.unmount();
    expect(fakeDictation.current.stopped).toBe(true);
    expect(fakeDictation.sessions).toHaveLength(1);
  });

  // CURRENT (quirk kept deliberately by the move): the unmount effect stops
  // only a handle it holds; a start still in flight lands after it, is kept
  // (voiceStopRequested was never set) and runs until the idle timer fires.
  it("CURRENT: unmounting while the recogniser is still connecting leaves the late handle running until the 2-minute idle close", async () => {
    fakeTimers();
    fakeDictation.holdStarts = true;
    const h = await mountSession({ initial: threeTasks() });
    await h.act(() => { void h.session.toggleAbraListening(); });
    await h.unmount();
    expect(fakeDictation.current.stopped).toBe(false);

    // The late handle lands, and the start's continuation runs to its end — a
    // whole macrotask, not a count of microtasks — before anything is read.
    await h.act(async () => {
      fakeDictation.current.resolve(fakeDictation.current.handle);
      await new Promise((r) => setImmediate(r));
    });
    expect(fakeDictation.current.stopped).toBe(false);
    await h.act(() => { vi.advanceTimersByTime(120_000); });
    expect(fakeDictation.current.stopped).toBe(true);
  });
});

describe("T5076 — the debug recording and the gold flash are wired to every apply", () => {
  it("one apply, one log line carrying its ops — across plain, repeated, confirmed-away, picked, guided, AI and queued commands", async () => {
    const inFlight = deferred();
    let aiCalls = 0;
    aiReply = () => (++aiCalls === 1 ? inFlight.promise : { ops: [] });
    const h = await mountSession({ initial: twoLanesTwoPools() });

    await h.typed("again");                         // nothing to repeat: refused before any apply
    await h.typed("nudge Check invoice right");      // apply
    await h.typed("again");                         // apply (the nudge, expanded)
    await h.typed("clear the diagram");              // parked: no apply
    await h.typed("no");                            // cancelled: no apply
    await h.typed("nudge pool down");                // apply — it parks the pick
    await h.typed("2");                             // apply — the parked command, re-run
    await h.typed("rename tasks");                   // apply — opens the guided rename
    await h.typed("1 Book order");                   // the guided rename writes the label itself: no apply
    await h.typed("done");
    await h.act(() => { void h.session.runVoiceCommand("shove approval along a bit"); }); // AI, in flight
    await h.typed("delete Pay supplier");            // queued behind it
    await h.act(async () => { inFlight.release({ canonical: "nudge Approve right" }); }); // apply, then the drain's apply
    await settleMore(h);
    await h.typed("undo");                          // apply
    await h.typed("make it look nicer");             // AI answers nothing: no apply

    expect(h.log.map((l) => [l.heard, l.summary, !!l.ops])).toEqual([
      ["again", "nothing to repeat yet", false],
      ["nudge Check invoice right", "nudged Check invoice right 20px", true],
      ["again", "nudged Check invoice right 20px", true],
      ["clear the diagram", "clear the whole diagram (8 elements)? — say “yes” to confirm", false],
      ["no", "cancelled — did not clear the whole diagram (8 elements)", false],
      ["nudge pool down", "which “the pool”? say a number (1–2), or “cancel”", true],
      ["2", "2 → nudged Supplier down 20px", true],
      ["rename tasks", "pick a task by number, then say the new name — “cancel” to stop, “done” when finished", true],
      ["Book order", "renamed to “Book order” — pick another or say “done”", false],
      ["", "rename finished", false],
      ["delete Pay supplier", "waiting for the previous command…", false],
      ["shove approval along a bit", "“nudge Approve right” → nudged Approve right 20px", true],
      ["delete Pay supplier", "deleted Pay supplier", true],
      ["undo", "undid the last change", true],
      ["make it look nicer", "didn’t understand that", false],
    ]);
    // Exactly one apply per line with ops, in order, each line carrying the ops that apply ran.
    expect(applies).toHaveBeenCalledTimes(8);
    expect(h.log.filter((l) => l.ops).map((l) => l.ops)).toEqual(applies.mock.calls.map((c) => c[0]));
    expect(aiInstructions()).toEqual(["shove approval along a bit", "make it look nicer"]);
  });

  it("debug recording is off by default: no snapshot, no “touched”, nothing saved", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.act(() => h.session.setVoiceAssistOn(true));
    expect(h.session.voiceDebugRecording).toBe(false);
    await h.typed("nudge Check invoice right");
    await h.typed("delete Pay supplier");
    expect(h.log.every((l) => l.snapshotId === undefined && l.touched === undefined)).toBe(true);
    expect(snapshots(h)).toEqual([]);
  });

  it("debug recording on from localStorage at mount: a queued command's line gets its OWN after-snapshot and its own “touched” — the command before it settled first", async () => {
    win.localStorage.setItem(VOICE_DEBUG_KEY, "true");
    const inFlight = deferred();
    aiReply = () => inFlight.promise;
    const h = await mountSession({ initial: threeTasks() });
    expect(h.session.voiceDebugRecording).toBe(true);

    await h.act(() => { void h.session.runVoiceCommand("shove the invoice check along a bit"); });
    expect(h.session.voiceBusy).toBe(true);
    await h.typed("delete Pay supplier");
    expect(h.session.voiceQueueRef.current).toEqual(["delete Pay supplier"]);
    await h.act(async () => { inFlight.release({ canonical: "nudge Check invoice right" }); });
    await settleMore(h);
    expect(h.session.voiceQueueRef.current).toEqual([]);

    const [waiting, ai, queued] = h.log;
    expect(h.log).toHaveLength(3);
    expect(waiting).toMatchObject({ heard: "delete Pay supplier", summary: "waiting for the previous command…" });
    expect(waiting.snapshotId).toBeUndefined();
    expect(waiting.touched).toBeUndefined();
    expect(ai).toMatchObject({ summary: "“nudge Check invoice right” → nudged Check invoice right 20px", viaAi: true });
    expect(queued).toMatchObject({ heard: "delete Pay supplier", summary: "deleted Pay supplier" });

    // Each command its own "after", tied to its own line.
    expect(ai.snapshotId).toBeTruthy();
    expect(queued.snapshotId).toBeTruthy();
    expect(queued.snapshotId).not.toBe(ai.snapshotId);
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([
      ["before", ai.id],
      ["after", ai.id],
      ["after", queued.id],
    ]);
    expect(snapshots(h)[1].id).toBe(ai.snapshotId);
    expect(snapshots(h)[2].id).toBe(queued.snapshotId);
    expect(snapshots(h)[2].elementCount).toBe(4);

    // Each command its own "touched": the nudge moved Check invoice; the queued delete only deleted Pay supplier.
    expect(ai.touched).toEqual(expect.arrayContaining([{ id: "t2", type: "task", label: "Check invoice", changes: ["moved"] }]));
    expect(ai.touched!.some((t) => t.id === "t3")).toBe(false);
    expect(queued.touched).toEqual([{ id: "t3", type: "task", label: "Pay supplier", changes: ["deleted"] }]);
  });

  it("debug recording switched on mid-session: the open bar saves a “start”, and a command's line gets its after-snapshot and what it touched", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.act(() => h.session.setVoiceDebugRecording(true));
    expect(snapshots(h)).toEqual([]);            // the "start" waits for the bar
    await h.act(() => h.session.setVoiceAssistOn(true));
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([["start", null]]);

    await h.typed("add task Foo after Check invoice");
    const line = h.lastLine!;
    const foo = h.data.elements.find((e) => e.label === "Foo")!;
    expect(foo).toBeDefined();
    // The "before" is the start just saved — the same diagram, so not saved twice.
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([["start", null], ["after", line.id]]);
    expect(line.snapshotId).toBe(snapshots(h)[1].id);
    expect(line.touched).toEqual(expect.arrayContaining([{ id: foo.id, type: "task", label: "Foo", changes: ["added"] }]));
  });

  it("the bar's clear with debug recording on starts the recording afresh: the lines and their snapshots go, and a new “start” is saved (the debugEpoch wake); with the bar closed a clear saves nothing", async () => {
    win.localStorage.setItem(VOICE_DEBUG_KEY, "true");
    const h = await mountSession({ initial: threeTasks() });
    await h.act(() => h.session.setVoiceAssistOn(true));
    const firstStart = snapshots(h)[0];
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([["start", null]]);
    await h.typed("delete Pay supplier");
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([["start", null], ["after", h.lastLine!.id]]);

    await h.act(() => h.session.clearVoiceLog());
    expect(h.log).toEqual([]);
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([["start", null]]);
    expect(snapshots(h)[0].id).not.toBe(firstStart.id);
    expect(snapshots(h)[0].elementCount).toBe(4);   // the diagram as it is now, after the delete

    // The next command's "before" is that new start — the same diagram, not saved twice.
    await h.typed("nudge Check invoice right");
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([["start", null], ["after", h.lastLine!.id]]);

    await h.act(() => h.session.setVoiceAssistOn(false));
    await h.act(() => h.session.clearVoiceLog());
    expect(h.log).toEqual([]);
    expect(snapshots(h)).toEqual([]);
  });

  // CURRENT (quirk kept deliberately by the move): the settle effect is keyed
  // on the log too, so a command that changed nothing still clears ITS arm —
  // but the "touched" effect is keyed on the elements alone, so its arm waits,
  // and the next change the mouse makes is written onto the failed command's line.
  it("CURRENT: with debug on, a command that changed nothing gets its before-snapshot and clears its settle arm — but its “touched” stays armed and the next mouse edit lands on its line", async () => {
    win.localStorage.setItem(VOICE_DEBUG_KEY, "true");
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("nudge Nothing here right");
    const line = h.lastLine!;
    expect(line.ok).toBe(false);
    expect(snapshots(h).map((s) => [roleOf(s), s.entryId])).toEqual([["before", line.id]]);
    expect(line.snapshotId).toBe(snapshots(h)[0].id);
    expect(line.touched).toBeUndefined();

    await h.act(() => h.d.updateLabel("t1", "Take order"));
    expect(snapshots(h)).toHaveLength(1);        // no "after" saved for the mouse's edit
    expect(h.lastLine!.id).toBe(line.id);
    // (the reducer also refits the renamed task, hence more than "renamed")
    expect(h.lastLine!.touched).toEqual([expect.objectContaining({ id: "t1", type: "task", label: "Take order", changes: expect.arrayContaining(["renamed"]) })]);
  });

  it("the gold flash is on by default: a move and an add each advance runId and outline what changed; a delete does not flash", async () => {
    const h = await mountSession({ initial: threeTasks() });
    expect(h.session.goldFlash).toEqual({ runId: 0, targets: [] });

    await h.typed("nudge Check invoice right");
    expect(h.session.goldFlash.runId).toBe(1);
    expect(h.session.goldFlash.targets).toEqual(expect.arrayContaining([expect.objectContaining({ id: "t2", label: "Check invoice", x: 340 })]));

    await h.typed("add task Foo after Check invoice");
    const foo = h.data.elements.find((e) => e.label === "Foo")!;
    expect(h.session.goldFlash.runId).toBe(2);
    // An add outlines only what was added, not what moved aside for it.
    expect(h.session.goldFlash.targets).toEqual([expect.objectContaining({ id: foo.id, label: "Foo" })]);

    await h.typed("delete Pay supplier");
    expect(h.lastLine?.summary).toBe("deleted Pay supplier");
    expect(h.session.goldFlash.runId).toBe(2);
  });

  it("“turn off gold flashing” is remembered and stops the next move flashing; the toggle works inside a guided rename, whose rename flashes its item", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("turn off gold flashing");
    expect(h.lastLine?.summary).toBe("gold flashing off");
    expect(win.localStorage.getItem(GOLD_FLASH_KEY)).toBe("false");
    await h.typed("nudge Check invoice right");
    expect(h.lastLine?.summary).toBe("nudged Check invoice right 20px");
    expect(h.session.goldFlash.runId).toBe(0);

    await h.typed("rename tasks");
    await h.typed("turn on gold flashing");      // not taken as a pick answer
    expect(h.lastLine?.summary).toBe("gold flashing on — added, enclosed and moved items will flash");
    expect(win.localStorage.getItem(GOLD_FLASH_KEY)).toBe("true");
    expect(h.session.renameFlow).toMatchObject({ phase: "pick", itemType: "task" });
    expect(h.session.goldFlash.runId).toBe(0);

    await h.typed("1 Book order");
    expect(h.session.goldFlash.runId).toBe(1);
    expect(h.session.goldFlash.targets).toEqual([expect.objectContaining({ id: "t1", label: "Book order" })]);
  });

  // CURRENT (quirk kept deliberately by the move): the flash is armed before
  // the ops run and disarmed only by an elements change — a flashing command
  // that changed nothing leaves it armed for the next edit, whoever makes it.
  it("CURRENT: a flashing command that changed nothing leaves the flash armed — the next mouse edit flashes", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("nudge Nothing here right");
    expect(h.lastLine?.ok).toBe(false);
    expect(h.session.goldFlash.runId).toBe(0);

    await h.act(() => h.d.updateLabel("t1", "Take order"));
    expect(h.session.goldFlash.runId).toBe(1);
    expect(h.session.goldFlash.targets).toEqual([expect.objectContaining({ id: "t1", label: "Take order" })]);

    // Once only: the arm was spent.
    await h.act(() => h.d.updateLabel("t2", "Check bill"));
    expect(h.session.goldFlash.runId).toBe(1);
  });
});
