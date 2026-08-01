/**
 * Deterministic BPMN → SopSkeleton extractor (no AI).
 *
 * Reuses the canonical control-flow order (`buildAnimationOrder`) and the shared
 * container-membership helpers (`laneOf`/`poolOf`/`isInside`). Steps keep their
 * GLOBAL process number even when the skeleton is scoped to one lane, so a
 * role-specific SOP reads "step 4 … step 7" and cross-lane hand-offs (received
 * from / handed off to other lanes) are surfaced explicitly.
 */
import type { Connector, DiagramData, DiagramElement } from "../diagram/types";
import { indexById, laneOf, poolOf, isInside, type ElementIndex } from "../diagram/containment";
import { buildAnimationOrder } from "../diagram/animateOrder";
import { getRiskControl } from "../diagram/riskControl";
import type { SopHandoff, SopScope, SopSkeleton, SopStep } from "./skeleton";

const STEP_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);
const DATA_TYPES = new Set(["data-object", "data-store"]);

export interface ExtractOptions {
  scope: SopScope;
  /** lane / pool / subprocess element id — required for those scopes. */
  scopeElementId?: string;
  diagramId?: string;
  diagramName?: string;
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

export function extractSkeleton(data: DiagramData, opts: ExtractOptions): SopSkeleton {
  const elements: DiagramElement[] = data.elements ?? [];
  const connectors: Connector[] = data.connectors ?? [];
  const byId: ElementIndex = indexById(elements);
  const labelOf = (e: DiagramElement | undefined): string =>
    e ? (e.label?.trim() || `<unnamed ${e.type}>`) : "";

  // The responsible role for an element = its lane label, else its pool label.
  const roleOf = (el: DiagramElement | undefined): string => {
    const lane = laneOf(el, byId);
    if (lane) return labelOf(lane);
    const pool = poolOf(el, byId);
    return pool ? labelOf(pool) : "Unassigned";
  };
  // The container id used for lane/pool scope comparison.
  const laneOrPoolId = (el: DiagramElement | undefined): string | null =>
    laneOf(el, byId)?.id ?? poolOf(el, byId)?.id ?? null;

  // ---- 1. Global step order (whole process), 1-based numbers -------------------
  const order = buildAnimationOrder(data, "bfs");
  const orderedSteps: DiagramElement[] = [];
  for (const id of order) {
    const el = byId.get(id);
    if (el && STEP_TYPES.has(el.type)) orderedSteps.push(el);
  }
  const globalNo = new Map<string, number>();
  orderedSteps.forEach((el, i) => globalNo.set(el.id, i + 1));

  // ---- 2. Data reads/writes + IT-system message touches per element ------------
  const reads = new Map<string, string[]>();
  const writes = new Map<string, string[]>();
  const systems = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    if (!v) return; const a = m.get(k) ?? []; a.push(v); m.set(k, a);
  };
  for (const c of connectors) {
    if (c.type !== "associationBPMN" && c.type !== "association") continue;
    const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const srcIsData = DATA_TYPES.has(src.type), tgtIsData = DATA_TYPES.has(tgt.type);
    if (srcIsData === tgtIsData) continue;
    const taskEl = srcIsData ? tgt : src, dataEl = srcIsData ? src : tgt;
    const directed = c.directionType === "directed" || c.directionType === "open-directed";
    const target = dataEl.type === "data-store" ? systems : (srcIsData ? reads : writes);
    if (dataEl.type === "data-store") push(systems, taskEl.id, labelOf(dataEl));
    else if (!directed) push(reads, taskEl.id, labelOf(dataEl)); // "uses" → treat as input
    else push(target, taskEl.id, labelOf(dataEl));
  }
  // Messages to/from an IT-system pool = a system the step interacts with.
  for (const c of connectors) {
    if (c.type !== "message" && c.type !== "messageBPMN") continue;
    const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const srcPool = src.type === "pool" ? src : null, tgtPool = tgt.type === "pool" ? tgt : null;
    if (srcPool && srcPool.properties?.isSystem && !tgtPool) push(systems, tgt.id, labelOf(srcPool));
    else if (tgtPool && tgtPool.properties?.isSystem && !srcPool) push(systems, src.id, labelOf(tgtPool));
  }

  // ---- 3. Decisions: a diverging gateway right after a step --------------------
  const outgoing = new Map<string, Connector[]>();
  for (const c of connectors) {
    if (c.type !== "sequence" && c.type !== "flow" && c.type !== "flowline") continue;
    const a = outgoing.get(c.sourceId) ?? []; a.push(c); outgoing.set(c.sourceId, a);
  }
  const decisionAtStep = new Map<string, { question: string; branches: { label: string; toStep?: number }[] }>();
  for (const el of elements) {
    if (el.type !== "gateway") continue;
    const outs = outgoing.get(el.id) ?? [];
    if (outs.length < 2) continue; // merge/simple → not a decision
    const branches = outs.map((c) => {
      const tgt = byId.get(c.targetId);
      // Resolve the branch's first downstream step number, if any.
      const toStep = tgt && STEP_TYPES.has(tgt.type) ? globalNo.get(tgt.id) : undefined;
      return { label: c.label?.trim() || labelOf(tgt), toStep };
    });
    // Attach to the step(s) flowing INTO this gateway.
    for (const c of connectors) {
      if ((c.type === "sequence" || c.type === "flow" || c.type === "flowline") && c.targetId === el.id) {
        const from = byId.get(c.sourceId);
        if (from && STEP_TYPES.has(from.type)) {
          decisionAtStep.set(from.id, { question: labelOf(el) || "Decision", branches });
        }
      }
    }
  }

  // ---- 4. Hand-offs: sequence/message connectors crossing a lane/pool boundary -
  const handoffsIn: SopHandoff[] = [];
  const handoffsOut: SopHandoff[] = [];
  const stepHandoffIn = new Map<string, SopHandoff>();
  const stepHandoffOut = new Map<string, SopHandoff>();
  const scopeId = opts.scopeElementId;
  const elInScope = (el: DiagramElement | undefined): boolean => {
    if (!el) return false;
    switch (opts.scope) {
      case "lane": return laneOf(el, byId)?.id === scopeId;
      case "pool": return poolOf(el, byId)?.id === scopeId;
      case "subprocess": return scopeId ? isInside(el, scopeId, byId) : true;
      default: return true; // whole / group
    }
  };
  for (const c of connectors) {
    const isSeq = c.type === "sequence" || c.type === "flow" || c.type === "flowline";
    const isMsg = c.type === "message" || c.type === "messageBPMN";
    if (!isSeq && !isMsg) continue;
    const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
    if (!src || !tgt || src.type === "pool" || tgt.type === "pool") continue;
    const srcRole = roleOf(src), tgtRole = roleOf(tgt);
    if (srcRole === tgtRole || laneOrPoolId(src) === laneOrPoolId(tgt)) continue; // same lane → no hand-off
    const what = c.label?.trim() || undefined;
    // Only record hand-offs that touch the scope (for whole scope, both sides are in scope).
    if (elInScope(src)) { const h = { to: tgtRole, what }; handoffsOut.push(h); if (STEP_TYPES.has(src.type)) stepHandoffOut.set(src.id, h); }
    if (elInScope(tgt)) { const h = { from: srcRole, what }; handoffsIn.push(h); if (STEP_TYPES.has(tgt.type)) stepHandoffIn.set(tgt.id, h); }
  }

  // ---- 5. Assemble scope-filtered steps (global numbers preserved) ------------
  const steps: SopStep[] = [];
  for (const el of orderedSteps) {
    if (!elInScope(el)) continue;
    const rc = getRiskControl(el);
    steps.push({
      globalNo: globalNo.get(el.id)!,
      label: labelOf(el),
      role: roleOf(el),
      taskType: (el.taskType && el.taskType !== "none") ? el.taskType : undefined,
      systems: uniq(systems.get(el.id) ?? []),
      inputs: uniq(reads.get(el.id) ?? []),
      outputs: uniq(writes.get(el.id) ?? []),
      decision: decisionAtStep.get(el.id),
      handoffIn: stepHandoffIn.get(el.id),
      handoffOut: stepHandoffOut.get(el.id),
      risks: uniq((rc.riskRefs ?? []).map((r) => r.code)),
      controls: uniq((rc.controlRefs ?? []).map((r) => r.code)),
    });
  }

  // ---- 6. Meta + roll-ups ------------------------------------------------------
  const scopeLabel = scopeId ? labelOf(byId.get(scopeId)) : undefined;
  const rcItems = new Map<string, { code: string; label: string; kind: "risk" | "control" }>();
  for (const el of elements) {
    if (!elInScope(el)) continue;
    const rc = getRiskControl(el);
    for (const r of rc.riskRefs ?? []) rcItems.set(`risk:${r.itemId}`, { code: r.code, label: r.label, kind: "risk" });
    for (const r of rc.controlRefs ?? []) rcItems.set(`ctrl:${r.itemId}`, { code: r.code, label: r.label, kind: "control" });
  }
  const references: SopSkeleton["references"] = [];
  for (const el of elements) {
    if (!elInScope(el)) continue;
    const linked = el.properties?.linkedDiagramId as string | undefined;
    if (linked) references.push({ kind: "subprocess", diagramId: linked, label: labelOf(el) });
  }
  for (const pid of data.parentDiagramIds ?? []) references.push({ kind: "parent", diagramId: pid });

  const dedupeHandoffs = (hs: SopHandoff[]): SopHandoff[] => {
    const seen = new Set<string>(); const out: SopHandoff[] = [];
    for (const h of hs) { const k = `${h.from ?? ""}>${h.to ?? ""}>${h.what ?? ""}`; if (!seen.has(k)) { seen.add(k); out.push(h); } }
    return out;
  };

  const scopeTitleSuffix = scopeLabel ? ` — ${scopeLabel}` : "";
  return {
    meta: {
      title: `${opts.diagramName?.trim() || "Process"}${scopeTitleSuffix}`,
      scope: opts.scope,
      scopeLabel,
      diagramId: opts.diagramId,
      diagramName: opts.diagramName,
      owner: data.processOwner ? { name: data.processOwner.name, email: data.processOwner.email } : undefined,
      pcf: data.pcf ? { hierarchyId: data.pcf.hierarchyId, name: data.pcf.name, frameworkName: data.pcf.frameworkName } : undefined,
      version: data.title?.version || data.nameCode,
    },
    roles: uniq(steps.map((s) => s.role)),
    steps,
    inputs: uniq(steps.flatMap((s) => s.inputs)),
    outputs: uniq(steps.flatMap((s) => s.outputs)),
    systems: uniq(steps.flatMap((s) => s.systems)),
    risksControls: [...rcItems.values()],
    handoffsIn: dedupeHandoffs(handoffsIn),
    handoffsOut: dedupeHandoffs(handoffsOut),
    references,
  };
}
