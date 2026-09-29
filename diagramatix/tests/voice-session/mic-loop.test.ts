/**
 * Stage 4 of mobile voice — the MICROPHONE / FRAGMENT LOOP of the Voice Assist
 * session, pinned by behaviour before the block moves out of DiagramEditor.tsx
 * (and checked, unchanged, after): toggleAbraListening, the onText buffer,
 * flushVoiceBuffer, stopAbraListening and bumpAbraIdle, driven through the fake
 * recogniser (fakeDictation.ts) under fake timers.
 *
 * Tests named "CURRENT:" pin a known quirk ON PURPOSE: the move is a move, not
 * a fix, so today's behaviour is what the moved hook must reproduce. Change one
 * only when the quirk itself is fixed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { runningAgainst } from "./loadVoiceSession";
import { FRAGMENT_SILENCE_MS, FRAGMENT_CONTINUE_MS, FRAGMENT_MAX_WAITS } from "@/app/lib/assist/fragmentBuffer";
import { notUnderstoodMessage } from "@/app/lib/assist/refMentions";

/** The block's own `const ABRA_IDLE_MS = 120000;` — local to the block, so restated here. */
const ABRA_IDLE_MS = 120000;
/** How long an unfinished command is held in all: the silence, then every continuation wait. */
const FULL_HOLD_MS = FRAGMENT_SILENCE_MS + FRAGMENT_MAX_WAITS * FRAGMENT_CONTINUE_MS;

let calls: { url: string; body: unknown }[] = [];

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  calls = stubFetch(() => ({ ops: [] }));
  // React's scheduler keeps its real timers (setImmediate / MessageChannel).
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

// ── local helpers ───────────────────────────────────────────────────────────

/** A session on threeTasks (unmounted by afterEach's unmountAll, if the test does not). */
const mount = (): Promise<Mounted> => mountSession({ initial: threeTasks() });
/** Let an AI round trip (fetch → json) finish: macrotask turns, which fake timers leave alone. */
async function drain(h: Mounted) {
  await h.act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); });
}
async function advance(h: Mounted, ms: number) {
  await h.act(() => { vi.advanceTimersByTime(ms); });
  await drain(h);
}
/** The mic button, with the recogniser connecting at once (holdStarts off). */
async function startMic(h: Mounted) { await h.act(() => h.session.toggleAbraListening()); }
/** A final from the current recogniser session. */
async function hear(h: Mounted, text: string) { await h.act(() => fakeDictation.current.cb.onText(text)); }
const labels = (h: Mounted) => h.data.elements.map((e) => e.label);
const aiCalls = () => calls.filter((c) => c.url === "/api/ai/command");
const renameFlow = (h: Mounted) => h.session.renameFlow as
  | { phase: "pick"; itemType: string; targets: { id: string; n: number }[] }
  | { phase: "name"; itemType: string; targetId: string; kind: string }
  | null;
const PICK_TASK_LINE = "pick a task by number, then say the new name — “cancel” to stop, “done” when finished";

// ── T5072 — the microphone: start, connect, idle, engine end ────────────────

describe(`T5072 — the microphone starts, connects, idles out and ends (${runningAgainst()})`, () => {
  it("the mic button starts ONE recogniser session biased to this diagram's names; listening, engine known, not connecting once ready", async () => {
    const h = await mount();
    expect(h.session.voiceListening).toBe(false);
    await startMic(h);
    expect(fakeDictation.sessions).toHaveLength(1);
    // diagramKeyterms over the labels: "Clerk" is too short alone; two-word names first.
    expect(fakeDictation.current.cb.keyterms).toEqual(["Receive order", "Check invoice", "Pay supplier", "Company"]);
    expect(h.session.voiceListening).toBe(true);
    expect(h.session.abraEngine).toBe("deepgram");
    expect(h.session.abraConnecting).toBe(false);
    expect(fakeDictation.current.stopped).toBe(false);
    expect(h.log).toHaveLength(0);
  });

  it("it says connecting from the press until the recogniser's onReady; the handle that arrives is the one the button stops", async () => {
    const h = await mount();
    fakeDictation.holdStarts = true;
    await h.act(() => { void h.session.toggleAbraListening(); });
    const s = fakeDictation.current;
    expect(h.session.voiceListening).toBe(true);
    expect(h.session.abraConnecting).toBe(true);
    expect(h.session.abraEngine).toBe(null);
    await h.act(() => { s.cb.onEngine?.("browser"); });
    expect(h.session.abraEngine).toBe("browser");
    expect(h.session.abraConnecting).toBe(true);
    await h.act(() => { s.cb.onReady?.(); s.resolve(s.handle); });
    expect(h.session.abraConnecting).toBe(false);
    expect(h.session.voiceListening).toBe(true);
    await h.act(() => h.session.toggleAbraListening());
    expect(s.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.sessions).toHaveLength(1);
  });

  it("CURRENT: a start that returns no handle clears listening but leaves 'connecting' on, and arms no idle clock (quirk kept deliberately by the move)", async () => {
    // Quirk kept deliberately by the move: the failed-start path never clears abraConnecting nor starts bumpAbraIdle.
    const h = await mount();
    fakeDictation.holdStarts = true;
    await h.act(() => { void h.session.toggleAbraListening(); });
    await h.act(() => { fakeDictation.current.resolve(null); });
    expect(h.session.voiceListening).toBe(false);
    // Quirk: only onReady or stopAbraListening clears it — a failed start does neither.
    expect(h.session.abraConnecting).toBe(true);
    await advance(h, ABRA_IDLE_MS + 1000);
    expect(h.log).toHaveLength(0);
    // The button starts afresh.
    fakeDictation.holdStarts = false;
    await startMic(h);
    expect(fakeDictation.sessions).toHaveLength(2);
    expect(h.session.voiceListening).toBe(true);
    expect(h.session.abraConnecting).toBe(false);
  });

  it("after ABRA_IDLE_MS with no speech the idle-close line is written and the mic stops — not a millisecond before", async () => {
    const h = await mount();
    await startMic(h);
    await advance(h, ABRA_IDLE_MS - 1);
    expect(h.log).toHaveLength(0);
    expect(h.session.voiceListening).toBe(true);
    await advance(h, 1);
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "", summary: "Voice Assist closed — 2 minutes idle", ok: true });
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.current.stopped).toBe(true);
    await advance(h, ABRA_IDLE_MS * 2);
    expect(h.log).toHaveLength(1);
  });

  it("speech re-arms the idle clock — an interim counts, and shows as the command building", async () => {
    const h = await mount();
    await startMic(h);
    await advance(h, 100000);
    await h.act(() => fakeDictation.current.cb.onInterim?.("hello there"));
    expect(h.session.voiceInterim).toBe("hello there");
    await advance(h, ABRA_IDLE_MS - 1);            // 219.999 s since the press, 119.999 s since the interim
    expect(h.log).toHaveLength(0);
    expect(h.session.voiceListening).toBe(true);
    await advance(h, 1);
    expect(h.lastLine?.summary).toBe("Voice Assist closed — 2 minutes idle");
    expect(h.session.voiceListening).toBe(false);
  });

  it("the engine ending on its own forces the buffer to run at once (no silence wait), and the button can start again", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "delete Pay supplier");
    expect(labels(h)).toContain("Pay supplier");
    await h.act(() => fakeDictation.current.cb.onEnd?.());
    expect(labels(h)).not.toContain("Pay supplier");
    expect(h.log).toHaveLength(1);
    expect(h.lastLine?.heard).toBe("delete Pay supplier");
    expect(h.session.voiceListening).toBe(false);
    expect(h.session.voiceInterim).toBe("");
    await advance(h, FRAGMENT_SILENCE_MS * 2);   // the silence timer was cancelled — it does not run twice
    expect(h.log).toHaveLength(1);
    await startMic(h);
    expect(fakeDictation.sessions).toHaveLength(2);
    expect(h.session.voiceListening).toBe(true);
  });

  it("CURRENT: after the engine ends on its own the idle clock is still armed — 2 minutes after the last speech the idle-close line appears anyway (quirk kept deliberately by the move)", async () => {
    // Quirk kept deliberately by the move: onEnd flushes but never clears voiceIdleTimer (only stopAbraListening does).
    const h = await mount();
    await startMic(h);
    await hear(h, "delete Pay supplier");
    await h.act(() => fakeDictation.current.cb.onEnd?.());
    expect(h.log).toHaveLength(1);
    await advance(h, ABRA_IDLE_MS - 1);
    expect(h.log).toHaveLength(1);
    await advance(h, 1);
    expect(h.log).toHaveLength(2);
    expect(h.lastLine).toMatchObject({ heard: "", summary: "Voice Assist closed — 2 minutes idle", ok: true });
  });

  it("a recogniser error is logged as a failed line and leaves the mic on", async () => {
    const h = await mount();
    await startMic(h);
    await h.act(() => fakeDictation.current.cb.onError?.("Microphone permission denied"));
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "", summary: "Microphone permission denied", ok: false });
    expect(h.session.voiceListening).toBe(true);
    expect(fakeDictation.current.stopped).toBe(false);
  });
});

// ── T5073 — the fragment buffer ─────────────────────────────────────────────

describe(`T5073 — spoken fragments are stitched into commands (${runningAgainst()})`, () => {
  it("finals less than FRAGMENT_SILENCE_MS apart are joined into ONE command, run exactly FRAGMENT_SILENCE_MS after the last; the interim shows it building", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "delete Pay");
    expect(h.session.voiceInterim).toBe("delete Pay");
    await advance(h, FRAGMENT_SILENCE_MS - 200);
    await h.act(() => fakeDictation.current.cb.onInterim?.("supp"));
    expect(h.session.voiceInterim).toBe("delete Pay supp");
    await hear(h, "supplier");
    expect(h.session.voiceInterim).toBe("delete Pay supplier");
    await advance(h, FRAGMENT_SILENCE_MS - 1);
    expect(h.log).toHaveLength(0);
    expect(labels(h)).toContain("Pay supplier");
    await advance(h, 1);
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "delete Pay supplier", ok: true });
    expect(labels(h)).not.toContain("Pay supplier");
    expect(h.session.voiceInterim).toBe("");
    expect(aiCalls()).toHaveLength(0);
  });

  it("finals more than FRAGMENT_SILENCE_MS apart are two commands, each run on its own silence", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "delete Pay supplier");
    await advance(h, FRAGMENT_SILENCE_MS);
    expect(h.log.map((l) => l.heard)).toEqual(["delete Pay supplier"]);
    await hear(h, "delete Check invoice");
    await advance(h, FRAGMENT_SILENCE_MS);
    expect(h.log.map((l) => l.heard)).toEqual(["delete Pay supplier", "delete Check invoice"]);
    expect(labels(h)).not.toContain("Check invoice");
    expect(labels(h)).toContain("Receive order");
  });

  it("an incomplete command ('rename … to') is held for FRAGMENT_MAX_WAITS × FRAGMENT_CONTINUE_MS past the silence; the next final completes it into ONE command", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "rename Pay supplier to");
    await advance(h, FULL_HOLD_MS - 1);           // the silence, then all but the last millisecond of the holds
    expect(h.log).toHaveLength(0);
    expect(aiCalls()).toHaveLength(0);
    expect(h.session.voiceInterim).toBe("rename Pay supplier to");
    await hear(h, "Settle invoice");
    await advance(h, FRAGMENT_SILENCE_MS);
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "rename Pay supplier to Settle invoice", ok: true });
    expect(labels(h)).toContain("Settle invoice");
    expect(labels(h)).not.toContain("Pay supplier");
    expect(aiCalls()).toHaveLength(0);
  });

  it("an incomplete command nobody finishes runs anyway once the hold budget is spent — here it reaches the AI fallback", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "rename Pay supplier to");
    await advance(h, FULL_HOLD_MS - 1);
    expect(aiCalls()).toHaveLength(0);
    await advance(h, 1);
    expect(aiCalls()).toHaveLength(1);
    expect(aiCalls()[0].body).toMatchObject({ instruction: "rename Pay supplier to" });
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({
      heard: "rename Pay supplier to", ok: false, viaAi: true,
      summary: notUnderstoodMessage("rename Pay supplier to", threeTasks().elements),
    });
    expect(labels(h)).toContain("Pay supplier");
  });

  it("a flow-end word during a hold with nothing open drops the half command: 'cleared — listening for the next command', no AI call, mic stays on", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "rename Pay supplier to");
    await advance(h, FRAGMENT_SILENCE_MS);        // now in the continuation hold
    await hear(h, "cancel");
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "cancel", summary: "cleared — listening for the next command", ok: true });
    expect(h.session.voiceInterim).toBe("");
    await advance(h, FULL_HOLD_MS * 2);          // the pending hold was cancelled, not merely outrun
    expect(h.log).toHaveLength(1);
    expect(aiCalls()).toHaveLength(0);
    expect(labels(h)).toContain("Pay supplier");
    expect(h.session.voiceListening).toBe(true);
    expect(fakeDictation.current.stopped).toBe(false);
  });

  it("'rename tasks' (renameByType) runs at once; a number during the pick runs at once; the name then waits for the silence", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "rename tasks");                // no timer advanced
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "rename tasks", summary: PICK_TASK_LINE, ok: true });
    const pick = renameFlow(h);
    expect(pick?.phase).toBe("pick");
    const two = pick && pick.phase === "pick" ? pick.targets.find((t) => t.n === 2) : undefined;
    expect(two?.id).toBe("t2");
    await hear(h, "two");                         // no timer advanced
    expect(renameFlow(h)).toMatchObject({ phase: "name", itemType: "task", targetId: "t2", kind: "element" });
    expect(h.labelEdits).toEqual(["t2"]);
    expect(h.log).toHaveLength(1);                // picking writes no line
    await hear(h, "Approve invoice");
    await advance(h, FRAGMENT_SILENCE_MS - 1);
    expect(labels(h)).toContain("Check invoice");
    await advance(h, 1);
    expect(labels(h)).toContain("Approve invoice");
    expect(labels(h)).not.toContain("Check invoice");
    expect(h.lastLine).toMatchObject({ heard: "Approve invoice", summary: "renamed to “Approve invoice” — pick another or say “done”", ok: true });
    expect(renameFlow(h)?.phase).toBe("pick");    // the loop re-numbers for the next one
    expect(aiCalls()).toHaveLength(0);
  });

  it("a flow-end word with a pick open goes straight to the runner and closes it ('rename finished'); the mic stays on", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "rename tasks");
    await hear(h, "done");                        // no timer advanced
    expect(h.log).toHaveLength(2);
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename finished", ok: true });
    expect(renameFlow(h)).toBe(null);
    expect(h.session.voiceListening).toBe(true);
    expect(fakeDictation.current.stopped).toBe(false);
    expect(aiCalls()).toHaveLength(0);
  });
});

// ── T5074 — stopping, and the start/stop race ───────────────────────────────

describe(`T5074 — stopping the mic, and the start/stop race (${runningAgainst()})`, () => {
  it("CURRENT: spoken 'stop' drops the held buffer and stops the mic WITHOUT a log line (a typed 'stop' logs 'stopped listening') — quirk kept deliberately by the move", async () => {
    // Quirk kept deliberately by the move: the onText stop path calls stopAbraListening directly and logs nothing.
    const h = await mount();
    await startMic(h);
    await hear(h, "rename Pay supplier to");
    await advance(h, FRAGMENT_SILENCE_MS);        // held
    await hear(h, "stop");
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.log).toHaveLength(0);
    expect(h.session.voiceInterim).toBe("");
    await advance(h, FULL_HOLD_MS * 2);
    expect(h.log).toHaveLength(0);
    expect(aiCalls()).toHaveLength(0);
    expect(labels(h)).toContain("Pay supplier");
    await h.typed("stop");
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "stop", summary: "stopped listening", ok: true });
  });

  it("CURRENT: 'stop rename' stops the MIC — the mic stop word wins over the flow-end word — and the pick closes with no line (quirk kept deliberately by the move)", async () => {
    // Quirk kept deliberately by the move: isMicStopWord is checked before isFlowEndWord, and "stop rename" starts with the mic word "stop".
    const h = await mount();
    await startMic(h);
    await hear(h, "rename tasks");
    expect(renameFlow(h)?.phase).toBe("pick");
    await hear(h, "stop rename");
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.current.stopped).toBe(true);
    expect(renameFlow(h)).toBe(null);
    expect(h.log).toHaveLength(1);                // only "rename tasks" — no "rename finished"
    expect(h.lastLine?.heard).toBe("rename tasks");
  });

  it("CURRENT: 'stop numbering' stops the MIC too — spoken or typed, the mic stop word wins over the flow-end word, as with 'stop rename' (quirk kept deliberately by the move)", async () => {
    // Quirk kept deliberately by the move: "stop numbering" is in the flow-end
    // list, but it starts with the mic word "stop", and isMicStopWord is checked first.
    const h = await mount();
    await startMic(h);
    await hear(h, "rename tasks");
    expect(renameFlow(h)?.phase).toBe("pick");
    await hear(h, "stop numbering");
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.current.stopped).toBe(true);
    expect(renameFlow(h)).toBe(null);
    expect(h.log).toHaveLength(1);                // spoken: no line of its own
    // Typed, it is the typed stop: the flow closes and the line says "stopped listening".
    await h.typed("rename tasks");
    await h.typed("stop numbering");
    expect(renameFlow(h)).toBe(null);
    expect(h.lastLine).toMatchObject({ heard: "stop numbering", summary: "stopped listening", ok: true });
    expect(aiCalls()).toHaveLength(0);
  });

  // HAZARD FOR PAUL TO RULE ON (the two tests below): stopAbraListening means
  // "a parked confirmation dies with the mic", but the recogniser's stop()
  // fires onEnd synchronously and onEnd force-flushes the buffer BEFORE
  // pendingConfirmRef is cleared — so a "yes" still in the buffer confirms the
  // destructive command the stop was meant to drop. Pinned as today's order only.
  it("CURRENT: the mic button's stop with a spoken “yes” still buffered and “clear the diagram?” parked — the stop's own flush runs the “yes” BEFORE it drops the question, so the diagram is cleared", async () => {
    const h = await mount();
    await startMic(h);
    await h.typed("clear the diagram");
    expect(h.session.pendingConfirmRef.current).not.toBeNull();
    await hear(h, "yes");
    await advance(h, 1000);                       // inside the silence: still buffered
    expect(h.session.voiceInterim).toBe("yes");
    expect(h.data.elements).toHaveLength(5);

    await h.act(() => h.session.stopAbraListening());
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.lastLine).toMatchObject({ heard: "yes", summary: "confirmed → cleared the diagram", ok: true, ops: [{ op: "clear" }] });
    expect(h.data.elements).toHaveLength(0);
    expect(h.session.pendingConfirmRef.current).toBeNull();
    expect(aiCalls()).toHaveLength(0);
  });

  it("CURRENT: a typed “stop” with a spoken “yes” still buffered and “clear the diagram?” parked — the “yes” confirms first, then the line says “stopped listening”", async () => {
    const h = await mount();
    await startMic(h);
    await h.typed("clear the diagram");
    await hear(h, "yes");
    await advance(h, 1000);
    await h.typed("stop");
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.log.map((l) => [l.heard, l.summary])).toEqual([
      ["clear the diagram", "clear the whole diagram (5 elements)? — say “yes” to confirm"],
      ["yes", "confirmed → cleared the diagram"],
      ["stop", "stopped listening"],
    ]);
    expect(h.data.elements).toHaveLength(0);
    expect(h.session.pendingConfirmRef.current).toBeNull();
    expect(aiCalls()).toHaveLength(0);
  });

  it("stopping with a plain command still buffered runs it at once, exactly once", async () => {
    const h = await mount();
    await startMic(h);
    await hear(h, "delete Pay supplier");
    await advance(h, 1000);
    expect(h.log).toHaveLength(0);
    await h.act(() => h.session.toggleAbraListening());
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);
    expect(h.log).toHaveLength(1);
    expect(h.lastLine?.heard).toBe("delete Pay supplier");
    expect(labels(h)).not.toContain("Pay supplier");
    await advance(h, FRAGMENT_SILENCE_MS * 2);
    expect(h.log).toHaveLength(1);
  });

  it("CURRENT: stopping with a command buffered runs it while the flows are STILL OPEN (the recogniser's synchronous onEnd flushes first), then the flows clear", async () => {
    // Order kept deliberately by the move: stop() → onEnd → flush → the runner
    // sees the rename flow still open → only then does stopAbraListening clear it.
    const h = await mount();
    await startMic(h);
    await hear(h, "rename tasks");
    await hear(h, "two");
    expect(renameFlow(h)?.phase).toBe("name");
    await hear(h, "Approve invoice");
    await advance(h, 1000);                       // still inside the silence
    expect(labels(h)).toContain("Check invoice");
    await h.act(() => h.session.toggleAbraListening());
    // The buffered words were read as the NAME (the flow was open), not as a command.
    expect(labels(h)).toContain("Approve invoice");
    expect(labels(h)).not.toContain("Check invoice");
    expect(h.lastLine).toMatchObject({ heard: "Approve invoice", summary: "renamed to “Approve invoice” — pick another or say “done”", ok: true });
    expect(aiCalls()).toHaveLength(0);
    // …and then the stop closed the pick the rename had just re-opened.
    expect(renameFlow(h)).toBe(null);
    expect(h.session.voiceListening).toBe(false);
    expect(fakeDictation.current.stopped).toBe(true);
  });

  it("turning Voice Assist off, switching diagram, and unmounting each stop the live recogniser", async () => {
    const h = await mount();
    await h.act(() => h.session.setVoiceAssistOn(true));
    await startMic(h);
    const s1 = fakeDictation.current;
    await h.act(() => h.session.setVoiceAssistOn(false));
    expect(s1.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);

    await startMic(h);
    const s2 = fakeDictation.current;
    expect(s2).not.toBe(s1);
    await h.rerender({ diagramId: "diagram-2" });
    expect(s2.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);

    await startMic(h);
    const s3 = fakeDictation.current;
    await h.unmount();
    expect(s3.stopped).toBe(true);
  });

  it("CURRENT: a diagram switch stops the recogniser but not the idle clock — 2 minutes later the idle-close line appears (quirk kept deliberately by the move)", async () => {
    // Quirk kept deliberately by the move: the diagramId effect stops the handle directly, not through stopAbraListening.
    const h = await mount();
    await startMic(h);
    await h.rerender({ diagramId: "diagram-2" });
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.log).toHaveLength(0);
    await advance(h, ABRA_IDLE_MS);
    expect(h.log).toHaveLength(1);
    expect(h.lastLine).toMatchObject({ heard: "", summary: "Voice Assist closed — 2 minutes idle", ok: true });
  });

  it("CURRENT: start → stop → start while the first start is still connecting — the first handle, arriving late, is kept and then orphaned: never stopped, still heard (the known desktop race, kept deliberately by the move)", async () => {
    // Quirk kept deliberately by the move: start #2 resets voiceStopRequested, so start #1's late handle passes the check.
    const h = await mount();
    fakeDictation.holdStarts = true;
    await h.act(() => { void h.session.toggleAbraListening(); });   // start #1 — connecting
    const first = fakeDictation.current;
    expect(h.session.voiceListening).toBe(true);
    await h.act(() => { void h.session.toggleAbraListening(); });   // stop, while #1 connects
    expect(h.session.voiceListening).toBe(false);
    expect(h.session.abraConnecting).toBe(false);
    expect(first.stopped).toBe(false);                               // nothing to stop yet
    await h.act(() => { void h.session.toggleAbraListening(); });   // start #2 — resets the stop request
    const second = fakeDictation.current;
    expect(fakeDictation.sessions).toHaveLength(2);
    expect(h.session.voiceListening).toBe(true);
    expect(h.session.abraConnecting).toBe(true);

    // #1's handle arrives late: the stop request was reset by #2, so it is KEPT.
    await h.act(() => { first.cb.onEngine?.("deepgram"); first.cb.onReady?.(); first.resolve(first.handle); });
    expect(first.stopped).toBe(false);
    expect(h.session.abraConnecting).toBe(false);                    // #1's ready ends "connecting" though #2 has not connected
    // #2 arrives and replaces it — #1 is now held by nothing.
    await h.act(() => { second.cb.onEngine?.("deepgram"); second.cb.onReady?.(); second.resolve(second.handle); });
    expect(second.stopped).toBe(false);

    await h.act(() => h.session.toggleAbraListening());             // the user stops
    expect(second.stopped).toBe(true);
    expect(first.stopped).toBe(false);                               // orphaned: never stopped
    expect(h.session.voiceListening).toBe(false);

    // …and still wired: what it hears runs as a command with the mic "off".
    await h.act(() => first.cb.onText("delete Pay supplier"));
    await advance(h, FRAGMENT_SILENCE_MS);
    expect(labels(h)).not.toContain("Pay supplier");
    expect(h.lastLine?.heard).toBe("delete Pay supplier");
    expect(h.session.voiceListening).toBe(false);
  });
});
