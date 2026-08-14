/**
 * BPMN 2.0 XML EXPORTER — the inverse of importBpmnXml.ts. Serialises a
 * Diagramatix BPMN DiagramData to standard OMG BPMN 2.0 interchange XML
 * (`bpmn:` / `bpmndi:` / `dc:` / `di:` prefixes, the bpmn.io / Camunda
 * convention), including the BPMNDI diagram section with real shape bounds and
 * connector waypoints, so the file opens laid-out in other BPMN tools and
 * round-trips back through importBpmnXml.
 *
 * Structure:
 *  - Pools (type "pool") → <participant> in a <collaboration>; a white-box pool
 *    (has flow nodes) gets a <process>, a black-box pool does not. Message flows
 *    live at collaboration level. No pools → a single <process>.
 *  - Lanes → <laneSet>/<lane> with <flowNodeRef> (transparent — they group, they
 *    don't nest); sub-lanes nest via <childLaneSet>.
 *  - Sub-process children (parentId chain) NEST inside their <subProcess>.
 *
 * Fidelity notes: incoming/outgoing refs are omitted (derived on import);
 * single-lane pools may be absorbed on re-import (matches the importer). Node
 * types with no BPMN equivalent (pain points, issues, review comments) are
 * skipped.
 */
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

// ── XML helpers ────────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function attr(name: string, val: string | number | undefined | null): string {
  if (val === undefined || val === null || val === "") return "";
  return ` ${name}="${esc(String(val))}"`;
}
/** BPMN ids must be NCNames (no leading digit). Prefix to guarantee validity. */
const nid = (id: string) => `id_${String(id).replace(/[^A-Za-z0-9_.-]/g, "_")}`;

// ── Reverse type maps (Diagramatix → BPMN local name) ──────────────────────
const TASK_ELEMENT: Record<string, string> = {
  none: "task", user: "userTask", service: "serviceTask", send: "sendTask",
  receive: "receiveTask", script: "scriptTask", manual: "manualTask", "business-rule": "businessRuleTask",
};
const GATEWAY_ELEMENT: Record<string, string> = {
  exclusive: "exclusiveGateway", inclusive: "inclusiveGateway", parallel: "parallelGateway",
  "event-based": "eventBasedGateway", complex: "complexGateway",
};
const EVENT_DEF: Record<string, string> = {
  message: "messageEventDefinition", timer: "timerEventDefinition", error: "errorEventDefinition",
  signal: "signalEventDefinition", escalation: "escalationEventDefinition", cancel: "cancelEventDefinition",
  compensation: "compensateEventDefinition", conditional: "conditionalEventDefinition",
  link: "linkEventDefinition", terminate: "terminateEventDefinition",
};

// Elements that render as flow NODES inside a process (not pools/lanes/annotations-as-artifacts).
const NON_NODE = new Set<string>(["pool", "lane", "sublane", "uml-pain-point", "uml-issue", "review-comment"]);

export function buildBpmnXml(data: DiagramData, diagramName: string): string {
  const elements = (data.elements ?? []).filter((e) => !["uml-pain-point", "uml-issue", "review-comment"].includes(e.type));
  const connectors = data.connectors ?? [];
  const byId = new Map(elements.map((e) => [e.id, e] as const));

  const isPool = (e: DiagramElement) => e.type === "pool";
  const isLane = (e: DiagramElement) => e.type === "lane" || e.type === "sublane";
  const isNode = (e: DiagramElement) => !NON_NODE.has(e.type);

  // Nearest ancestor of each kind by walking the parentId chain.
  const poolOf = (e: DiagramElement): string | null => {
    let cur: DiagramElement | undefined = e;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === "pool") return cur.id;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return null;
  };
  // The nearest SUBPROCESS ancestor (lanes are transparent) → null = process root.
  const subprocessOf = (e: DiagramElement): string | null => {
    let cur = e.parentId ? byId.get(e.parentId) : undefined;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.type === "subprocess" || cur.type === "subprocess-expanded") return cur.id;
      if (cur.type === "pool") return null;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return null;
  };

  const pools = elements.filter(isPool);
  const nodes = elements.filter(isNode);
  const flows = connectors.filter((c) => c.type === "sequence" || c.type === "associationBPMN" || c.type === "messageBPMN");
  const messageFlows = flows.filter((c) => c.type === "messageBPMN");

  // ── Semantic element for one flow node (recurses into sub-process bodies) ──
  function nodeXml(el: DiagramElement, indent: string): string {
    const id = nid(el.id);
    const name = attr("name", el.label ?? "");
    const children = nodes.filter((n) => subprocessOf(n) === el.id);
    const childFlows = flows.filter((c) => c.type !== "messageBPMN" && byId.get(c.sourceId) && byId.get(c.targetId)
      && subprocessOf(byId.get(c.sourceId)!) === el.id && subprocessOf(byId.get(c.targetId)!) === el.id);
    const inner = () => [
      ...children.map((c) => nodeXml(c, indent + "  ")),
      ...childFlows.map((c) => flowXml(c, indent + "  ")),
    ].join("");

    switch (el.type) {
      case "task": {
        const tag = TASK_ELEMENT[el.taskType ?? "none"] ?? "task";
        const comp = el.properties.isForCompensation === true ? ' isForCompensation="true"' : "";
        return `${indent}<bpmn:${tag}${attr("id", id)}${name}${comp}/>\n`;
      }
      case "subprocess":
      case "subprocess-expanded": {
        const st = el.properties.subprocessType as string | undefined;
        if (st === "call") return `${indent}<bpmn:callActivity${attr("id", id)}${name}/>\n`;
        let tag = "subProcess";
        let extra = "";
        if (st === "transaction") tag = "transaction";
        else if (st === "event" || el.properties.triggeredByEvent === true) extra = ' triggeredByEvent="true"';
        else if (el.properties.adHoc === true) tag = "adHocSubProcess";
        return `${indent}<bpmn:${tag}${attr("id", id)}${name}${extra}>\n${inner()}${indent}</bpmn:${tag}>\n`;
      }
      case "gateway": {
        const tag = GATEWAY_ELEMENT[el.gatewayType ?? "exclusive"] ?? "exclusiveGateway";
        // BPMN holds the default ("else") flow as a `default` attribute on the
        // GATEWAY referencing one of its outgoing flows — not as a flag on the
        // flow, which is how we store it. Parallel and event-based gateways
        // evaluate no conditions and may not carry one, so it is emitted only
        // for the gateway kinds the spec allows.
        const canDefault = el.gatewayType !== "parallel" && el.gatewayType !== "event-based";
        const def = canDefault
          ? data.connectors.find((c) => c.sourceId === el.id && c.isDefaultFlow)
          : undefined;
        const defAttr = def ? attr("default", nid(def.id)) : "";
        return `${indent}<bpmn:${tag}${attr("id", id)}${name}${defAttr}/>\n`;
      }
      case "start-event":
      case "end-event":
      case "intermediate-event": {
        let tag: string;
        let extra = "";
        if (el.type === "start-event") tag = "startEvent";
        else if (el.type === "end-event") tag = "endEvent";
        else if (el.boundaryHostId) {
          tag = "boundaryEvent";
          extra = attr("attachedToRef", nid(el.boundaryHostId));
          if (el.properties.interruptionType === "non-interrupting") extra += ' cancelActivity="false"';
        } else if (el.flowType === "throwing") tag = "intermediateThrowEvent";
        else tag = "intermediateCatchEvent";
        // Event definition child(ren). "multiple" emits two so the importer
        // reclassifies it as a multiple event.
        const ev = el.eventType;
        let defs = "";
        if (ev && ev !== "none" && ev !== "multiple" && EVENT_DEF[ev]) {
          defs = `${indent}  <bpmn:${EVENT_DEF[ev]}/>\n`;
        } else if (ev === "multiple") {
          defs = `${indent}  <bpmn:messageEventDefinition/>\n${indent}  <bpmn:signalEventDefinition/>\n`;
        }
        return defs
          ? `${indent}<bpmn:${tag}${attr("id", id)}${name}${extra}>\n${defs}${indent}</bpmn:${tag}>\n`
          : `${indent}<bpmn:${tag}${attr("id", id)}${name}${extra}/>\n`;
      }
      case "data-object":
        return `${indent}<bpmn:dataObject${attr("id", id)}${name}${el.properties.multiplicity === "collection" ? ' isCollection="true"' : ""}/>\n`;
      case "data-store":
        return `${indent}<bpmn:dataStoreReference${attr("id", id)}${name}/>\n`;
      case "text-annotation":
        return `${indent}<bpmn:textAnnotation${attr("id", id)}>\n${indent}  <bpmn:text>${esc(el.label ?? "")}</bpmn:text>\n${indent}</bpmn:textAnnotation>\n`;
      case "group":
        return `${indent}<bpmn:group${attr("id", id)}${name}/>\n`;
      default:
        // Unknown node → emit a generic task so it survives round-trip.
        return `${indent}<bpmn:task${attr("id", id)}${name}/>\n`;
    }
  }

  // ── One connector (sequence / association; message flows handled separately) ─
  function flowXml(c: Connector, indent: string): string {
    const id = nid(c.id);
    const refs = `${attr("sourceRef", nid(c.sourceId))}${attr("targetRef", nid(c.targetId))}`;
    const name = attr("name", c.label ?? "");
    if (c.type === "associationBPMN") return `${indent}<bpmn:association${attr("id", id)}${refs}/>\n`;
    const cond = c.branchCondition
      ? `${indent}  <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${esc(c.branchCondition)}</bpmn:conditionExpression>\n`
      : "";
    return cond
      ? `${indent}<bpmn:sequenceFlow${attr("id", id)}${refs}${name}>\n${cond}${indent}</bpmn:sequenceFlow>\n`
      : `${indent}<bpmn:sequenceFlow${attr("id", id)}${refs}${name}/>\n`;
  }

  // ── A <laneSet> for a pool (one level of sub-lanes) ────────────────────────
  function laneSetXml(poolId: string, indent: string): string {
    const lanes = elements.filter((e) => e.type === "lane" && e.parentId === poolId);
    if (lanes.length === 0) return "";
    const laneXml = (lane: DiagramElement): string => {
      const refs = nodes.filter((n) => n.parentId === lane.id).map((n) => `${indent}    <bpmn:flowNodeRef>${nid(n.id)}</bpmn:flowNodeRef>\n`).join("");
      const subs = elements.filter((e) => e.type === "sublane" && e.parentId === lane.id);
      const childSet = subs.length
        ? `${indent}    <bpmn:childLaneSet>\n${subs.map((s) => {
            const sr = nodes.filter((n) => n.parentId === s.id).map((n) => `${indent}        <bpmn:flowNodeRef>${nid(n.id)}</bpmn:flowNodeRef>\n`).join("");
            return `${indent}      <bpmn:lane${attr("id", nid(s.id))}${attr("name", s.label ?? "")}>\n${sr}${indent}      </bpmn:lane>\n`;
          }).join("")}${indent}    </bpmn:childLaneSet>\n`
        : "";
      return `${indent}  <bpmn:lane${attr("id", nid(lane.id))}${attr("name", lane.label ?? "")}>\n${refs}${childSet}${indent}  </bpmn:lane>\n`;
    };
    return `${indent}<bpmn:laneSet${attr("id", nid(poolId) + "_lanes")}>\n${lanes.map(laneXml).join("")}${indent}</bpmn:laneSet>\n`;
  }

  // ── Process body for a pool (or the whole diagram if pool-less) ────────────
  function processBody(poolId: string | null, indent: string): string {
    const inPool = (e: DiagramElement) => poolOf(e) === poolId;
    const topNodes = nodes.filter((n) => inPool(n) && subprocessOf(n) === null);
    const topFlows = flows.filter((c) => c.type !== "messageBPMN"
      && byId.get(c.sourceId) && byId.get(c.targetId)
      && inPool(byId.get(c.sourceId)!) && subprocessOf(byId.get(c.sourceId)!) === null
      && subprocessOf(byId.get(c.targetId)!) === null);
    return [
      poolId ? laneSetXml(poolId, indent) : "",
      ...topNodes.map((n) => nodeXml(n, indent)),
      ...topFlows.map((c) => flowXml(c, indent)),
    ].join("");
  }

  // ── DI (shapes + edges) ────────────────────────────────────────────────────
  function diXml(): string {
    const shapes = elements.map((el) => {
      const expanded = el.type === "subprocess-expanded" ? ' isExpanded="true"'
        : el.type === "subprocess" ? ' isExpanded="false"' : "";
      const isHoriz = el.type === "pool" || el.type === "lane" || el.type === "sublane";
      const horizAttr = isHoriz ? ' isHorizontal="true"' : "";
      return `      <bpmndi:BPMNShape${attr("id", nid(el.id) + "_di")}${attr("bpmnElement", nid(el.id))}${expanded}${horizAttr}>\n`
        + `        <dc:Bounds${attr("x", Math.round(el.x))}${attr("y", Math.round(el.y))}${attr("width", Math.round(el.width))}${attr("height", Math.round(el.height))}/>\n`
        + `      </bpmndi:BPMNShape>\n`;
    }).join("");
    const edges = flows.map((c) => {
      const wps = (c.waypoints ?? []).map((p) => `        <di:waypoint${attr("x", Math.round(p.x))}${attr("y", Math.round(p.y))}/>\n`).join("");
      return `      <bpmndi:BPMNEdge${attr("id", nid(c.id) + "_di")}${attr("bpmnElement", nid(c.id))}>\n${wps}      </bpmndi:BPMNEdge>\n`;
    }).join("");
    return shapes + edges;
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n`
    + `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"`
    + ` xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"`
    + ` xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"`
    + ` xmlns:di="http://www.omg.org/spec/DD/20100524/DI"`
    + ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"`
    + ` id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn"${attr("name", diagramName)}>\n`;

  let body = "";
  let planeRef: string;

  if (pools.length > 0) {
    planeRef = "Collaboration_1";
    // Collaboration: participants + message flows.
    body += `  <bpmn:collaboration id="Collaboration_1">\n`;
    for (const p of pools) {
      const whiteBox = (p.properties.poolType as string | undefined) !== "black-box"
        && nodes.some((n) => poolOf(n) === p.id);
      body += `    <bpmn:participant${attr("id", nid(p.id))}${attr("name", p.label ?? "")}${whiteBox ? attr("processRef", nid(p.id) + "_proc") : ""}/>\n`;
    }
    for (const m of messageFlows) {
      body += `    <bpmn:messageFlow${attr("id", nid(m.id))}${attr("name", m.label ?? "")}${attr("sourceRef", nid(m.sourceId))}${attr("targetRef", nid(m.targetId))}/>\n`;
    }
    body += `  </bpmn:collaboration>\n`;
    // One process per white-box pool.
    for (const p of pools) {
      const whiteBox = (p.properties.poolType as string | undefined) !== "black-box"
        && nodes.some((n) => poolOf(n) === p.id);
      if (!whiteBox) continue;
      body += `  <bpmn:process${attr("id", nid(p.id) + "_proc")}${attr("name", p.label ?? "")} isExecutable="false">\n`;
      body += processBody(p.id, "    ");
      body += `  </bpmn:process>\n`;
    }
  } else {
    planeRef = "Process_1";
    body += `  <bpmn:process id="Process_1"${attr("name", diagramName)} isExecutable="false">\n`;
    body += processBody(null, "    ");
    body += `  </bpmn:process>\n`;
  }

  const di = `  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n`
    + `    <bpmndi:BPMNPlane${attr("id", "BPMNPlane_1")}${attr("bpmnElement", planeRef)}>\n`
    + diXml()
    + `    </bpmndi:BPMNPlane>\n`
    + `  </bpmndi:BPMNDiagram>\n`;

  return header + body + di + `</bpmn:definitions>\n`;
}
