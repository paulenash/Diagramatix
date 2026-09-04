/**
 * Which progress row does a run message belong to?
 *
 * By NAME AND TYPE, never by position — and the reason is worth stating, because
 * position looks obviously correct and was wrong for every row of every run.
 *
 * The batch runner's screen builds its row list from the value-chain library
 * GET, which returns a chain's prompts `orderBy: [type asc, processCode asc]` —
 * archimate, bpmn, context, process-context, value-chain. The run route builds
 * its own list independently: the chain-level prompts first in a hand-written
 * order, then the BPMN ones per process. Both then filter by the same picked
 * keys, which preserves EACH ONE'S OWN order — so index N on the server and row
 * N on the screen are different diagrams. Measured on V22: 14 of 14 positions
 * disagree, BPMN rows shifted by three.
 *
 * Every element count, connector count and diagnostic was therefore attributed
 * to the wrong diagram. Paul, 2026-09-05: "V22.01 Receive Notification ✗ 11el /
 * 0conn — no flow" against a diagram that had generated perfectly well; those
 * were the context diagram's numbers. Earlier, "#13 Process Context ✓ 37el /
 * 44conn" — a BPMN diagram's size, not a context diagram's.
 *
 * He suspected a position error the first time he saw it. I checked that both
 * sides filter the same list by the same keys and told him it was structurally
 * impossible — having missed that they BUILD that list separately. The lesson is
 * narrow and useful: two orderings agree only if one of them is derived from the
 * other, and neither of these was.
 *
 * The server sends `name` and `type` on every message, so identity is available
 * and free. Index survives only as a fallback for a message carrying no name.
 */

/** A diagram's identity within a run — the same shape the picker keys on. */
export const runRowKey = (type: string, name: string): string => `${type}::${name}`;

export interface RunRowLike { index: number; name: string; type: string }
export interface RunMessageLike { index?: number; name?: string; type?: string }

/**
 * True when `msg` reports on `row`. Prefers identity; falls back to position
 * only when the message carries no name to match on.
 */
export function runMessageMatchesRow(row: RunRowLike, msg: RunMessageLike): boolean {
  if (msg.name && msg.type) return runRowKey(row.type, row.name) === runRowKey(msg.type, msg.name);
  return msg.index !== undefined && row.index === msg.index;
}
