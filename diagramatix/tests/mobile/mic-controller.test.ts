/**
 * T5021 — the phone sheet's one microphone (app/lib/mobile/micController.ts).
 *
 * The 2026-09-28 review found the first version lost track of a dictation that
 * was still connecting: closing the sheet, or tapping another answer's mic,
 * left a live microphone nobody could stop, writing into the draft. And Stop
 * (or Generate) dropped the phrase still on screen as "interim".
 *
 * Driven here with a fake dictation engine whose starts resolve when the test
 * says — no phone, no DOM.
 */
import { describe, it, expect, vi } from "vitest";
import { createMicController, MIC_COULD_NOT_START } from "@/app/lib/mobile/micController";
import type { DictationCallbacks, DictationHandle } from "@/app/lib/dictation";

type Target = "prompt" | number;

function fakeEngine() {
  const starts: { cb: DictationCallbacks; resolve: (h: DictationHandle | null) => void; handle: DictationHandle & { stop: ReturnType<typeof vi.fn> } }[] = [];
  const start = (cb: DictationCallbacks) => new Promise<DictationHandle | null>((resolve) => {
    const handle = { stop: vi.fn(() => cb.onEnd?.()) };
    starts.push({ cb, resolve, handle });
  });
  return { start, starts };
}

function listener() {
  const text: [Target, string][] = [];
  const log = { text, state: null as null | { target: Target; ready: boolean }, interim: "", message: null as string | null };
  return {
    log,
    listen: {
      onText: (t: Target, s: string) => { text.push([t, s]); },
      onInterim: (s: string) => { log.interim = s; },
      onState: (s: { target: Target; ready: boolean } | null) => { log.state = s; },
      onMessage: (m: string | null) => { log.message = m; },
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("T5021 — one microphone, and nothing lost or left running", () => {
  it("asks for PROSE, says connecting… then listening…, and puts the words where they were said", async () => {
    const eng = fakeEngine();
    const { log, listen } = listener();
    const mic = createMicController<Target>(eng.start, listen);
    const p = mic.toggle("prompt");
    expect(log.state).toEqual({ target: "prompt", ready: false });
    expect(eng.starts[0].cb.prose).toBe(true);
    eng.starts[0].resolve(eng.starts[0].handle);
    await p;
    eng.starts[0].cb.onReady?.();
    expect(log.state).toEqual({ target: "prompt", ready: true });
    eng.starts[0].cb.onText("The customer orders.");
    expect(log.text).toEqual([["prompt", "The customer orders."]]);
  });

  it("closing the sheet while it is still connecting: the late session is stopped and its words ignored", async () => {
    const eng = fakeEngine();
    const { log, listen } = listener();
    const mic = createMicController<Target>(eng.start, listen);
    const p = mic.toggle("prompt");
    mic.dispose();
    eng.starts[0].resolve(eng.starts[0].handle);
    await p;
    expect(eng.starts[0].handle.stop).toHaveBeenCalled();
    eng.starts[0].cb.onText("spoken after closing");
    expect(log.text).toEqual([]);
  });

  it("tapping another mic while the first is still connecting: the first is stopped when it arrives and cannot disturb the second", async () => {
    const eng = fakeEngine();
    const { log, listen } = listener();
    const mic = createMicController<Target>(eng.start, listen);
    const a = mic.toggle("prompt");
    const b = mic.toggle(0);
    expect(log.state).toEqual({ target: 0, ready: false });
    eng.starts[1].resolve(eng.starts[1].handle);
    await b;
    eng.starts[0].resolve(eng.starts[0].handle);
    await a;
    expect(eng.starts[0].handle.stop, "the stale session is stopped").toHaveBeenCalled();
    expect(eng.starts[1].handle.stop).not.toHaveBeenCalled();
    expect(log.state, "its 'ended' did not switch the live one off").toEqual({ target: 0, ready: false });
    eng.starts[0].cb.onText("stale words");
    eng.starts[1].cb.onText("the answer");
    expect(log.text).toEqual([[0, "the answer"]]);
    // …and Stop reaches the live one.
    mic.stop();
    expect(eng.starts[1].handle.stop).toHaveBeenCalled();
  });

  it("Stop keeps the phrase still on screen; stop() hands it to Generate; a late final after Stop is ignored", async () => {
    const eng = fakeEngine();
    const { log, listen } = listener();
    const mic = createMicController<Target>(eng.start, listen);
    const p = mic.toggle("prompt");
    eng.starts[0].resolve(eng.starts[0].handle);
    await p;
    eng.starts[0].cb.onInterim?.("and then it ships");
    await mic.toggle("prompt"); // Stop
    expect(log.text).toEqual([["prompt", "and then it ships"]]);
    expect(log.state).toBeNull();
    eng.starts[0].cb.onText("and then it ships"); // a browser engine's late final
    expect(log.text, "not added twice").toHaveLength(1);

    const q = mic.toggle(1);
    eng.starts[1].resolve(eng.starts[1].handle);
    await q;
    eng.starts[1].cb.onInterim?.("the duty manager");
    expect(mic.stop()).toEqual({ target: 1, tail: "the duty manager" });
    expect(mic.stop(), "nothing left the second time").toBeNull();
  });

  it("an error from a session already stopped is not shown; a start that fails says why", async () => {
    const eng = fakeEngine();
    const { log, listen } = listener();
    const mic = createMicController<Target>(eng.start, listen);
    const p = mic.toggle("prompt");
    mic.stop();
    eng.starts[0].cb.onError?.("Dictation connection error.");
    eng.starts[0].resolve(eng.starts[0].handle);
    await p;
    expect(log.message, "no false error after Stop").toBeNull();

    const q = mic.toggle("prompt");
    eng.starts[1].cb.onError?.("Microphone unavailable or blocked. Allow mic access and try again.");
    eng.starts[1].resolve(null);
    await q;
    expect(log.message).toBe("Microphone unavailable or blocked. Allow mic access and try again.");
    expect(log.state).toBeNull();

    const r = mic.toggle("prompt");
    eng.starts[2].resolve(null);
    await r;
    await tick();
    expect(log.message, "a silent failure still gets a reason").toBe(MIC_COULD_NOT_START);
  });
});
