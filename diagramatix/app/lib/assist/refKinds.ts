/**
 * Which KIND of element a command's reference can name — one table, read by the
 * apply layer AND by both scorers, so the harness resolves exactly as the app.
 *
 * Paul's log, 2026-09-23: "Compact pool three." → `which “three”? 2 match:
 * “Pool 3”, “Lane 3”`. The compress rule threw the word "pool" away and the
 * resolver then offered a lane. The same loss broke "move pool three top
 * boundary down" (no picker at all) and "add a lane to 3", and the AI could not
 * rescue any of them because its answer is re-parsed by the same rules
 * (2026-09-26 investigation). A field that can only ever be a pool now says so
 * here, and the lookup never offers anything else.
 */
import type { DiagramElement } from "../diagram/types";
import { isAnyLane } from "../diagram/laneKind";

/** `container` = a pool or a band of any depth; `lane` = a band of any depth. */
export type RefKind = "pool" | "lane" | "container";

const TABLE: Readonly<Record<string, Readonly<Record<string, RefKind>>>> = {
  // No kind word said: a pool or a lane, and the apply decides by what it found.
  // A kind word the user DID say ("pool three") narrows it further, in resolveRef.
  compressPool: { poolRef: "container" },
  movePoolBoundary: { ref: "pool" },
  addLanes: { poolRef: "pool" },
  movePoolTo: { ref: "pool", relativeTo: "pool" },
  swapPools: { a: "pool", b: "pool" },
  addPool: { relativeTo: "pool" },
  // A lane word was said ("compress the Sales lane"), so only a lane — of any
  // depth — can answer, never a pool called Sales: a kind word you say is
  // binding (adopted by Paul, 2026-09-26).
  compressLane: { laneRef: "lane" },
  expandLane: { laneRef: "lane" },
};

/** The kind `op.field` must name, or undefined when any element will do. */
export function refKind(op: string, field: string): RefKind | undefined {
  return TABLE[op]?.[field];
}

/** Does `e` belong to `kind`? Both shapes of a sub-lane count as a lane (laneKind.ts). */
export function isOfKind(kind: RefKind, e: DiagramElement): boolean {
  if (kind === "pool") return e.type === "pool";
  if (kind === "lane") return isAnyLane(e);
  return e.type === "pool" || isAnyLane(e);
}
