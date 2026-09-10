/**
 * Deterministic EPC → BPMN transform (one-way).
 *
 * Takes an EPC `DiagramData` and produces an AI-plan-shaped graph
 * (`AiElement[]` + `AiConnection[]`) fed straight into `layoutBpmnDiagram`, so
 * positioning and waypoints come from the proven BPMN layout and no new layout
 * code is needed. Shape rules come from EPC_TO_BPMN_MAP, the same table that
 * drives the AI image→BPMN prompt.
 *
 * Two rules do the real work, and both are about EVENTS.
 *
 * **Most events disappear, and that is the point.** An EPC alternates event →
 * function → event, so a faithful import puts a round shape between every two
 * tasks. That is unreadable, and it is not what the process means: the events
 * in the middle are states, not things that happen to the process from outside.
 * First event becomes a start event, last an end event, and the rest go.
 *
 * **Events straight after an XOR/OR split are branch conditions, not events.**
 * "Credit approved" and "Credit refused" become the LABELS on the gateway's
 * outgoing sequence flows. This one rule is the difference between a converted
 * EPC you would publish and one you would delete.
 *
 * **Lanes are derived, not guessed.** This is where an EPC import beats a BPMN
 * import: EPC records who does the work as an explicit relationship, so the
 * lane comes from the model rather than from inferring which band a box happens
 * to sit in.
 *
 * And it REFUSES rather than repairing. A migration that quietly fixes your
 * process model is worse than one that tells you which twelve places need a
 * human — so an unbalanced split, a connector that both splits and joins, an
 * event that decides, and a function owned by two departments are all reported
 * and left alone.
 */

import type { DiagramData, DiagramElement } from "../types";
import type { AiElement, AiConnection } from "../bpmnLayout";
import { mapEpcToBpmnType, type EpcBpmnMapping } from "./epcBpmnMap";

export interface EpcTranslationReport {
  processName: string;
  taskCount: number;
  gatewayCount: number;
  eventCount: number;
  callActivityCount: number;
  dataObjectCount: number;
  systemPoolCount: number;
  laneCount: number;
  /** Events turned into a label on a sequence flow — the readability rule. */
  branchLabels: string[];
  /** Intermediate events dropped as states rather than happenings. */
  droppedEvents: string[];
  /** Shapes mapped to an approximate BPMN type. */
  approximations: string[];
  /** Elements that could not be placed and were left out. */
  drops: string[];
  /**
   * Things the translator will NOT interpret. It emits what it can and says
   * where a person has to decide — never a silent repair.
   */
  refusals: string[];
}

export interface EpcTranslateResult {
  aiElements: AiElement[];
  aiConnections: AiConnection[];
  report: EpcTranslationReport;
}

interface Edge { from: string; to: string; label?: string }

const CONTROL_ARC = "epc-control-flow";
const GATEWAY_TYPES = new Set<string>(["epc-xor", "epc-and", "epc-or"]);
const DECISION_TYPES = new Set<string>(["epc-xor", "epc-or"]);
const POOL_ID = "pool_main";

const labelOf = (el: DiagramElement | undefined) =>
  el?.label?.trim() ? el.label.trim() : (el?.id ?? "");
const quoted = (el: DiagramElement | undefined) =>
  el?.label?.trim() ? `"${el.label.trim()}"` : (el?.id ?? "");

export function translateEpcToBpmn(
  data: DiagramData,
  opts: { processName: string },
): EpcTranslateResult {
  const processName = opts.processName?.trim() || "Process";
  const elements = data.elements ?? [];
  const connectors = (data.connectors ?? []).filter((c) => c.sourceId && c.targetId);

  const byId = new Map(elements.map((e) => [e.id, e]));
  const mapOf = new Map<string, EpcBpmnMapping>(
    elements.map((e) => [e.id, mapEpcToBpmnType(e.type)]),
  );
  const kindOf = (id: string) => mapOf.get(id)?.kind;
  const typeOf = (id: string) => byId.get(id)?.type ?? "";

  const report: EpcTranslationReport = {
    processName,
    taskCount: 0, gatewayCount: 0, eventCount: 0, callActivityCount: 0,
    dataObjectCount: 0, systemPoolCount: 0, laneCount: 0,
    branchLabels: [], droppedEvents: [], approximations: [], drops: [], refusals: [],
  };

  // ── 1. The control flow ───────────────────────────────────────────────────
  // Only control-flow arcs carry sequence. An untyped connector between two
  // flow-carrying shapes is accepted too: a hand-drawn or imported diagram may
  // predate the typed arcs, and refusing it would lose the whole process.
  const carriesFlow = (id: string) => {
    const k = kindOf(id);
    return k === "activity" || k === "event" || k === "gateway" || k === "call";
  };
  const flowEdges: Edge[] = [];
  const otherEdges: Edge[] = [];
  for (const c of connectors) {
    if (!byId.has(c.sourceId) || !byId.has(c.targetId)) continue;
    const e: Edge = { from: c.sourceId, to: c.targetId, label: c.label };
    const isControl = c.type === CONTROL_ARC
      || (!String(c.type ?? "").startsWith("epc-") && carriesFlow(c.sourceId) && carriesFlow(c.targetId));
    (isControl ? flowEdges : otherEdges).push(e);
  }

  const outAdj = new Map<string, Edge[]>();
  const inAdj = new Map<string, Edge[]>();
  for (const e of flowEdges) {
    (outAdj.get(e.from) ?? outAdj.set(e.from, []).get(e.from)!).push(e);
    (inAdj.get(e.to) ?? inAdj.set(e.to, []).get(e.to)!).push(e);
  }
  const outs = (id: string) => outAdj.get(id) ?? [];
  const ins = (id: string) => inAdj.get(id) ?? [];

  // ── 2. What it will not interpret ─────────────────────────────────────────
  collectRefusals(elements, byId, kindOf, typeOf, outs, ins, otherEdges, report);

  // ── 3. Events: keep the ends, label the branches, drop the middle ─────────
  // A `null` verdict means the node stays as a real BPMN element.
  type EventFate =
    | { kind: "start" } | { kind: "end" }
    | { kind: "branch-label"; text: string }
    | { kind: "drop" };
  const eventFate = new Map<string, EventFate>();

  for (const el of elements) {
    if (kindOf(el.id) !== "event") continue;
    const din = ins(el.id).length, dout = outs(el.id).length;
    if (din === 0) { eventFate.set(el.id, { kind: "start" }); continue; }
    if (dout === 0) { eventFate.set(el.id, { kind: "end" }); continue; }

    // A branch condition: its ONLY predecessor is a connector that splits.
    const preds = ins(el.id);
    const soleSplit = preds.length === 1
      && GATEWAY_TYPES.has(typeOf(preds[0].from))
      && outs(preds[0].from).length >= 2;
    if (soleSplit && labelOf(el)) {
      eventFate.set(el.id, { kind: "branch-label", text: labelOf(el) });
      report.branchLabels.push(`${quoted(el)} became the label on a branch out of the decision`);
      continue;
    }
    eventFate.set(el.id, { kind: "drop" });
    report.droppedEvents.push(`${quoted(el)} — a state between two steps, not something that happens to the process`);
  }

  // ── 4. Splice out everything that is not a BPMN node ──────────────────────
  // Dropped events, branch-label events and information objects all leave the
  // sequence; each predecessor is stitched to each successor, carrying the
  // branch wording forward where there is any.
  const spliced = new Set<string>();
  for (const [id, fate] of eventFate) if (fate.kind !== "start" && fate.kind !== "end") spliced.add(id);
  for (const el of elements) if (kindOf(el.id) === "artifact") spliced.add(el.id);

  const seqEdges: Edge[] = [];
  const pushSeq = (from: string, to: string, label?: string) => {
    if (from === to) return;
    const existing = seqEdges.find((e) => e.from === from && e.to === to);
    if (existing) { if (!existing.label && label) existing.label = label; return; }
    seqEdges.push({ from, to, label });
  };

  /** Follow a chain of spliced nodes to the real BPMN nodes beyond it. */
  const resolveForward = (id: string, carried: string | undefined, seen: Set<string>): Array<{ to: string; label?: string }> => {
    if (!spliced.has(id)) return [{ to: id, label: carried }];
    if (seen.has(id)) return [];
    seen.add(id);
    const fate = eventFate.get(id);
    const label = fate?.kind === "branch-label" ? fate.text : carried;
    const out: Array<{ to: string; label?: string }> = [];
    for (const e of outs(id)) out.push(...resolveForward(e.to, label || e.label, seen));
    return out;
  };

  for (const e of flowEdges) {
    if (spliced.has(e.from)) continue;           // reached via its predecessor
    for (const t of resolveForward(e.to, e.label, new Set())) pushSeq(e.from, t.to, t.label);
  }

  // ── 5. Lanes, derived from the model ──────────────────────────────────────
  // An org unit becomes a lane, and every function joined to it goes in that
  // lane. No geometry is consulted: that is the whole advantage of EPC as a
  // source, and it is why an EPC import beats a BPMN import here.
  // Keyed by NAME, not by element id. An EPC draws the same organisational
  // unit beside every function it carries out — and a generated EPC synthesises
  // a fresh satellite box for each one — so "Sales Department" appears as many
  // times as it does work. One lane per box would give a pool with four lanes
  // all called the same thing, which is what the ARIS sample turned up.
  const laneOfElement = new Map<string, string>(); // function id → lane id
  const laneIdOf = new Map<string, string>();      // org element id → lane id
  const laneIdByName = new Map<string, string>();  // normalised name → lane id
  const laneLabel = new Map<string, string>();     // lane id → label as drawn
  for (const el of elements) {
    if (kindOf(el.id) !== "lane") continue;
    const label = labelOf(el) || "Lane";
    const key = label.trim().toLowerCase();
    let laneId = laneIdByName.get(key);
    if (!laneId) {
      laneId = `lane_${el.id}`;
      laneIdByName.set(key, laneId);
      laneLabel.set(laneId, label);
    }
    laneIdOf.set(el.id, laneId);
  }
  for (const e of otherEdges) {
    const [orgId, fnId] = kindOf(e.from) === "lane" ? [e.from, e.to] : [e.to, e.from];
    if (kindOf(orgId) !== "lane") continue;
    if (!laneIdOf.has(orgId)) continue;
    if (laneOfElement.has(fnId)) continue;  // first wins; the second is a refusal, reported above
    laneOfElement.set(fnId, laneIdOf.get(orgId)!);
  }

  // ── 6. Build the BPMN elements ────────────────────────────────────────────
  const aiElements: AiElement[] = [];
  aiElements.push({ id: POOL_ID, type: "pool", label: processName, poolType: "white-box" });
  for (const [laneId, label] of laneLabel) {
    aiElements.push({ id: laneId, type: "lane", label, parentPool: POOL_ID, pool: POOL_ID });
    report.laneCount++;
  }

  // One pool per SYSTEM, not per box — see the lane comment above; an EPC draws
  // the same application system beside every function it supports.
  const systemPoolOf = new Map<string, string>();   // element id → pool id
  const systemPoolLabel = new Map<string, string>(); // pool id → label
  {
    const byName = new Map<string, string>();
    for (const el of elements) {
      if (kindOf(el.id) !== "system-pool") continue;
      const label = labelOf(el) || "System";
      const key = label.trim().toLowerCase();
      let poolId = byName.get(key);
      if (!poolId) { poolId = el.id; byName.set(key, poolId); systemPoolLabel.set(poolId, label); }
      systemPoolOf.set(el.id, poolId);
    }
  }

  const seqIn = new Map<string, number>(), seqOut = new Map<string, number>();
  for (const e of seqEdges) {
    seqOut.set(e.from, (seqOut.get(e.from) ?? 0) + 1);
    seqIn.set(e.to, (seqIn.get(e.to) ?? 0) + 1);
  }

  for (const el of elements) {
    const m = mapOf.get(el.id)!;
    if (spliced.has(el.id) && m.kind !== "artifact") continue;
    if (m.kind === "lane") continue;

    if (m.kind === "system-pool") {
      // The house convention: a system of record IS the black-box IT system
      // pool, never a data store. Emitted once per system.
      if (systemPoolOf.get(el.id) !== el.id) continue;
      aiElements.push({
        id: el.id, type: "pool", label: systemPoolLabel.get(el.id) ?? labelOf(el) ?? "System",
        poolType: "black-box", isSystem: true,
      });
      report.systemPoolCount++;
      continue;
    }

    const lane = laneOfElement.get(el.id);
    const base: AiElement = {
      id: el.id, type: m.bpmn, label: labelOf(el),
      pool: POOL_ID, ...(lane ? { lane } : {}),
    };
    if (m.kind === "event") {
      base.type = eventFate.get(el.id)?.kind === "end" ? "end-event" : "start-event";
    }
    if (m.taskType) base.taskType = m.taskType;
    if (m.gatewayType) base.gatewayType = m.gatewayType;
    if (m.subprocessType) base.subprocessType = m.subprocessType;
    aiElements.push(base);

    switch (base.type) {
      case "task": report.taskCount++; break;
      case "gateway": report.gatewayCount++; break;
      case "subprocess": report.callActivityCount++; break;
      case "data-object": report.dataObjectCount++; break;
      case "start-event": case "end-event": report.eventCount++; break;
    }
    if (m.approx) report.approximations.push(`${quoted(el)} (${el.type}) → ${base.type}`);
    if (m.note) report.approximations.push(`${quoted(el)}: ${m.note}`);
  }

  // ── 7. Associations and message flows ─────────────────────────────────────
  const elById = new Map(aiElements.map((e) => [e.id, e]));
  const aiConnections: AiConnection[] = [];
  for (const e of seqEdges) {
    if (!elById.has(e.from) || !elById.has(e.to)) continue;
    aiConnections.push({ sourceId: e.from, targetId: e.to, type: "sequence", ...(e.label ? { label: e.label } : {}) });
  }

  for (const e of otherEdges) {
    const aKind = kindOf(e.from), bKind = kindOf(e.to);
    // Information object ↔ function: an association, and the artifact takes its
    // function's pool and lane so it sits inside the pool bounds.
    if (aKind === "artifact" || bKind === "artifact") {
      const artId = aKind === "artifact" ? e.from : e.to;
      const actId = aKind === "artifact" ? e.to : e.from;
      const art = elById.get(artId), act = elById.get(actId);
      if (!art || !act) continue;
      art.pool = act.pool;
      if (act.lane) art.lane = act.lane;
      aiConnections.push({ sourceId: e.from, targetId: e.to });
      continue;
    }
    // Application system ↔ function: a message flow to the black-box pool. The
    // endpoint is resolved through systemPoolOf, or a flow would point at a box
    // that was folded into another and no longer exists.
    if (aKind === "system-pool" || bKind === "system-pool") {
      const from = systemPoolOf.get(e.from) ?? e.from;
      const to = systemPoolOf.get(e.to) ?? e.to;
      if (!elById.has(from) || !elById.has(to)) continue;
      if (aiConnections.some((c) => c.sourceId === from && c.targetId === to && c.type === "message")) continue;
      aiConnections.push({ sourceId: from, targetId: to, type: "message" });
    }
  }

  // Anything the flow never reached.
  for (const el of elements) {
    if (spliced.has(el.id) || kindOf(el.id) === "lane") continue;
    if (elById.has(el.id)) continue;
    // Folded into another box of the same name, not lost.
    if (systemPoolOf.has(el.id)) continue;
    report.drops.push(`${quoted(el)} (${el.type}) could not be placed in the flow`);
  }

  return { aiElements, aiConnections, report };
}

/**
 * The four things the translator will not guess at.
 *
 * Every one of them is a question only a person can answer, and every one has
 * a tempting wrong answer: close the branch with a join of the type that seems
 * likely, read a decision out of an event, pick the first of two departments.
 * Doing any of that produces a model that looks finished and is wrong in a way
 * nobody will find until it matters.
 */
function collectRefusals(
  elements: DiagramElement[],
  byId: Map<string, DiagramElement>,
  kindOf: (id: string) => string | undefined,
  typeOf: (id: string) => string,
  outs: (id: string) => Edge[],
  ins: (id: string) => Edge[],
  /** Assignment and information arcs. E7 lives entirely here: an org unit is
   *  joined to its function by an ASSIGNMENT arc, which is not control flow, so
   *  the sequence adjacency above cannot see it. */
  otherEdges: Edge[],
  report: EpcTranslationReport,
): void {
  const name = (id: string) => quoted(byId.get(id));

  for (const el of elements) {
    const t = typeOf(el.id);

    // E3 — an event that decides. An event is passive, so a chain that puts an
    // XOR after one is not saying what it appears to say, and the gateway's
    // condition is nowhere in the model.
    if (kindOf(el.id) === "event") {
      for (const e of outs(el.id)) {
        if (DECISION_TYPES.has(typeOf(e.to)) && outs(e.to).length >= 2) {
          report.refusals.push(
            `${quoted(el)} is an event followed by a decision. An event cannot decide, so there is nothing in the model that says what the gateway tests — a person has to supply the condition.`,
          );
        }
      }
    }

    // E4 — a connector that both splits and joins says nothing about which
    // arrives before which, so there is no correct pair of gateways to emit.
    if (GATEWAY_TYPES.has(t) && ins(el.id).length >= 2 && outs(el.id).length >= 2) {
      report.refusals.push(
        `${quoted(el)} both joins ${ins(el.id).length} inputs and splits ${outs(el.id).length} outputs. Which happens first is not recorded, so it cannot become one gateway or two.`,
      );
    }
  }

  // E5 — an unbalanced split. Real EPCs violate this constantly, and the fix
  // depends on what the process actually does.
  for (const kind of ["epc-xor", "epc-and", "epc-or"]) {
    const splits = elements.filter((e) => typeOf(e.id) === kind && outs(e.id).length >= 2).length;
    const joins = elements.filter((e) => typeOf(e.id) === kind && ins(e.id).length >= 2).length;
    if (splits === joins) continue;
    const label = kind === "epc-xor" ? "XOR" : kind === "epc-and" ? "AND" : "OR";
    report.refusals.push(
      `${splits} ${label} split${splits === 1 ? "" : "s"} but ${joins} ${label} join${joins === 1 ? "" : "s"}. Branches that open and never close leave the BPMN with no single end, and closing them is a decision about the process, not about the drawing.`,
    );
  }

  // E7 — two departments on one function. Lane derivation needs one answer.
  const orgCount = new Map<string, string[]>();
  for (const e of otherEdges) {
    const [orgId, fnId] = kindOf(e.from) === "lane" ? [e.from, e.to] : [e.to, e.from];
    if (kindOf(orgId) !== "lane" || kindOf(fnId) !== "activity") continue;
    const list = orgCount.get(fnId) ?? orgCount.set(fnId, []).get(fnId)!;
    if (!list.includes(orgId)) list.push(orgId);
  }
  for (const [fnId, orgs] of orgCount) {
    if (orgs.length < 2) continue;
    report.refusals.push(
      `${name(fnId)} is assigned to ${orgs.length} organisational units (${orgs.map(name).join(", ")}). Only one can be the lane; the translation used the first and a person should confirm it.`,
    );
  }
}
