/**
 * BPMN path analysis — who belongs to which path, and which row that path owns.
 *
 * A decision gateway splits the flow into paths, and those paths nest: a branch
 * may contain a decision of its own. Until now the layout stacked each decision's
 * immediate targets around ITS OWN centre with a fixed spacing, which works for
 * one level and breaks at two — a nested decision has no idea the rows above and
 * below are already spoken for, so its sub-paths land on their uncles.
 *
 * Paul's illustration (2026-09-01) states the intended shape:
 *
 *     Path 1 ────────────────────────────────  row 1
 *              Path 2.1 ──────────────────────  row 2
 *     ── Decision 1 ── Path 2 ── Decision 2 ──  row 3   (the TRUNK)
 *              Path 2.3 (ends, no merge) ─────  row 4
 *     Path 3 ────────────────────────────────  row 5
 *
 * Two things make that work, and both are why this is a tree rather than a list:
 *
 *  - The MIDDLE branch keeps its parent's row. The trunk runs straight through
 *    the diagram and the reader's eye follows it; branches peel off either side.
 *  - Nested paths take rows BETWEEN the trunk and the neighbouring sibling, not
 *    the same fixed offsets their parent used. That is the whole fix.
 *
 * An in-order walk of the tree — everything above, then the path itself, then
 * everything below — produces exactly the order in the illustration. Rows are
 * then assigned top to bottom and the stack is shifted so the trunk lands where
 * the flow already is, which keeps the main line where the rest of the layout
 * put it.
 *
 * A path that ENDS rather than rejoining its merge is ordinary here (Paul: "some
 * sub-paths may end before their Merge"). It owns a row like any other; nothing
 * depends on it coming back.
 *
 * Pure: no geometry is written, no elements are moved. It answers "which row
 * should this element be on", and the caller decides what to do about it.
 */

export interface PathNode {
  /** "1", "2", "2.1" — the parent's id, a dot, and the branch's position. */
  id: string;
  parentId: string | null;
  depth: number;
  /** The branch connector's label, when it has one. */
  label: string | null;
  /** Flow elements owned by this path, in order. Excludes gateways it passes
   *  through and the merge it rejoins — those belong to no path. */
  elementIds: string[];
  /** True when the path runs to a dead end instead of rejoining its merge. */
  endsWithoutMerge: boolean;
  /** Assigned centre-Y. */
  row: number;
}

export interface PathAnalysis {
  paths: PathNode[];
  /** elementId → path id. */
  pathOf: Map<string, string>;
  /** path id → assigned row. */
  rowOf: Map<string, number>;
}

export interface PathInput {
  /** Every flow element that can carry a row. */
  elements: { id: string; height: number; type: string; parentId?: string | null }[];
  /** Sequence flows only — data and message links must already be excluded. */
  edges: { sourceId: string; targetId: string; label?: string | null }[];
  isDecision: (id: string) => boolean;
  /** The merge that closes a decision, when it has one. */
  mergeFor: (decisionId: string) => string | undefined;
  /** Where the trunk currently sits, so the stack can be centred on it. */
  trunkRow: number;
  /**
   * Edge-mounted (boundary) events on an element, with the side they sit on.
   * Each one that carries an outgoing flow opens an EXCEPTION PATH, and that
   * path needs a row of its own like any other — see the note on `fork`.
   */
  boundaryEventsOn?: (elementId: string) => { id: string; side: "top" | "bottom" }[];

  /** Vertical gap between adjacent rows. */
  gap?: number;
}

/** One row of the finished stack. Several paths can share it — a path and the
 *  middle child that continues it are the same line on the page. */
interface Slot { paths: PathNode[]; height: number; isOwn: boolean;
  /** An exception path row: never shares with another fork branch. */
  exclusive?: boolean }

/** The synthetic path representing the main line. Never numbered. */
export const ROOT = "trunk";

export function analysePaths(input: PathInput): PathAnalysis {
  const { elements, edges, isDecision, mergeFor, trunkRow } = input;
  const boundaryEventsOn = input.boundaryEventsOn ?? (() => []);
  const GAP = input.gap ?? 34;
  const byId = new Map(elements.map((e) => [e.id, e]));
  const out = new Map<string, { sourceId: string; targetId: string; label?: string | null }[]>();
  const inCount = new Map<string, number>();
  for (const e of edges) {
    const a = out.get(e.sourceId); if (a) a.push(e); else out.set(e.sourceId, [e]);
    inCount.set(e.targetId, (inCount.get(e.targetId) ?? 0) + 1);
  }

  const paths: PathNode[] = [];
  const pathOf = new Map<string, string>();
  const visited = new Set<string>();

  /**
   * Walk one path from `startId` until it ends, rejoins `stopAt`, or reaches
   * something that is not its own. Nested decisions are expanded in place and
   * the walk resumes at their merge, because the flow after a merge is still
   * this path.
   */
  function walk(node: PathNode, startId: string, stopAt: string | undefined): Slot[] {
    const nested: Slot[][] = [];
    const exceptions: { side: "top" | "bottom"; slots: Slot[] }[] = [];
    let cur: string | undefined = startId;
    let guard = 0;

    while (cur && guard++ < 200) {
      if (cur === stopAt) { return merge(node, nested, exceptions); }
      const el = byId.get(cur);
      if (!el) break;
      if (visited.has(cur)) break;

      if (isDecision(cur)) {
        // A fork inside this path. Its children take rows around this one.
        visited.add(cur);
        const closes = mergeFor(cur);
        nested.push(fork(node, cur, closes));
        // The path continues on the far side of the fork's merge.
        if (!closes) { node.endsWithoutMerge = true; break; }
        const afterMerge = (out.get(closes) ?? []).filter((e) => e.targetId !== closes);
        visited.add(closes);
        cur = afterMerge.length === 1 ? afterMerge[0].targetId : undefined;
        if (!cur) break;
        continue;
      }

      // An ordinary step belongs to this path — unless something else already
      // feeds it, which makes it shared and nobody's.
      if ((inCount.get(cur) ?? 0) > 1 && cur !== startId) break;
      visited.add(cur);
      node.elementIds.push(cur);
      pathOf.set(cur, node.id);

      // An edge-mounted event opens an EXCEPTION PATH off this step. It is a
      // path like any other and needs a row of its own: placing it relative to
      // its host without asking what already occupies that row is how it landed
      // on Path 2.2 in "Gateway EIME Test 2" — Task 16 drawn over Task 6.
      for (const be of boundaryEventsOn(cur)) {
        const first = (out.get(be.id) ?? [])[0];
        if (!first || visited.has(first.targetId)) continue;
        const child: PathNode = {
          id: node.id === ROOT ? `E${exceptions.length + 1}` : `${node.id}.E${exceptions.length + 1}`,
          parentId: node.id,
          depth: node.depth + 1,
          label: first.label ?? null,
          elementIds: [], endsWithoutMerge: false, row: 0,
        };
        paths.push(child);
        exceptions.push({ side: be.side, slots: walk(child, first.targetId, stopAt) });
      }

      const next: { sourceId: string; targetId: string; label?: string | null }[] = out.get(cur) ?? [];
      if (next.length === 0) { node.endsWithoutMerge = true; break; }
      if (next.length > 1) break;             // an unpaired fork: stop cleanly
      cur = next[0].targetId;
    }
    return merge(node, nested, exceptions);
  }

  /**
   * Fold this path's own slot into whatever its nested decisions produced.
   *
   * Sequential forks on one path are ALIGNED on their trunk slot, not
   * concatenated. Two decisions one after another both fan around the same line
   * — their branches sit at different x positions, so they can share rows.
   * Concatenating them would stack the second decision's branches below the
   * first's and drive the diagram down the page for no reason.
   */
  function merge(
    node: PathNode,
    nested: Slot[][],
    exceptions: { side: "top" | "bottom"; slots: Slot[] }[] = [],
  ): Slot[] {
    const ownHeight = Math.max(
      24,
      ...node.elementIds.map((id) => byId.get(id)?.height ?? 0),
    );

    /**
     * An exception path takes rows of its OWN, immediately beside this path,
     * pushing everything further out rather than sharing.
     *
     * Sibling branches may share a row because they sit at different x — but an
     * exception hangs off a step in the MIDDLE of this path, so it occupies the
     * same columns as whatever is level with it. In "Gateway EIME Test 2" the
     * exception off Task 9 landed on Path 2.2 at the same x as Task 6 and Task
     * 7, drawn straight over them. Inserting instead of aligning is what keeps
     * the stack honest.
     */
    const withExceptions = (rows: Slot[]): Slot[] => {
      if (exceptions.length === 0) return rows;
      const out = [...rows];
      let ownIdx = out.findIndex((r) => r.isOwn);
      if (ownIdx < 0) ownIdx = 0;
      for (const e of exceptions) {
        // `exclusive` travels with the slot so the rule survives being folded
        // into a parent: sequential forks are ALIGNED there, and an alignment
        // that maps another fork's branch onto this row undoes the insertion.
        // V23.01 hit exactly that — the escalation path off the loop subprocess
        // came back down onto the Consumer self-read branch, one fork earlier.
        const slots = e.slots.map((s) => ({ ...s, isOwn: false, exclusive: true }));
        if (e.side === "top") { out.splice(ownIdx, 0, ...slots); ownIdx += slots.length; }
        else out.splice(ownIdx + 1, 0, ...slots);
      }
      return out;
    };

    if (nested.length === 0) {
      return withExceptions([{ paths: [node], height: ownHeight, isOwn: true }]);
    }

    const groups = nested
      .map((g) => ({ g, own: g.findIndex((s) => s.isOwn) }))
      .filter((x) => x.own >= 0);
    if (groups.length === 0) return withExceptions([{ paths: [node], height: ownHeight, isOwn: true }]);

    const above = Math.max(...groups.map((x) => x.own));
    const below = Math.max(...groups.map((x) => x.g.length - 1 - x.own));
    const rows: Slot[] = Array.from({ length: above + 1 + below }, () => ({
      paths: [], height: 0, isOwn: false,
    }));
    /**
     * An exclusive row admits nothing else, and nothing else admits it.
     *
     * Tests the TARGET's occupancy only. Reading the incoming slot's own
     * `paths.length` instead makes the condition true of the exception slot
     * itself, so inserting empty rows never clears it and the loop below never
     * terminates — a hang, not a bad layout.
     */
    const clash = (t: Slot, s: Slot) =>
      (t.exclusive || s.exclusive) && t.paths.length > 0 && !s.isOwn;
    for (const { g, own } of groups) {
      // Grow the stack rather than let an exception path share a row. The
      // alignment exists so two SEQUENTIAL forks can reuse rows — their branches
      // sit at different x — but an exception hangs off a step mid-path and
      // covers the same columns as whatever is level with it.
      for (let guard = 0; guard < 64; guard++) {
        const hit = g.findIndex((s, i) => {
          const t = rows[above - own + i];
          return !!t && clash(t, s);
        });
        if (hit < 0) break;
        rows.splice(above - own + hit, 0, { paths: [], height: 0, isOwn: false });
      }
      g.forEach((s, i) => {
        const t = rows[above - own + i];
        if (!t) return;
        t.paths.push(...s.paths);
        t.height = Math.max(t.height, s.height);
        t.isOwn = t.isOwn || s.isOwn;
        t.exclusive = t.exclusive || s.exclusive;
      });
    }
    // The path itself rides the aligned trunk slot.
    rows[above].paths.unshift(node);
    rows[above].height = Math.max(rows[above].height, ownHeight);
    rows[above].isOwn = true;
    return withExceptions(rows);
  }

  /** Expand a decision's branches into ordered slots: above, trunk, below. */
  function fork(parent: PathNode | null, decisionId: string, closes: string | undefined): Slot[] {
    const branches = (out.get(decisionId) ?? []).filter((e) => e.targetId !== decisionId);
    const kids: Slot[][] = [];
    branches.forEach((b, i) => {
      const node: PathNode = {
        // Children of the root trunk are 1, 2, 3; deeper ones carry their
        // parent's number — 2.1, 2.3 — which is how Paul reads them.
        id: parent && parent.id !== ROOT ? `${parent.id}.${i + 1}` : `${i + 1}`,
        parentId: parent?.id ?? null,
        depth: (parent?.depth ?? -1) + 1,
        label: b.label ?? null,
        elementIds: [],
        endsWithoutMerge: false,
        row: 0,
      };
      paths.push(node);
      kids.push(walk(node, b.targetId, closes));
    });
    if (kids.length === 0) return [];

    // The MIDDLE branch carries the trunk. With an even number there is no
    // middle, and the parent's line runs between the two innermost — which is
    // what a reader expects from a two-way split.
    const mid = Math.floor((kids.length - 1) / 2);
    // Only the MIDDLE child's trunk slot stays claimable. A leaf marks its own
    // slot as a trunk — it is one, for itself — but from here only one of them
    // can carry the line through this fork, or the parent would attach to
    // whichever branch happened to come first and the whole stack would hang off
    // the wrong row.
    const demote = (s: Slot): Slot => ({ ...s, isOwn: false });
    const above = kids.slice(0, mid).flat().map(demote);
    const own = kids[mid];
    const below = kids.slice(mid + 1).flat().map(demote);
    return [...above, ...own, ...below];
  }

  // ── Build from the TRUNK ─────────────────────────────────────────────────
  //
  // Walking each top-level decision separately would treat two SEQUENTIAL
  // decisions as unrelated stacks and put the second one's branches below the
  // first's. They are not unrelated: they are two forks on the same line, which
  // is what a root path makes explicit.
  const hasIncoming = new Set(edges.map((e) => e.targetId));
  const starts = elements.filter((e) => !hasIncoming.has(e.id) && (out.get(e.id)?.length ?? 0) > 0);

  const slots: Slot[] = [];
  for (const start of starts) {
    if (visited.has(start.id)) continue;
    const root: PathNode = {
      id: ROOT, parentId: null, depth: -1, label: null,
      elementIds: [], endsWithoutMerge: false, row: 0,
    };
    const produced = walk(root, start.id, undefined);
    // A trunk with no fork on it owns nothing worth saying; only keep the root
    // when it actually carried branches.
    if (root.elementIds.length > 0 || produced.length > 1) paths.push(root);
    slots.push(...produced);
  }
  // Anything left — a decision reached only by a back edge, or a fragment with
  // no start event — still deserves a path rather than being silently skipped.
  for (const e of elements) {
    if (!isDecision(e.id) || visited.has(e.id)) continue;
    visited.add(e.id);
    slots.push(...fork(null, e.id, mergeFor(e.id)));
  }

  // ── Assign rows top to bottom, then centre the stack on the trunk ────────
  const rowOf = new Map<string, number>();
  if (slots.length > 0) {
    let y = 0;
    const ys: number[] = [];
    slots.forEach((s, i) => {
      if (i > 0) y += slots[i - 1].height / 2 + GAP + s.height / 2;
      ys.push(y);
    });
    // The own-slot of the FIRST top-level fork is the trunk: keep it where the
    // flow already is, so this pass re-arranges the branches without dragging
    // the main line somewhere new.
    const trunkIdx = slots.findIndex((s) => s.isOwn);
    const shift = trunkRow - (ys[trunkIdx >= 0 ? trunkIdx : 0] ?? 0);
    slots.forEach((s, i) => {
      const row = ys[i] + shift;
      for (const p of s.paths) { p.row = row; rowOf.set(p.id, row); }
    });
  }

  return { paths, pathOf, rowOf };
}
