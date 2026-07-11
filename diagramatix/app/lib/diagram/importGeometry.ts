/**
 * Repair + snap pass for image-imported BPMN geometry.
 *
 * A vision model emits coarse, jittery bounding boxes for each shape it sees in
 * an uploaded competitor diagram. Fed straight into layout they look visibly
 * "off" — columns don't line up, lanes don't tile their pool, children poke out
 * of their pool. `snapImportedBounds` is the quality lever: it cleans the raw
 * normalised boxes (0..1 of the source image) into a tidy, self-consistent set
 * that `layoutBpmnPreserved` can scale straight to canvas pixels.
 *
 * It is a PURE function (no I/O, deterministic) so it can be unit-tested in
 * isolation. All coordinates in and out are normalised 0..1, top-left origin.
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Minimal shape this pass needs off an AiElement. */
export interface ImportedShape {
  id: string;
  type: string;
  bounds?: Box;
  /** node → the pool/lane it was declared in (may be repaired by containment). */
  pool?: string;
  lane?: string;
  /** lane → the pool it belongs to. */
  parentPool?: string;
}

export interface CleanShape {
  id: string;
  type: string;
  /** Cleaned normalised box. */
  box: Box;
  /** For a node: the pool it resolves into (containment-repaired). */
  poolId?: string;
  /** For a node: the lane it resolves into, if any. */
  laneId?: string;
  /** For a lane: its parent pool. */
  parentPoolId?: string;
}

export interface SnapResult {
  /** false when the geometry is unusable (no pool boxes / too sparse) and the
   *  caller should fall back to the normal auto-stack layout. */
  ok: boolean;
  /** Cleaned shapes, only those that had usable bounds. */
  shapes: CleanShape[];
  /** Pool ids ordered top → bottom by their box (replaces isSystemPool). */
  poolOrder: string[];
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
const centreX = (b: Box) => b.x + b.w / 2;
const centreY = (b: Box) => b.y + b.h / 2;
const contains = (b: Box, px: number, py: number): boolean =>
  px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;

/** Clamp a raw box into [0,1] and return null if degenerate (non-positive size). */
function cleanBox(raw: Box | undefined): Box | null {
  if (!raw) return null;
  if (![raw.x, raw.y, raw.w, raw.h].every((n) => typeof n === "number" && isFinite(n))) return null;
  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  const w = clamp01(raw.x + raw.w) - x;
  const h = clamp01(raw.y + raw.h) - y;
  if (w <= 0.001 || h <= 0.001) return null;
  return { x, y, w, h };
}

/** 1-D clustering: group sorted values within `tol` and snap each to the group
 *  mean. Returns a map from original value → snapped value. */
function snap1D(values: number[], tol: number): Map<number, number> {
  const out = new Map<number, number>();
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] - sorted[i] <= tol) j++;
    const group = sorted.slice(i, j + 1);
    const mean = group.reduce((s, v) => s + v, 0) / group.length;
    for (const v of group) out.set(v, mean);
    i = j + 1;
  }
  return out;
}

const POOL_LANE = new Set(["pool", "lane"]);

/**
 * Clean + snap imported normalised geometry.
 *
 * @param elements raw imported shapes (bounds normalised 0..1)
 * @param colTol   centre-x cluster tolerance for column snapping (default 0.03)
 * @param rowTol   centre-y cluster tolerance for row snapping (default 0.03)
 */
export function snapImportedBounds(
  elements: ImportedShape[],
  colTol = 0.03,
  rowTol = 0.03,
): SnapResult {
  // 1. Clean boxes; keep only shapes with usable bounds.
  const boxOf = new Map<string, Box>();
  for (const el of elements) {
    const b = cleanBox(el.bounds);
    if (b) boxOf.set(el.id, b);
  }

  const pools = elements.filter((e) => e.type === "pool" && boxOf.has(e.id));
  const lanes = elements.filter((e) => e.type === "lane" && boxOf.has(e.id));
  const nodes = elements.filter((e) => !POOL_LANE.has(e.type) && boxOf.has(e.id));

  // Unusable when no pool carries geometry, or almost nothing was boxed — the
  // caller falls back to the validated auto-stack layout.
  if (pools.length === 0 || nodes.length === 0) {
    return { ok: false, shapes: [], poolOrder: [] };
  }

  // 2. Pool order: top → bottom by box.y (the vendor's real stacking order).
  const poolOrder = [...pools]
    .sort((a, b) => boxOf.get(a.id)!.y - boxOf.get(b.id)!.y)
    .map((p) => p.id);
  const poolIds = new Set(poolOrder);

  // 3. Lanes: snap x/width to the parent pool and tile contiguously down it.
  const laneParent = new Map<string, string>();
  for (const pid of poolOrder) {
    const pBox = boxOf.get(pid)!;
    const own = lanes
      .filter((l) => l.parentPool === pid || (!l.parentPool && contains(pBox, centreX(boxOf.get(l.id)!), centreY(boxOf.get(l.id)!))))
      .sort((a, b) => boxOf.get(a.id)!.y - boxOf.get(b.id)!.y);
    if (own.length === 0) continue;
    // Tile the pool height across the lanes, preserving their relative heights.
    const totalH = own.reduce((s, l) => s + boxOf.get(l.id)!.h, 0) || 1;
    let cursor = pBox.y;
    for (const l of own) {
      const lb = boxOf.get(l.id)!;
      const h = (lb.h / totalH) * pBox.h;
      boxOf.set(l.id, { x: pBox.x, y: cursor, w: pBox.w, h });
      cursor += h;
      laneParent.set(l.id, pid);
    }
  }

  // 4. Column snapping: cluster node centre-x across the whole diagram.
  const nodeCx = nodes.map((n) => centreX(boxOf.get(n.id)!));
  const colSnap = snap1D(nodeCx, colTol);
  for (const n of nodes) {
    const b = boxOf.get(n.id)!;
    const newCx = colSnap.get(centreX(b));
    if (newCx !== undefined) boxOf.set(n.id, { ...b, x: newCx - b.w / 2 });
  }

  // 5. Containment repair + row snapping per lane/pool.
  const poolOfNode = new Map<string, string | undefined>();
  const laneOfNode = new Map<string, string | undefined>();
  for (const n of nodes) {
    const b = boxOf.get(n.id)!;
    const cx = centreX(b), cy = centreY(b);
    // Which lane box actually contains the node centre? (geometry wins over the
    // declared field — the drawn box is what the user sees).
    let laneId: string | undefined = lanes.find((l) => contains(boxOf.get(l.id)!, cx, cy))?.id;
    let poolId: string | undefined = laneId ? laneParent.get(laneId) : undefined;
    if (!poolId) poolId = poolOrder.find((pid) => contains(boxOf.get(pid)!, cx, cy));
    // Fall back to the declared membership when nothing contains the centre.
    if (!poolId && n.pool && poolIds.has(n.pool)) poolId = n.pool;
    if (!laneId && n.lane && laneParent.has(n.lane)) laneId = n.lane;
    poolOfNode.set(n.id, poolId);
    laneOfNode.set(n.id, laneId);
  }
  // Row snapping: within each lane (or pool when laneless), cluster centre-y.
  const groups = new Map<string, string[]>();
  for (const n of nodes) {
    const key = laneOfNode.get(n.id) ?? poolOfNode.get(n.id) ?? "_";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(n.id);
  }
  for (const ids of groups.values()) {
    const cys = ids.map((id) => centreY(boxOf.get(id)!));
    const rowSnap = snap1D(cys, rowTol);
    for (const id of ids) {
      const b = boxOf.get(id)!;
      const newCy = rowSnap.get(centreY(b));
      if (newCy !== undefined) boxOf.set(id, { ...b, y: newCy - b.h / 2 });
    }
  }

  // 6. Emit cleaned shapes.
  const shapes: CleanShape[] = [];
  for (const pid of poolOrder) shapes.push({ id: pid, type: "pool", box: boxOf.get(pid)! });
  for (const l of lanes) {
    if (!laneParent.has(l.id)) continue; // orphan lane — dropped
    shapes.push({ id: l.id, type: "lane", box: boxOf.get(l.id)!, parentPoolId: laneParent.get(l.id) });
  }
  for (const n of nodes) {
    shapes.push({
      id: n.id, type: n.type, box: boxOf.get(n.id)!,
      poolId: poolOfNode.get(n.id), laneId: laneOfNode.get(n.id),
    });
  }

  return { ok: true, shapes, poolOrder };
}
