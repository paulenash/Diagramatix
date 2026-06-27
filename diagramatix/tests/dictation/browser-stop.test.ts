/**
 * Browser-fallback dictation: Stop must end the session.
 *
 * Regression guard for the bug exposed by the User Guide editor's Dictate: the
 * Web Speech fallback's stop() never called onEnd (and onend bailed early when
 * want=false), so the host UI stayed stuck "listening" and Stop did nothing.
 *
 * Forces the browser engine (no Deepgram token) with a deliberately INERT mock
 * SpeechRecognition whose stop() fires no events — proving stop() itself resets
 * the host (it must not rely on onend firing).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startDictation } from "@/app/lib/dictation";

class MockSpeechRecognition {
  onend: (() => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  continuous = false;
  interimResults = false;
  lang = "";
  start() { /* no-op */ }
  stop() { /* deliberately inert — the fixed stop() must fire onEnd itself */ }
}

describe("dictation browser-fallback Stop", () => {
  beforeEach(() => {
    // Token endpoint unreachable → startDictation falls back to the browser engine.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    vi.stubGlobal("window", { SpeechRecognition: MockSpeechRecognition });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses the browser engine and Stop fires onEnd exactly once", async () => {
    const onEnd = vi.fn();
    const onEngine = vi.fn();
    const handle = await startDictation({ onText: () => {}, onEnd, onEngine });

    expect(onEngine).toHaveBeenCalledWith("browser");
    expect(handle).not.toBeNull();
    expect(onEnd).not.toHaveBeenCalled(); // still listening

    handle!.stop();
    expect(onEnd).toHaveBeenCalledTimes(1); // the fix — host is reset on Stop

    handle!.stop(); // idempotent — no second onEnd
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("returns a null handle (and ends) when the browser has no speech engine", async () => {
    vi.stubGlobal("window", {}); // no SpeechRecognition
    const onEnd = vi.fn();
    const onError = vi.fn();
    const handle = await startDictation({ onText: () => {}, onEnd, onError });
    expect(handle).toBeNull();
    expect(onError).toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});
