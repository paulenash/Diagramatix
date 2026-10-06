/**
 * The first name to greet someone by, from the name on their account. A leading title is not a name — "Dr Paul Nash" is Paul, not "Dr"
 * (Paul, 2026-10-06: the welcome said "Welcome, Dr"). Pure and client-safe.
 */
const TITLES = new Set(["dr", "mr", "mrs", "ms", "miss", "mx", "prof", "professor", "sir", "dame", "rev", "hon", "capt", "captain", "major", "col", "colonel", "lord", "lady"]);

export function firstNameOf(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const bare = (w: string) => w.replace(/[.,]+$/g, "").toLowerCase();
  const i = words.findIndex((w) => !TITLES.has(bare(w)));
  return i < 0 ? "" : words[i].replace(/[.,]+$/g, "");
}
