/**
 * Keep the phone's screen awake while the mic is open (mobile voice stage 7).
 * A phone that sleeps mid-sentence kills the microphone and the socket; the
 * Screen Wake Lock API stops that. The browser drops the lock whenever the page
 * is hidden, so it is taken again when the page comes back.
 *
 * Best-effort throughout: no API (older iOS, http), a refusal (low battery),
 * or any throw just means the screen may sleep as it always did.
 */
type Sentinel = { release(): Promise<void> };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

export function keepAwake(): { release(): void } {
  let held: Sentinel | null = null;
  let done = false;

  const api = (): WakeLockApi | null => {
    try { return (navigator as unknown as { wakeLock?: WakeLockApi }).wakeLock ?? null; } catch { return null; }
  };
  const take = async () => {
    const w = api();
    if (!w || done || held) return;
    try {
      const s = await w.request("screen");
      if (done) { void s.release().catch(() => {}); return; }
      held = s;
    } catch { /* refused: fine */ }
  };
  const onVisible = () => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    held = null;   // the browser released it when the page was hidden
    void take();
  };

  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  void take();

  return {
    release() {
      if (done) return;
      done = true;
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
      const s = held;
      held = null;
      if (s) void s.release().catch(() => {});
    },
  };
}
