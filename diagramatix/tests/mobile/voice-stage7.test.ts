/**
 * Mobile voice stage 7 — staying alive on a real phone: the screen stays awake
 * while the mic is open (T5089), the socket reconnects by itself when the
 * connection drops and captures at 16 kHz (T5090), and none of it changes the
 * desktop's recogniser (T5091).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { keepAwake } from "@/app/lib/mobile/wakeLock";
import { MAX_RECONNECT_ATTEMPTS, PHONE_SAMPLE_RATE, reconnectDelayMs } from "@/app/lib/dictation/reconnectPolicy";
import { startDictation, type DictationCallbacks } from "@/app/lib/dictation";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ── stand-ins ───────────────────────────────────────────────────────────────
class FakeDoc {
  visibilityState = "visible";
  private l = new Set<() => void>();
  addEventListener(_t: string, f: () => void) { this.l.add(f); }
  removeEventListener(_t: string, f: () => void) { this.l.delete(f); }
  fire() { [...this.l].forEach((f) => f()); }
  get listeners() { return this.l.size; }
}

class FakeSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = 0;
  binaryType = "";
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string, public protocols: string[]) { FakeSocket.all.push(this); }
  send(x: unknown) { this.sent.push(x); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen?.(); }
  drop() { this.readyState = 3; this.onclose?.(); }
  say(text: string, final = true) { this.onmessage?.({ data: JSON.stringify({ is_final: final, channel: { alternatives: [{ transcript: text }] } }) }); }
}

let processor: { onaudioprocess: ((e: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null };
let ctxOptions: unknown[] = [];
let track: { stop: ReturnType<typeof vi.fn>; onended: (() => void) | null };
let doc: FakeDoc;
let tokenFetches = 0;
let tokenOk = true;

class FakeAC {
  sampleRate: number;
  state = "running";
  destination = {};
  constructor(o?: { sampleRate?: number }) { ctxOptions.push(o); this.sampleRate = o?.sampleRate ?? 48000; }
  resume = vi.fn(async () => {});
  close = vi.fn();
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createScriptProcessor() { processor = { onaudioprocess: null }; return Object.assign(processor, { connect() {}, disconnect() {} }); }
  createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = []; ctxOptions = []; tokenFetches = 0; tokenOk = true;
  doc = new FakeDoc();
  track = { stop: vi.fn(), onended: null };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("window", { isSecureContext: true, AudioContext: FakeAC });
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [track], getAudioTracks: () => [track] }) } });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/dictation/token")) {
      tokenFetches++;
      return tokenOk ? { status: 200, json: async () => ({ token: "tok" + tokenFetches, scheme: "token" }) } : { status: 500, json: async () => ({}) };
    }
    return { status: 200, json: async () => ({}) };
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const settle = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };
function callbacks(extra: Partial<DictationCallbacks> = {}) {
  const log = { errors: [] as string[], texts: [] as string[], ready: 0, ended: 0 };
  const cb: DictationCallbacks = { onText: (t) => log.texts.push(t), onError: (m) => log.errors.push(m), onReady: () => { log.ready++; }, onEnd: () => { log.ended++; }, ...extra };
  return { cb, log };
}
const chunk = () => ({ inputBuffer: { getChannelData: () => new Float32Array([0.1, -0.1, 0.2]) } });

describe("T5089 — the phone keeps its screen awake while the mic is open", () => {
  it("takes a screen wake lock, takes it again when the page comes back, and lets go on release", async () => {
    const released: number[] = [];
    let n = 0;
    vi.stubGlobal("navigator", { wakeLock: { request: vi.fn(async () => { const id = ++n; return { release: async () => { released.push(id); } }; }) } });
    const lock = keepAwake();
    await settle();
    expect((navigator as unknown as { wakeLock: { request: { mock: { calls: unknown[] } } } }).wakeLock.request.mock.calls).toHaveLength(1);
    doc.fire();   // the page was hidden and is visible again: the browser had dropped the lock
    await settle();
    expect((navigator as unknown as { wakeLock: { request: { mock: { calls: unknown[] } } } }).wakeLock.request.mock.calls).toHaveLength(2);
    lock.release();
    await settle();
    expect(released).toEqual([2]);
    expect(doc.listeners).toBe(0);
  });

  it("without the API, or refused, it does nothing and does not throw", async () => {
    vi.stubGlobal("navigator", {});
    expect(() => keepAwake().release()).not.toThrow();
    vi.stubGlobal("navigator", { wakeLock: { request: async () => { throw new Error("battery low"); } } });
    const l = keepAwake();
    await settle();
    expect(() => l.release()).not.toThrow();
  });

  it("the phone screen holds it exactly while it is listening", () => {
    const ed = read("app/components/mobile/MobileVoiceEditor.tsx");
    expect(ed).toContain("const lock = keepAwake();");
    expect(ed).toContain("return () => lock.release();");
    expect(ed).toContain("}, [listening]);");
    expect(ed).toContain("phone: true,");
  });
});

describe("T5090 — the phone's recogniser: 16 kHz, and it reconnects by itself", () => {
  it("the retry schedule is bounded: 0.4 s, 0.8 s, 1.6 s, 3.2 s, then it gives up", () => {
    expect([1, 2, 3, 4].map(reconnectDelayMs)).toEqual([400, 800, 1600, 3200]);
    expect(MAX_RECONNECT_ATTEMPTS).toBe(4);
    expect(reconnectDelayMs(5)).toBeNull();
    expect(reconnectDelayMs(0)).toBeNull();
    expect(PHONE_SAMPLE_RATE).toBe(16000);
  });

  it("asks for a 16 kHz capture and tells the recogniser that rate", async () => {
    const { cb } = callbacks({ phone: true });
    const p = startDictation(cb); await settle(); await p;
    expect(ctxOptions).toEqual([{ sampleRate: 16000 }]);
    expect(FakeSocket.all[0].url).toContain("sample_rate=16000");
  });

  it("a dropped socket is reopened with a FRESH token, keeps the mic, and the speech said meanwhile is not lost", async () => {
    const { cb, log } = callbacks({ phone: true });
    const p = startDictation(cb); await settle(); await p;
    const first = FakeSocket.all[0];
    first.open();
    expect(log.ready).toBe(1);
    first.drop();
    expect(log.errors).toEqual(["Connection dropped — reconnecting…"]);
    expect(log.ended, "not ended: it is trying again").toBe(0);
    processor.onaudioprocess!(chunk());          // said while the connection is down
    await settle(400);
    expect(FakeSocket.all).toHaveLength(2);
    expect(FakeSocket.all[1].protocols).toEqual(["token", "tok2"]);
    FakeSocket.all[1].open();
    expect(FakeSocket.all[1].sent, "the queued chunk is sent first").toHaveLength(1);
    expect(log.ready).toBe(2);
    FakeSocket.all[1].say("add a task");
    expect(log.texts).toEqual(["add a task"]);
    expect(track.stop).not.toHaveBeenCalled();
  });

  it("gives up after four failed attempts, says so, and ends cleanly", async () => {
    const { cb, log } = callbacks({ phone: true });
    const p = startDictation(cb); await settle(); await p;
    FakeSocket.all[0].open();
    tokenOk = false;
    FakeSocket.all[0].drop();
    await settle(20000);
    expect(log.ended).toBe(1);
    expect(log.errors.at(-1)).toContain("could not get it back");
    expect(track.stop).toHaveBeenCalled();
  });

  it("a stop by the person never reconnects", async () => {
    const { cb, log } = callbacks({ phone: true });
    const p = startDictation(cb); await settle(); const h = await p;
    FakeSocket.all[0].open();
    h!.stop();
    FakeSocket.all[0].drop();
    await settle(5000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(log.ended).toBe(1);
    expect(doc.listeners).toBe(0);
  });

  it("coming back to the page after the socket died reopens at once; another app taking the mic ends it with a reason", async () => {
    const { cb, log } = callbacks({ phone: true });
    const p = startDictation(cb); await settle(); await p;
    FakeSocket.all[0].open();
    FakeSocket.all[0].readyState = 3;   // died while the page was in the background, no close event seen
    doc.fire();
    await settle(400);
    expect(FakeSocket.all).toHaveLength(2);
    track.onended!();
    expect(log.errors.at(-1)).toBe("The microphone was taken by another app.");
    expect(log.ended).toBe(1);
  });
});

describe("T5091 — the desktop's recogniser is untouched by stage 7", () => {
  it("no phone flag: the device's own rate, and a closed socket ends the session (no reconnect)", async () => {
    const { cb, log } = callbacks();
    const p = startDictation(cb); await settle(); await p;
    expect(ctxOptions).toEqual([undefined]);
    expect(FakeSocket.all[0].url).toContain("sample_rate=48000");
    FakeSocket.all[0].open();
    FakeSocket.all[0].drop();
    await settle(5000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(log.ended).toBe(1);
    expect(doc.listeners).toBe(0);
  });

  it("only the phone screen asks for it", () => {
    expect(read("app/hooks/useVoiceSession.ts")).toContain("const phone = host.phone === true;");
    expect(read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx")).not.toMatch(/\bphone:\s*true/);
  });
});
