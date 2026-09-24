/**
 * The Voice Assist debug toggle (Paul, 2026-09-24): "a Debug feature that can be
 * turned on for SuperAdmin that allows me to type a comment next to each
 * attempted command to indicate whether it worked or to comment on how it
 * worked. In addition, the ability to take a snapshot."
 *
 * PER-BROWSER, NOT GLOBAL. The app draws a clear line between two kinds of
 * switch and this is firmly the second:
 *
 *   • `bubbleHelpSetting.ts` is a GLOBAL PRODUCT switch — one SuperAdmin decides
 *     what every user experiences, without a deploy. It belongs in `AppSetting`.
 *   • `goldFlash.ts` and `debug/gestureTrace.ts` are PER-BROWSER developer state.
 *     They belong in localStorage.
 *
 * One person flips this, mid-session, while looking at a diagram. An AppSetting
 * would buy a database round trip on every editor mount, a cache-invalidation
 * story and a route — for a checkbox. Voice Assist already has a toggle of
 * exactly this shape (`goldFlash`), so this is one pattern to learn, not two.
 *
 * THE SECURITY DOES NOT LIVE HERE. localStorage is settable by anyone with a
 * console. This controls client UI only; `isSuperuser` on the persistence route
 * is the actual lock. Same split `tileVisibility.ts` states: this hides the
 * door, it does not add a second lock on the room.
 */

export const VOICE_DEBUG_KEY = "dgx.voiceDebug";

/**
 * Is debug recording on?
 *
 * TWO DELIBERATE DEPARTURES FROM `goldFlash`, both pinned by a test because
 * they look like bugs to anyone reading the two files side by side:
 *
 *   1. **Default OFF.** Gold flash defaults on, because nobody turns on a thing
 *      they have not seen. This is the reverse case — nobody should accumulate
 *      annotated sessions, with snapshots of their diagrams in them, that they
 *      did not ask for.
 *   2. **Fails CLOSED.** Gold flash fails open, because the default is what
 *      somebody with no stored preference should get, and a missed highlight
 *      costs nothing. Here a wrong answer means silently starting to capture
 *      diagram content down an error path, which is not a thing to do by
 *      accident in a private window.
 */
export function isVoiceDebugOn(storage?: Pick<Storage, "getItem">): boolean {
  try {
    const s = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    return s?.getItem(VOICE_DEBUG_KEY) === "true";
  } catch {
    return false;
  }
}

/** Write the toggle. Silently does nothing where storage is unavailable. */
export function setVoiceDebug(on: boolean, storage?: Pick<Storage, "setItem">): void {
  try {
    const s = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    s?.setItem(VOICE_DEBUG_KEY, on ? "true" : "false");
  } catch {
    /* site data blocked — the session simply is not recorded */
  }
}
