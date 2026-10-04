/**
 * T5231 — Diagramatix Voice, V1: Voice Assist replies spoken (Paul, 2026-10-04: "go").
 *
 * Driven through the real session hook (the same harness the mic-loop tests use):
 *   • every line that reaches the log is OFFERED to the host's `speakReply` — once — with the log's own verdict;
 *   • while the voice is sounding, what the microphone hears is ignored (it is the voice itself) — not shown, not
 *     buffered, not parsed — except the stop words, which cut the voice off at once (barge-in);
 *   • when the voice has stopped, the very same words are a command again.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { FRAGMENT_SILENCE_MS } from "@/app/lib/assist/fragmentBuffer";

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  stubFetch(() => ({ ops: [] }));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

async function drain(h: Mounted) {
  await h.act(async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); });
}
async function advance(h: Mounted, ms: number) { await h.act(() => { vi.advanceTimersByTime(ms); }); await drain(h); }
async function hear(h: Mounted, text: string) { await h.act(() => fakeDictation.current.cb.onText(text)); }
const labels = (h: Mounted) => h.data.elements.map((e) => e.label);

describe("T5231 spoken replies", () => {
  it("every log line is offered to the host once, with the log's verdict", async () => {
    const said: Array<[string, boolean]> = [];
    const h = await mountSession({ initial: threeTasks(), host: { speakReply: (s: string, ok: boolean) => said.push([s, ok]) } });
    await h.typed("swap lanes");                              // nothing selected: refused — a problem
    await h.typed("add a task called Spoken");                // a success
    expect(said.length).toBe(h.log.length);
    expect(said.length).toBeGreaterThanOrEqual(2);
    expect(said.map(([s]) => s)).toEqual(h.log.map((l) => l.summary));
    expect(said[0][1]).toBe(false);
    expect(said[said.length - 1][1]).toBe(true);
  });

  it("with no host callback (the phone, the tests) nothing is spoken and nothing breaks", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("add a task called Quiet");
    expect(labels(h)).toContain("Quiet");
  });

  it("while the voice sounds the microphone is ignored: not applied, not logged, not buffered", async () => {
    let gated = true;
    const stops: number[] = [];
    const h = await mountSession({ initial: threeTasks(), host: { isMicGated: () => gated, stopSpeech: () => stops.push(1) } });
    await h.act(() => h.session.toggleAbraListening());
    const before = h.log.length;
    await hear(h, "add a task called Echo");
    await advance(h, FRAGMENT_SILENCE_MS + 500);
    expect(labels(h)).not.toContain("Echo");
    expect(h.log.length).toBe(before);
    expect(stops.length).toBe(0);                             // an ordinary command does not stop the voice: it is simply not heard

    // …and once the voice has stopped, the very same words are a command again.
    gated = false;
    await hear(h, "add a task called Echo");
    await advance(h, FRAGMENT_SILENCE_MS + 500);
    expect(labels(h)).toContain("Echo");
  });

  it("an interim caption heard while the voice sounds is not shown either", async () => {
    let gated = true;
    const h = await mountSession({ initial: threeTasks(), host: { isMicGated: () => gated } });
    await h.act(() => h.session.toggleAbraListening());
    await h.act(() => fakeDictation.current.cb.onInterim?.("add a task called Echo"));
    expect(h.session.voiceInterim).toBe("");
    gated = false;
    await h.act(() => fakeDictation.current.cb.onInterim?.("add a task"));
    expect(h.session.voiceInterim).toBe("add a task");
  });

  it("BARGE-IN: “stop” while the voice sounds cuts it off at once, and still ends the microphone", async () => {
    const stops: number[] = [];
    const h = await mountSession({ initial: threeTasks(), host: { isMicGated: () => true, stopSpeech: () => stops.push(1) } });
    await h.act(() => h.session.toggleAbraListening());
    expect(h.session.voiceListening).toBe(true);
    await hear(h, "stop");
    expect(stops.length).toBe(1);
    expect(h.session.voiceListening).toBe(false);
  });

  it("“cancel” / “done” while the voice sounds also cut it off (and the mic stays on)", async () => {
    const stops: number[] = [];
    const h = await mountSession({ initial: threeTasks(), host: { isMicGated: () => true, stopSpeech: () => stops.push(1) } });
    await h.act(() => h.session.toggleAbraListening());
    await hear(h, "cancel");
    expect(stops.length).toBe(1);
    expect(h.session.voiceListening).toBe(true);
  });
});
