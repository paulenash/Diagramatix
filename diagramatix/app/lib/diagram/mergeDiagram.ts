/**
 * Three-way merge of a DiagramData document, keyed by element / connector id.
 *
 * Used by co-authoring auto-save (Phase 1d): when a save is rejected (409)
 * because another editor saved first, we merge OUR local edits onto THEIR
 * server version using the last-saved copy as the common ancestor (base). Edits
 * that touch different elements/connectors merge silently; only a genuine
 * overlap — the SAME element changed by both sides differently — is a conflict
 * (resolved in favour of THEIRS, and reported so the UI can surface it).
 */
import type { DiagramData } from "./types";

export interface MergeConflict {
  kind: "element" | "connector";
  id: string;
}

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Merge an array of `{ id }` items three-way. Order follows THEIRS, with any
 *  items only-we-have appended in our order. */
function mergeById<T extends { id: string }>(
  base: T[],
  ours: T[],
  theirs: T[],
  kind: "element" | "connector",
  conflicts: MergeConflict[],
): T[] {
  const bMap = new Map(base.map((x) => [x.id, x]));
  const oMap = new Map(ours.map((x) => [x.id, x]));
  const tMap = new Map(theirs.map((x) => [x.id, x]));

  const orderedIds = [
    ...theirs.map((x) => x.id),
    ...ours.map((x) => x.id).filter((id) => !tMap.has(id)),
  ];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const b = bMap.get(id);
    const o = oMap.get(id);
    const t = tMap.get(id);
    const inB = b !== undefined, inO = o !== undefined, inT = t !== undefined;

    if (inO && inT) {
      const oChanged = !inB || !eq(o, b);
      const tChanged = !inB || !eq(t, b);
      if (oChanged && tChanged && !eq(o, t)) {
        conflicts.push({ kind, id });
        out.push(t!); // true overlap → server (theirs) wins
      } else if (oChanged) {
        out.push(o!);
      } else {
        out.push(t!);
      }
    } else if (inO && !inT) {
      if (inB) {
        // they deleted it
        if (!eq(o, b)) { conflicts.push({ kind, id }); out.push(o!); } // we edited a thing they deleted → keep ours
        // else honour the delete (drop)
      } else {
        out.push(o!); // we added it → keep
      }
    } else if (!inO && inT) {
      if (inB) {
        // we deleted it
        if (!eq(t, b)) { conflicts.push({ kind, id }); out.push(t!); } // they edited a thing we deleted → keep theirs
        // else honour our delete (drop)
      } else {
        out.push(t!); // they added it → keep
      }
    }
    // !inO && !inT → gone from both → drop
  }
  return out;
}

/**
 * Merge OURS onto THEIRS using BASE (last-saved) as the common ancestor.
 * Returns the merged document plus any true conflicts (same id changed both
 * sides). Non-element/connector scalar fields are merged 3-way (ours wins only
 * when we changed it and they didn't); the viewport stays OURS (it's local).
 */
export function mergeDiagram(
  base: DiagramData,
  ours: DiagramData,
  theirs: DiagramData,
): { merged: DiagramData; conflicts: MergeConflict[] } {
  const conflicts: MergeConflict[] = [];
  const elements = mergeById(base.elements ?? [], ours.elements ?? [], theirs.elements ?? [], "element", conflicts);
  const connectors = mergeById(base.connectors ?? [], ours.connectors ?? [], theirs.connectors ?? [], "connector", conflicts);

  const merged: DiagramData = { ...theirs, elements, connectors };
  if (ours.viewport) merged.viewport = ours.viewport; // viewport is per-viewer, keep ours

  // 3-way the remaining scalar/object top-level keys (title, font sizes, toggles…).
  const skip = new Set(["elements", "connectors", "viewport"]);
  const rec = (o: DiagramData) => o as unknown as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(rec(ours)), ...Object.keys(rec(theirs))]);
  for (const k of keys) {
    if (skip.has(k)) continue;
    const bv = rec(base)[k], ov = rec(ours)[k], tv = rec(theirs)[k];
    if (!eq(ov, bv) && eq(tv, bv)) rec(merged)[k] = ov; // we changed it, they didn't → take ours
    // otherwise keep theirs (already in merged)
  }
  return { merged, conflicts };
}
