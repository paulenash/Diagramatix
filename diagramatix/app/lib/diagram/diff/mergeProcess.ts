/**
 * Process MERGE — apply cherry-picked differences from version B ("after") onto a
 * clone of version A ("before"), producing an AI model that layoutBpmnDiagram
 * turns into a clean, re-laid-out BPMN diagram. Works entirely at the AI-model
 * level (diagramToAiModel) so we never hand-hack geometry — layout re-flows the
 * result. Output is meant for a NEW diagram (non-destructive).
 *
 * Decisions are keyed by activity (normalised label) + kind, matching ProcessDiff
 * rows: "add" (activity only in B), "remove" (only in A), "change" (matched, take
 * B's role / task type / systems).
 */
import type { DiagramData } from "../types";
import type { AiElement, AiConnection } from "../bpmnLayout";
import { diagramToAiModel, type AiModel } from "./diagramToAiModel";
import { normaliseLabel } from "./processDiff";

export type MergeKind = "add" | "remove" | "change";
export interface MergeDecision { activity: string; kind: MergeKind }

const ACT_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);
const DATA_TYPES = new Set(["data-object", "data-store", "text-annotation"]);

const norm = normaliseLabel;

/** Working copy of an AI model with lookup helpers + id minting. */
class Model {
  els: AiElement[];
  conns: AiConnection[];
  private seq = 0;
  constructor(m: AiModel) {
    this.els = JSON.parse(JSON.stringify(m.elements)) as AiElement[];
    this.conns = JSON.parse(JSON.stringify(m.connections)) as AiConnection[];
  }
  id(prefix: string): string { return `mrg-${prefix}-${this.seq++}`; }
  byId(id: string): AiElement | undefined { return this.els.find((e) => e.id === id); }
  activityByLabel(label: string): AiElement | undefined {
    return this.els.find((e) => ACT_TYPES.has(e.type) && norm(e.label) === norm(label));
  }
  poolsWhiteBox(): AiElement[] { return this.els.filter((e) => e.type === "pool" && (e.poolType ?? "white-box") !== "black-box"); }
  laneByLabel(label: string): AiElement | undefined {
    return this.els.find((e) => e.type === "lane" && norm(e.label) === norm(label));
  }
}

/** The responsible role (lane label, else pool label) of an element in a model. */
function roleOf(m: Model, el: AiElement): string | undefined {
  if (el.lane) { const lane = m.byId(el.lane); if (lane) return lane.label; }
  if (el.pool) { const pool = m.byId(el.pool); if (pool) return pool.label; }
  return undefined;
}

/** Ensure a lane with `roleLabel` exists in `m`; return its id + pool id. When
 *  absent, create it in the first white-box pool (BPMN's process pool). Returns
 *  null when the model has no pool to hang a lane on (unlaned process). */
function ensureLane(m: Model, roleLabel: string): { laneId: string; poolId: string } | null {
  const existing = m.laneByLabel(roleLabel);
  if (existing) return { laneId: existing.id, poolId: existing.parentPool ?? "" };
  const pool = m.poolsWhiteBox()[0];
  if (!pool) return null;
  const laneId = m.id("lane");
  m.els.push({ id: laneId, type: "lane", label: roleLabel, parentPool: pool.id });
  pool.lanes = [...(pool.lanes ?? []), { id: laneId, name: roleLabel }];
  return { laneId, poolId: pool.id };
}

/** Sequence predecessors / successors of an element (sequence = untyped/"sequence"). */
const isSeq = (c: AiConnection) => !c.type || c.type === "sequence";
function preds(m: Model, id: string): AiConnection[] { return m.conns.filter((c) => isSeq(c) && c.targetId === id); }
function succs(m: Model, id: string): AiConnection[] { return m.conns.filter((c) => isSeq(c) && c.sourceId === id); }

/** Remove an element's data/message neighbourhood (the connectors, and any data
 *  element left orphaned) from `m`. */
function stripNeighbourhood(m: Model, id: string): void {
  const touching = m.conns.filter((c) => c.sourceId === id || c.targetId === id);
  for (const c of touching) {
    const otherId = c.sourceId === id ? c.targetId : c.sourceId;
    const other = m.byId(otherId);
    const isData = other && DATA_TYPES.has(other.type);
    const isMsg = c.type === "message";
    if (!isData && !isMsg) continue;
    m.conns = m.conns.filter((x) => x !== c);
    // Drop a data element that no longer connects to anything.
    if (isData && other && !m.conns.some((x) => x.sourceId === other.id || x.targetId === other.id)) {
      m.els = m.els.filter((e) => e.id !== other.id);
    }
  }
}

/** Clone B's data/message neighbourhood of `bEl` onto `aEl` in the merged model,
 *  reusing an existing same-label data element / pool where possible. */
function cloneNeighbourhood(merged: Model, bModel: Model, bEl: AiElement, aElId: string): void {
  for (const c of bModel.conns) {
    const touches = c.sourceId === bEl.id || c.targetId === bEl.id;
    if (!touches) continue;
    const otherId = c.sourceId === bEl.id ? c.targetId : c.sourceId;
    const other = bModel.byId(otherId);
    if (!other) continue;
    const isData = DATA_TYPES.has(other.type);
    const isMsg = c.type === "message";
    if (!isData && !isMsg) continue;
    // Find or create the counterpart element in the merged model (match by label + type).
    let mergedOther = merged.els.find((e) => e.type === other.type && norm(e.label) === norm(other.label));
    if (!mergedOther) {
      mergedOther = { ...JSON.parse(JSON.stringify(other)), id: merged.id("el") } as AiElement;
      merged.els.push(mergedOther);
    }
    const src = c.sourceId === bEl.id ? aElId : mergedOther.id;
    const tgt = c.targetId === bEl.id ? aElId : mergedOther.id;
    if (!merged.conns.some((x) => x.sourceId === src && x.targetId === tgt && x.type === c.type)) {
      merged.conns.push({ sourceId: src, targetId: tgt, ...(c.type ? { type: c.type } : {}), ...(c.label ? { label: c.label } : {}) });
    }
  }
}

export interface MergeResult { model: AiModel; applied: number; skipped: string[] }

export function mergeProcesses(aData: DiagramData, bData: DiagramData, decisions: MergeDecision[]): MergeResult {
  const merged = new Model(diagramToAiModel(aData));
  const bModel = new Model(diagramToAiModel(bData));
  const skipped: string[] = [];
  let applied = 0;

  for (const d of decisions) {
    const bEl = bModel.activityByLabel(d.activity);
    const aEl = merged.activityByLabel(d.activity);

    if (d.kind === "remove") {
      if (!aEl) { skipped.push(`remove "${d.activity}": not found`); continue; }
      // Bypass: connect each sequence predecessor to each successor, then drop it.
      for (const p of preds(merged, aEl.id)) for (const s of succs(merged, aEl.id)) {
        if (!merged.conns.some((c) => isSeq(c) && c.sourceId === p.sourceId && c.targetId === s.targetId)) {
          merged.conns.push({ sourceId: p.sourceId, targetId: s.targetId, type: "sequence" });
        }
      }
      stripNeighbourhood(merged, aEl.id);
      merged.conns = merged.conns.filter((c) => c.sourceId !== aEl.id && c.targetId !== aEl.id);
      merged.els = merged.els.filter((e) => e.id !== aEl.id);
      applied++;
      continue;
    }

    if (d.kind === "change") {
      if (!aEl || !bEl) { skipped.push(`change "${d.activity}": not matched`); continue; }
      // Task type.
      if (bEl.taskType) aEl.taskType = bEl.taskType; else delete aEl.taskType;
      // Role (lane).
      const bRole = roleOf(bModel, bEl);
      if (bRole && roleOf(merged, aEl) !== bRole) {
        const placed = ensureLane(merged, bRole);
        if (placed) { aEl.lane = placed.laneId; aEl.pool = placed.poolId; }
        else skipped.push(`change "${d.activity}": no pool for role "${bRole}"`);
      }
      // Systems + data (data/message neighbourhood): resync to B's.
      stripNeighbourhood(merged, aEl.id);
      cloneNeighbourhood(merged, bModel, bEl, aEl.id);
      applied++;
      continue;
    }

    // kind === "add": bring B's activity across and splice into the sequence.
    if (!bEl) { skipped.push(`add "${d.activity}": not found in source`); continue; }
    if (aEl) { skipped.push(`add "${d.activity}": already present`); continue; }
    const newId = merged.id("act");
    const clone: AiElement = { ...JSON.parse(JSON.stringify(bEl)), id: newId };
    delete clone.pool; delete clone.lane;
    const bRole = roleOf(bModel, bEl);
    if (bRole) {
      const placed = ensureLane(merged, bRole);
      if (placed) { clone.lane = placed.laneId; clone.pool = placed.poolId; }
    }
    merged.els.push(clone);
    cloneNeighbourhood(merged, bModel, bEl, newId);
    // Splice: for B's sequence predecessors/successors that map (by label) to an
    // activity present in merged, wire predMerged → new → succMerged.
    const mapAct = (bid: string): AiElement | undefined => {
      const be = bModel.byId(bid);
      return be ? merged.activityByLabel(be.label) : undefined;
    };
    let wired = false;
    for (const p of preds(bModel, bEl.id)) {
      const mp = mapAct(p.sourceId);
      if (mp) { merged.conns.push({ sourceId: mp.id, targetId: newId, type: "sequence" }); wired = true; }
    }
    for (const s of succs(bModel, bEl.id)) {
      const ms = mapAct(s.targetId);
      if (ms) { merged.conns.push({ sourceId: newId, targetId: ms.id, type: "sequence" }); wired = true; }
    }
    // Remove any now-redundant direct pred→succ edge we just interrupted.
    for (const p of preds(bModel, bEl.id)) for (const s of succs(bModel, bEl.id)) {
      const mp = mapAct(p.sourceId), ms = mapAct(s.targetId);
      if (mp && ms) merged.conns = merged.conns.filter((c) => !(isSeq(c) && c.sourceId === mp.id && c.targetId === ms.id));
    }
    if (!wired) skipped.push(`add "${d.activity}": no shared neighbour to attach to`);
    applied++;
  }

  return { model: { elements: merged.els, connections: merged.conns }, applied, skipped };
}
