/**
 * R8.22 — close an EMPTY horizontal void in a laid-out BPMN flow.
 *
 * The mirror of the vertical band compaction in `bpmnLayout`, and needed for the
 * same reason. R8.21 (global left-to-right enforcement) only ever pushes RIGHT:
 * it relaxes each forward edge until `t.x >= s.x + s.width + LR_GAP` and nothing
 * pulls the result back. So a single element ranked far right — by a subprocess
 * that was wide when the sweep ran and shrank afterwards, by a message flow to a
 * black-box system pool, by a merge relocation — drags the whole remaining flow
 * with it and leaves a band of nothing behind.
 *
 * Measured on the 2026-08-29 regenerations:
 *   V06.06  1,488px  "Review Solution Design Scope" → "Retrieve Design Specifications"
 *   V06.08  1,622px  "Review Business Case Assumptions" → "Retrieve Customer Data From CRM"
 * both with NOTHING in the span, in any lane or pool.
 *
 * The rule is deliberately narrow: a gap is closed ONLY when it is empty across
 * the whole diagram. A gap with a parallel branch or a wide subprocess in it is
 * carrying content, not slack, and closing it would drag elements on top of each
 * other.
 */

/** The minimum a layout element must expose for compaction. */
export interface VoidBox {
  id: string;
  type: string;
  x: number;
  width: number;
  parentId?: string;
  boundaryHostId?: string;
}

/** A void must be clearly wider than a normal flow step to count as slack. */
export const VOID_MIN = 306;   // 3 × task width
/** What an closed void is left at — R8.21's LR_GAP. */
export const VOID_TARGET = 60;

/**
 * Pulls flow elements left to close empty horizontal bands. Mutates `x` in
 * place and returns the voids it closed, largest first, for diagnostics.
 */
export function closeFlowVoids<T extends VoidBox>(
  elements: T[],
  opts: { minVoid?: number; targetGap?: number } = {},
): { at: number; closed: number }[] {
  const minVoid = opts.minVoid ?? VOID_MIN;
  const targetGap = opts.targetGap ?? VOID_TARGET;

  const byId = new Map(elements.map((e) => [e.id, e]));
  const kidsByParent = new Map<string, T[]>();
  for (const e of elements) {
    if (!e.parentId) continue;
    const a = kidsByParent.get(e.parentId);
    if (a) a.push(e); else kidsByParent.set(e.parentId, [e]);
  }
  const descOf = (rootId: string): string[] => {
    const out: string[] = [];
    const st = [rootId];
    while (st.length) {
      const c = st.pop()!;
      for (const k of kidsByParent.get(c) ?? []) { out.push(k.id); st.push(k.id); }
    }
    return out;
  };

  /**
   * Top-level = not inside an expanded subprocess and not mounted on a host.
   * Those ride along with the thing that contains them, so counting them as
   * separate occupants would make an EP's own internal spacing look like slack.
   */
  const isTopLevel = (e: T) => {
    if (e.type === "pool" || e.type === "lane" || e.type === "sublane") return false;
    if (e.boundaryHostId && byId.has(e.boundaryHostId)) return false;
    const p = e.parentId ? byId.get(e.parentId) : undefined;
    return !(p && p.type === "subprocess-expanded");
  };

  const shiftLeft = (rootIds: string[], dx: number) => {
    const full = new Set<string>(rootIds);
    for (const id of rootIds) for (const d of descOf(id)) full.add(d);
    for (const e of elements) if (e.boundaryHostId && full.has(e.boundaryHostId)) full.add(e.id);
    for (const e of elements) if (full.has(e.id)) e.x -= dx;
  };

  const closed: { at: number; closed: number }[] = [];
  const flow = elements.filter(isTopLevel).sort((a, b) => a.x - b.x);
  if (flow.length < 2) return closed;

  let occRight = flow[0].x + flow[0].width;
  for (let i = 1; i < flow.length; i++) {
    const band = flow[i].x - occRight;
    if (band > minVoid) {
      const dx = band - targetGap;
      closed.push({ at: occRight, closed: dx });
      // `flow` holds live references, so the rest of the sweep reads the moved
      // positions. occRight is unchanged: everything that moved is right of it.
      shiftLeft(flow.slice(i).map((k) => k.id), dx);
    }
    occRight = Math.max(occRight, flow[i].x + flow[i].width);
  }
  return closed;
}
