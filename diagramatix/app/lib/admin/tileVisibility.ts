/**
 * Which SuperAdmin tiles a given person may see.
 *
 * Paul, 2026-09-14: "Make the Fun Tiles only visible to SuperAdmin
 * paul@nashcc.com.au ONLY." Every SuperAdmin sees the SuperAdmin Tools grid;
 * a tile may additionally name the exact people it is for. Gated on the email,
 * not on SuperAdmin-ness — another SuperAdmin must NOT see them.
 *
 * Pure, so the rule is testable without the dashboard around it. The tile
 * PAGES stay behind the ordinary SuperAdmin route guard; this hides the door,
 * it does not add a second lock on the room.
 */

/** The people the Fun Extensions tiles are for. Exact emails, lowercase. */
export const FUN_TILE_OWNERS: readonly string[] = ["paul@nashcc.com.au"];

export function tileVisibleTo(
  tile: { onlyFor?: readonly string[] },
  email: string | null | undefined,
): boolean {
  if (!tile.onlyFor || tile.onlyFor.length === 0) return true;
  const e = (email ?? "").trim().toLowerCase();
  return e !== "" && tile.onlyFor.some((allowed) => allowed.toLowerCase() === e);
}
