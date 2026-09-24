/**
 * The SuperAdmin Tools grid's "Filter tools…" box, remembered across a visit
 * to a tile.
 *
 * Paul, 2026-09-25: "when filtering SuperAdmin tiles keep the existing filter
 * after coming back from entering a tile."
 *
 * sessionStorage rather than a `?q=` URL param: about thirty tile pages go back
 * through a "← SuperAdmin" link to the BARE `/dashboard/admin`, so a query
 * param would only survive the browser's Back button. sessionStorage survives
 * both, is scoped to the tab, and starts empty in a new one.
 *
 * Storage is passed in and every access is guarded — sessionStorage can be
 * missing (SSR) or throw (private windows, blocked site data). Without it the
 * grid simply starts unfiltered, as it always did.
 */

export const TILE_FILTER_KEY = "dgx.superadmin.tileFilter";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

/** The remembered filter, or "" when there is none or storage is unusable. */
export function readTileFilter(storage: ReadableStorage | null | undefined): string {
  try {
    const v = storage?.getItem(TILE_FILTER_KEY);
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

/** Remember the filter; a blank filter removes the key rather than storing "". */
export function writeTileFilter(storage: WritableStorage | null | undefined, value: string): void {
  try {
    if (!storage) return;
    if (value.trim() === "") storage.removeItem(TILE_FILTER_KEY);
    else storage.setItem(TILE_FILTER_KEY, value);
  } catch {
    /* storage unusable — the filter just isn't remembered */
  }
}

/** The browser's sessionStorage, or null where touching it throws or it doesn't exist. */
export function sessionStore(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
