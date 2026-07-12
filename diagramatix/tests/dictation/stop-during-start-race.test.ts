/**
 * Dictate: a Stop pressed DURING async startup must not leave an orphaned live
 * mic (T0727).
 *
 * `startDictation()` is async — it fetches a token and calls getUserMedia (which
 * shows a permission prompt). The host panels (AiPanel / PlanPanel / GuideEditor)
 * set `listening = true` BEFORE awaiting but only assign the returned handle to
 * `dictRef` AFTER. If the user clicks Stop in that window, the stop runs against
 * a still-null `dictRef` (a no-op) and the resolving handle would keep recording
 * — "the Dictate button continues to record after Stop".
 *
 * The panels guard this with a `stopRequestedRef`: a Stop during startup is
 * remembered and the arriving handle is stopped immediately. This test drives a
 * faithful copy of that toggle logic to lock the contract (mic is released even
 * when Stop lands mid-start).
 */
import { describe, it, expect, vi } from "vitest";

interface Handle { stop: () => void }

/** Mirrors the toggle handler shared by the dictation panels. */
function makeToggle(startDictation: () => Promise<Handle | null>) {
  const dictRef: { current: Handle | null } = { current: null };
  const stopRequestedRef = { current: false };
  let listening = false;

  async function toggle() {
    if (listening) {
      // STOP branch — also absorbs a start that's still in flight.
      stopRequestedRef.current = true;
      dictRef.current?.stop();
      dictRef.current = null;
      listening = false;
      return;
    }
    stopRequestedRef.current = false;
    listening = true;
    const handle = await startDictation();
    if (!handle) { listening = false; return; }
    if (stopRequestedRef.current) {
      // Stop was pressed while starting → tear down instead of orphaning.
      stopRequestedRef.current = false;
      handle.stop();
      listening = false;
      return;
    }
    dictRef.current = handle;
  }

  return { toggle, dictRef, isListening: () => listening };
}

describe("dictate Stop during async start (T0727)", () => {
  it("stops the arriving handle when Stop is pressed mid-startup (no orphaned mic)", async () => {
    const stop = vi.fn();
    // Deferred handle — simulates the token-fetch + getUserMedia latency.
    let resolveStart!: (h: Handle) => void;
    const startDictation = () => new Promise<Handle | null>((res) => { resolveStart = res; });

    const t = makeToggle(startDictation);

    const starting = t.toggle();   // Dictate → listening=true, awaiting handle
    expect(t.isListening()).toBe(true);

    await t.toggle();              // Stop pressed BEFORE the handle resolves
    expect(t.isListening()).toBe(false);

    resolveStart({ stop });        // handle finally arrives…
    await starting;

    expect(stop).toHaveBeenCalledTimes(1); // …and is torn down immediately
    expect(t.dictRef.current).toBeNull();   // nothing left recording
    expect(t.isListening()).toBe(false);
  });

  it("normal start→stop keeps recording only between the two clicks", async () => {
    const stop = vi.fn();
    const startDictation = async () => ({ stop });
    const t = makeToggle(startDictation);

    await t.toggle();                 // start (handle assigned)
    expect(t.dictRef.current).not.toBeNull();
    expect(stop).not.toHaveBeenCalled();

    await t.toggle();                 // stop (real handle)
    expect(stop).toHaveBeenCalledTimes(1);
    expect(t.dictRef.current).toBeNull();
    expect(t.isListening()).toBe(false);
  });
});
