/**
 * T4770 — the speaker: one voice at a time, and a stop that really stops.
 *
 * The suite is node-only, so the browser is faked at its edges — fetch, and an
 * AudioContext whose sources the test ends by hand. IndexedDB does not exist in
 * node, which is itself a case worth covering: the speaker must work uncached.
 *
 * The bug this pins: a `stop()` that landed while a reply was still being
 * FETCHED was ignored — the audio arrived after the user had paused, played
 * anyway, and a second pump could start beside it, so two voices overlapped.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Speaker } from "@/app/lib/voice/speaker";

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  constructor(private readonly started: FakeSource[]) {}
  connect() {}
  start() { this.started.push(this); }
  stop() { this.onended?.(); }
  end() { this.onended?.(); }
}

let started: FakeSource[];
let fetches: Array<{ body: { text: string; purpose: string }; resolve: (r: Response) => void }>;

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const audioOk = () => new Response(new ArrayBuffer(16), { status: 200, headers: { "Content-Type": "audio/mpeg" } });

beforeEach(() => {
  started = [];
  fetches = [];
  class FakeCtx {
    state = "running";
    destination = {};
    resume() { return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({ duration: 1 }); }
    createBufferSource() { return new FakeSource(started); }
  }
  vi.stubGlobal("window", { AudioContext: FakeCtx });
  vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
    new Promise<Response>((resolve) => fetches.push({ body: JSON.parse(String(init.body)), resolve })));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("T4770 — one voice at a time", () => {
  it("plays replies in the order asked, never two at once", async () => {
    const s = new Speaker();
    s.speak("first", "aura-2-theia-en", "question");
    s.speak("second", "aura-2-theia-en", "question");
    await flush();
    expect(fetches.map((f) => f.body.text), "the second waits for the first").toEqual(["first"]);

    fetches[0].resolve(audioOk());
    await flush();
    expect(started).toHaveLength(1);

    started[0].end();
    await flush();
    expect(fetches.map((f) => f.body.text)).toEqual(["first", "second"]);
  });

  it("isSpeaking means SOUNDING — not while the reply is still being fetched", async () => {
    const s = new Speaker();
    s.speak("hello", "aura-2-theia-en", "narration");
    await flush();
    expect(s.isSpeaking, "fetching is not speaking").toBe(false);
    fetches[0].resolve(audioOk());
    await flush();
    expect(s.isSpeaking).toBe(true);
    started[0].end();
    await flush();
    expect(s.isSpeaking).toBe(false);
  });
});

describe("T4770 — a stop that really stops", () => {
  it("a stop during the FETCH means that reply never plays", async () => {
    const s = new Speaker();
    const changes: boolean[] = [];
    s.speak("too late", "aura-2-theia-en", "narration", { onSpeakingChange: (b) => changes.push(b) });
    await flush();
    s.stop();
    fetches[0].resolve(audioOk()); // the audio arrives after the user paused
    await flush();
    expect(started, "nothing may sound after a stop").toHaveLength(0);
    expect(changes).not.toContain(true);
  });

  it("and the next reply after a stop plays alone", async () => {
    const s = new Speaker();
    s.speak("abandoned", "aura-2-theia-en", "narration");
    await flush();
    s.stop();
    s.speak("next", "aura-2-theia-en", "narration");
    await flush();
    fetches[0].resolve(audioOk()); // the abandoned one lands late
    fetches[1].resolve(audioOk());
    await flush();
    expect(started, "one voice, not two").toHaveLength(1);
  });

  it("a stop mid-sentence says so exactly once, and forgets the queue", async () => {
    const s = new Speaker();
    const changes: boolean[] = [];
    s.speak("one", "aura-2-theia-en", "narration", { onSpeakingChange: (b) => changes.push(b) });
    s.speak("two", "aura-2-theia-en", "narration");
    await flush();
    fetches[0].resolve(audioOk());
    await flush();
    s.stop();
    await flush();
    expect(changes).toEqual([true, false]);
    expect(fetches, "the queued reply was forgotten").toHaveLength(1);
  });
});

describe("T4770 — failure is reported, not swallowed", () => {
  it("a refusal reaches the caller in the route's own words, and the queue moves on", async () => {
    const s = new Speaker();
    const errors: string[] = [];
    s.speak("hello", "aura-2-theia-en", "narration", { onError: (m) => errors.push(m) });
    s.speak("after", "aura-2-theia-en", "narration");
    await flush();
    fetches[0].resolve(new Response(JSON.stringify({ error: "Spoken replies are not turned on for you" }), { status: 403 }));
    await flush();
    expect(errors).toEqual(["Spoken replies are not turned on for you"]);
    expect(fetches.map((f) => f.body.text)).toEqual(["hello", "after"]);
  });

  it("blank text is never sent — it would cost a request and say nothing", async () => {
    const s = new Speaker();
    s.speak("   ", "aura-2-theia-en", "narration");
    await flush();
    expect(fetches).toHaveLength(0);
  });
});
