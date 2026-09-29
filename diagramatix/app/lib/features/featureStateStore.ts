/**
 * The browser's shared copy of the signed-in user's feature states — one
 * /api/features fetch for every component (like useOrgPolicy), with the two
 * rules that make it safe to lean on:
 *
 *   1. A FAILED fetch is never kept. It used to be stored as "{}", which reads
 *      as every feature Not Available for the rest of the tab's life — a
 *      dropped connection at load time silently removed the menus.
 *   2. It refreshes: on demand (`refresh()` — after an upgrade, a comp grant,
 *      impersonation), and when the tab regains focus after a minute, so an
 *      admin edit or a plan change shows up without a reload.
 *
 * No React in here, so it can be tested with a fake fetch.
 */
export type StoredState = "available" | "disabled" | "hidden";
export type StoredMap = Record<string, StoredState>;

const STALE_AFTER_MS = 60_000;

let cache: StoredMap | null = null;
let loadedAt = 0;
let inflight: Promise<StoredMap | null> | null = null;
const subs = new Set<(m: StoredMap) => void>();

async function fetchOnce(): Promise<StoredMap | null> {
  try {
    const r = await fetch("/api/features");
    if (!r.ok) return null;
    const j = await r.json();
    return (j.states ?? {}) as StoredMap;
  } catch {
    return null;
  }
}

/** Fetch now (sharing an in-flight request). A failure leaves the previous good copy in place and resolves null. */
export function refresh(): Promise<StoredMap | null> {
  if (!inflight) {
    inflight = fetchOnce().then((m) => {
      inflight = null;
      if (m) { cache = m; loadedAt = Date.now(); subs.forEach((f) => f(m)); }
      return m;
    });
  }
  return inflight;
}

/** The cached map, fetching on first use. Resolves null when nothing has ever loaded. */
export async function load(): Promise<StoredMap | null> {
  if (cache) return cache;
  return refresh();
}

export function current(): StoredMap | null { return cache; }
export function subscribe(f: (m: StoredMap) => void): () => void { subs.add(f); return () => { subs.delete(f); }; }

/** Called when the tab becomes visible or focused: refetch if the copy is over a minute old. */
export function refreshIfStale(now: number = Date.now()): void {
  if (cache && now - loadedAt > STALE_AFTER_MS) void refresh();
}

/** Forget everything (tests; sign-out). */
export function reset(): void { cache = null; loadedAt = 0; inflight = null; subs.clear(); }
