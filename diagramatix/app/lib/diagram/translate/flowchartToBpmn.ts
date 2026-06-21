/**
 * Deterministic Standard-Flowchart → BPMN transform (one-way).
 *
 * Takes a flowchart `DiagramData` and produces an AI-plan-shaped graph
 * (`AiElement[]` + `AiConnection[]`) that is fed straight into the existing
 * `layoutBpmnDiagram` engine — so positioning + connector waypoints come from
 * the proven BPMN layout (avoids the "connector without waypoints crashes the
 * editor" regression), and no new layout code is needed.
 *
 * Shape→BPMN rules come from the canonical FLOWCHART_TO_BPMN_MAP, the same table
 * that drives the AI image→BPMN prompt.
 *
 * The transform:
 *   1. classifies every element (control / artifact / stub) via the map;
 *   2. splices out on/off-page connector stubs (flow continuation, incl. label-
 *      matched off-page jump pairs);
 *   3. splices data artifacts out of the sequence and re-attaches them by
 *      association to the adjacent activity;
 *   4. resolves terminators to start/end events by in/out degree;
 *   5. maps decisions/merges to exclusive gateways, preserving branch labels;
 *   6. maps vertical swimlanes to a white-box pool + one lane each, assigning
 *      nodes to lanes by centre-x containment.
 */

import type { DiagramData, DiagramElement, Connector } from "../types";
import type { AiElement, AiConnection } from "../bpmnLayout";
import { mapFlowchartType, type FlowchartBpmnMapping } from "./flowchartBpmnMap";

export interface TranslationReport {
  processName: string;
  taskCount: number;
  gatewayCount: number;
  eventCount: number;       // start + end + intermediate
  subprocessCount: number;
  dataObjectCount: number;
  dataStoreCount: number;
  laneCount: number;
  /** Shapes mapped to an approximate BPMN type (e.g. preparation → task). */
  approximations: string[];
  /** On/off-page connectors that were spliced away. */
  splices: string[];
  /** Elements that could not be placed in the flow and were dropped. */
  drops: string[];
}

export interface TranslateResult {
  aiElements: AiElement[];
  aiConnections: AiConnection[];
  report: TranslationReport;
}

interface Edge {
  from: string;
  to: string;
  label?: string;
}

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();
const centreX = (el: DiagramElement) => el.x + el.width / 2;

/**
 * Translate a flowchart diagram into a BPMN AI-plan graph + a report.
 */
export function translateFlowchartToBpmn(
  data: DiagramData,
  opts: { processName: string },
): TranslateResult {
  const processName = opts.processName?.trim() || "Process";
  const elements = data.elements ?? [];
  const flowlines = (data.connectors ?? []).filter((c) => c.sourceId && c.targetId);

  const byId = new Map(elements.map((e) => [e.id, e]));
  const mapOf = new Map<string, FlowchartBpmnMapping>(
    elements.map((e) => [e.id, mapFlowchartType(e.type)]),
  );

  const isStub = (id: string) => mapOf.get(id)?.kind === "stub";
  const isArtifact = (id: string) => mapOf.get(id)?.kind === "artifact";
  const swimlanes = elements
    .filter((e) => e.type === "flowchart-vswimlane")
    .sort((a, b) => a.x - b.x);
  const isSwimlane = (id: string) => byId.get(id)?.type === "flowchart-vswimlane";

  const report: TranslationReport = {
    processName,
    taskCount: 0,
    gatewayCount: 0,
    eventCount: 0,
    subprocessCount: 0,
    dataObjectCount: 0,
    dataStoreCount: 0,
    laneCount: 0,
    approximations: [],
    splices: [],
    drops: [],
  };

  // ── 1. Bridge off-page jump pairs ─────────────────────────────────────────
  // A connector stub that flow ENTERS but never leaves ("go to page A") is the
  // jump source; a stub that flow LEAVES but never enters ("from page A") is
  // the continuation. Match them by label and add a virtual edge so the
  // walk-through below can follow the jump.
  const outAdj = new Map<string, Edge[]>();
  const inDeg = new Map<string, number>();
  for (const c of flowlines) {
    if (!byId.has(c.sourceId) || !byId.has(c.targetId)) continue;
    (outAdj.get(c.sourceId) ?? outAdj.set(c.sourceId, []).get(c.sourceId)!).push({
      from: c.sourceId,
      to: c.targetId,
      label: c.label,
    });
    inDeg.set(c.targetId, (inDeg.get(c.targetId) ?? 0) + 1);
  }
  const hasOut = (id: string) => (outAdj.get(id)?.length ?? 0) > 0;
  const hasIn = (id: string) => (inDeg.get(id) ?? 0) > 0;

  const stubIds = elements.filter((e) => isStub(e.id)).map((e) => e.id);
  const byLabel = new Map<string, string[]>();
  for (const id of stubIds) {
    const key = norm(byId.get(id)?.label);
    if (!key) continue;
    (byLabel.get(key) ?? byLabel.set(key, []).get(key)!).push(id);
  }
  for (const [, group] of byLabel) {
    const enters = group.filter((id) => hasIn(id) && !hasOut(id)); // jump source
    const exits = group.filter((id) => hasOut(id) && !hasIn(id));  // continuation
    for (const a of enters) {
      for (const b of exits) {
        (outAdj.get(a) ?? outAdj.set(a, []).get(a)!).push({ from: a, to: b });
        report.splices.push(
          `Spliced off-page jump "${byId.get(a)?.label ?? a}" (${a} → ${b})`,
        );
      }
    }
  }
  for (const id of stubIds) {
    if (norm(byId.get(id)?.label) && !report.splices.some((s) => s.includes(id))) {
      report.splices.push(`Spliced on/off-page connector "${byId.get(id)?.label ?? id}"`);
    } else if (!norm(byId.get(id)?.label)) {
      report.splices.push(`Spliced connector node ${id}`);
    }
  }

  // ── 2. Real edges over non-stub nodes (walk through stubs) ─────────────────
  const realEdges: Edge[] = [];
  const realSeen = new Set<string>();
  const pushReal = (from: string, to: string, label?: string) => {
    const k = `${from}->${to}`;
    if (realSeen.has(k)) return;
    realSeen.add(k);
    realEdges.push({ from, to, label });
  };
  for (const u of elements) {
    if (isStub(u.id)) continue;
    for (const e of outAdj.get(u.id) ?? []) {
      walkThroughStubs(e.to, e.label, new Set([u.id]));
      function walkThroughStubs(node: string, label: string | undefined, visited: Set<string>) {
        if (!isStub(node)) {
          pushReal(u.id, node, label);
          return;
        }
        if (visited.has(node)) return;
        visited.add(node);
        for (const ne of outAdj.get(node) ?? []) {
          walkThroughStubs(ne.to, label || ne.label, visited);
        }
      }
    }
  }

  // ── 3. Splice artifacts out of the sequence ────────────────────────────────
  // For each artifact: bypass it in the control flow (each control predecessor
  // → each control successor) and attach it by association to an adjacent
  // activity (predecessor ⇒ output; successor-only ⇒ input).
  const seqEdges: Edge[] = [];       // control → control sequence flows
  const assocEdges: Edge[] = [];     // activity ↔ artifact associations

  const realIn = new Map<string, Edge[]>();
  const realOut = new Map<string, Edge[]>();
  for (const e of realEdges) {
    (realOut.get(e.from) ?? realOut.set(e.from, []).get(e.from)!).push(e);
    (realIn.get(e.to) ?? realIn.set(e.to, []).get(e.to)!).push(e);
  }

  for (const e of realEdges) {
    if (isArtifact(e.from) || isArtifact(e.to)) continue; // handled per-artifact below
    seqEdges.push(e);
  }
  for (const a of elements) {
    if (!isArtifact(a.id)) continue;
    const preds = (realIn.get(a.id) ?? []).filter((e) => !isArtifact(e.from));
    const succs = (realOut.get(a.id) ?? []).filter((e) => !isArtifact(e.to));
    // Bypass: stitch predecessors straight to successors.
    for (const p of preds) {
      for (const s of succs) {
        pushSeqUnique(seqEdges, p.from, s.to, p.label || s.label);
      }
    }
    // Association to the nearest activity.
    if (preds.length > 0) assocEdges.push({ from: preds[0].from, to: a.id });   // output
    else if (succs.length > 0) assocEdges.push({ from: a.id, to: succs[0].to }); // input
    else report.drops.push(`Unconnected ${a.type} "${a.label || a.id}" attached to no activity`);
  }

  // ── 4. Lane assignment (swimlanes → pool + lanes) ──────────────────────────
  const POOL_ID = "pool_main";
  const laneIdOf = new Map<string, string>(); // swimlane element id → lane id
  for (const sw of swimlanes) laneIdOf.set(sw.id, `lane_${sw.id}`);
  const laneForElement = (el: DiagramElement): string | undefined => {
    if (swimlanes.length === 0) return undefined;
    const cx = centreX(el);
    let chosen = swimlanes[0];
    for (const sw of swimlanes) {
      if (cx >= sw.x && cx <= sw.x + sw.width) return laneIdOf.get(sw.id);
      if (Math.abs(cx - centreX(sw)) < Math.abs(cx - centreX(chosen))) chosen = sw;
    }
    return laneIdOf.get(chosen.id); // nearest lane fallback
  };

  // ── 5. Build AiElements ────────────────────────────────────────────────────
  const aiElements: AiElement[] = [];

  // Pool + lanes first.
  aiElements.push({ id: POOL_ID, type: "pool", label: processName, poolType: "white-box" });
  for (const sw of swimlanes) {
    aiElements.push({
      id: laneIdOf.get(sw.id)!,
      type: "lane",
      label: sw.label || "Lane",
      parentPool: POOL_ID,
    });
    report.laneCount++;
  }

  // Degrees on the spliced sequence graph (for terminator resolution).
  const seqInDeg = new Map<string, number>();
  const seqOutDeg = new Map<string, number>();
  for (const e of seqEdges) {
    seqOutDeg.set(e.from, (seqOutDeg.get(e.from) ?? 0) + 1);
    seqInDeg.set(e.to, (seqInDeg.get(e.to) ?? 0) + 1);
  }

  for (const el of elements) {
    if (isStub(el.id) || isSwimlane(el.id)) continue;
    const m = mapOf.get(el.id)!;
    const lane = laneForElement(el);
    const base: AiElement = {
      id: el.id,
      type: m.bpmn,
      label: el.label ?? "",
      pool: POOL_ID,
      ...(lane ? { lane } : {}),
    };

    if (m.terminator) {
      // start-event if nothing flows in; end-event if nothing flows out.
      const din = seqInDeg.get(el.id) ?? 0;
      const dout = seqOutDeg.get(el.id) ?? 0;
      base.type = dout === 0 && din > 0 ? "end-event" : "start-event";
    }
    if (m.taskType) base.taskType = m.taskType;
    if (m.gatewayType) base.gatewayType = m.gatewayType;
    if (m.eventType) base.eventType = m.eventType;

    aiElements.push(base);

    // Tally + report.
    switch (base.type) {
      case "task": report.taskCount++; break;
      case "gateway": report.gatewayCount++; break;
      case "subprocess": case "subprocess-expanded": report.subprocessCount++; break;
      case "data-object": report.dataObjectCount++; break;
      case "data-store": report.dataStoreCount++; break;
      case "start-event": case "end-event": case "intermediate-event": report.eventCount++; break;
    }
    if (m.approx) report.approximations.push(`${labelOf(el)} (${el.type}) → ${base.type}`);
    if (m.note) report.approximations.push(`${labelOf(el)}: ${m.note}`);
  }

  // Give artifacts the pool/lane of their associated activity so they sit
  // inside the pool bounds.
  const elById = new Map(aiElements.map((e) => [e.id, e]));
  for (const a of assocEdges) {
    const artifactId = isArtifact(a.from) ? a.from : a.to;
    const activityId = isArtifact(a.from) ? a.to : a.from;
    const art = elById.get(artifactId);
    const act = elById.get(activityId);
    if (art && act) {
      art.pool = act.pool;
      if (act.lane) art.lane = act.lane;
    }
  }

  // ── 6. Build AiConnections ─────────────────────────────────────────────────
  const aiConnections: AiConnection[] = [];
  for (const e of seqEdges) {
    if (!elById.has(e.from) || !elById.has(e.to)) continue;
    aiConnections.push({ sourceId: e.from, targetId: e.to, type: "sequence", ...(e.label ? { label: e.label } : {}) });
  }
  // Associations: no explicit type — layoutBpmnDiagram reclassifies any
  // connector touching a data artifact to associationBPMN by geometry.
  for (const e of assocEdges) {
    if (!elById.has(e.from) || !elById.has(e.to)) continue;
    aiConnections.push({ sourceId: e.from, targetId: e.to });
  }

  return { aiElements, aiConnections, report };

  function labelOf(el: DiagramElement) {
    return el.label?.trim() ? `"${el.label.trim()}"` : el.id;
  }
}

function pushSeqUnique(arr: Edge[], from: string, to: string, label?: string) {
  if (arr.some((e) => e.from === from && e.to === to)) return;
  arr.push({ from, to, label });
}
