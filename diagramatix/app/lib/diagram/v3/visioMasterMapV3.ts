/**
 * V3 Visio Export — Maps Diagramatix BPMN elements to master IDs.
 *
 * Master IDs are NOT hard-coded any more: they come from a `StencilProfile`
 * passed in by the caller. This lets the same mapping logic produce
 * exports for either the BPMN_M-flavoured template (Microsoft's standard
 * stencil layout) or the Diagramatix v1.4 stencil flavour — same shape
 * properties, just different master ID targets.
 */
import type { DiagramElement, Connector } from "../types";
import type { StencilProfile } from "./stencilProfile";

interface MasterMapping {
  masterId: number;
  properties: Record<string, string>;
}

// Task type mapping
const TASK_TYPE_MAP: Record<string, string> = {
  "none": "None", "user": "User", "service": "Service", "script": "Script",
  "send": "Send", "receive": "Receive", "manual": "Manual", "business-rule": "Business Rule",
};

// Gateway type mapping. `marker: true` flips Visio's BpmnExclusiveType
// label to "Exclusive Gateway (with Marker)" so the X is shown; without
// marker it's just "Exclusive Gateway" (plain diamond, no X). Diagramatix's
// `none` is the plain diamond — so marker stays false there.
const GATEWAY_TYPE_MAP: Record<string, { type: string; exclusive?: string; marker?: boolean }> = {
  "none": { type: "Exclusive", exclusive: "Data" },
  "exclusive": { type: "Exclusive", exclusive: "Data", marker: true },
  "inclusive": { type: "Inclusive" },
  "parallel": { type: "Parallel" },
  // Use the plain "Exclusive Event" variant rather than the "(Instantiate)"
  // form. The Instantiate variant draws an EXTRA outer circle around the
  // pentagon to denote process instantiation — it looks correct on the
  // event-gateway Merge master but renders oversized inside the Decision
  // master in the v1.5 stencil. The plain "Exclusive Event" marker scales
  // cleanly to the instance gateway size from either master.
  "event-based": { type: "Exclusive Event" },
};

// Event trigger/result mapping
const EVENT_TYPE_MAP: Record<string, string> = {
  "none": "None", "message": "Message", "timer": "Timer", "error": "Error",
  "signal": "Signal", "terminate": "Terminate", "conditional": "Conditional",
  "escalation": "Escalation", "cancel": "Cancel", "compensation": "Compensation", "link": "Link",
};

export function getElementMappingV3(el: DiagramElement, profile: StencilProfile): MasterMapping | null {
  const mapping = getElementMappingV3Inner(el, profile);
  if (!mapping) return null;
  // Round-trip metadata: stash the Diagramatix element ID into BpmnId so
  // re-import can recover the original ID. Visio treats unknown Bpmn props
  // as opaque strings and silently round-trips them.
  mapping.properties.BpmnId = el.id;
  const elPropsRec = el.properties as Record<string, unknown> | undefined;
  const role = elPropsRec?.role as string | undefined;
  const mult = elPropsRec?.multiplicity as string | undefined;
  if (el.type === "data-object" && (role === "input" || role === "output")) {
    mapping.properties.BpmnRole = role;
  }
  if (
    (el.type === "data-object" || el.type === "pool") &&
    mult === "collection"
  ) {
    mapping.properties.BpmnMultiplicity = "collection";
  }
  return mapping;
}

function getElementMappingV3Inner(el: DiagramElement, profile: StencilProfile): MasterMapping | null {
  const m = profile.masterIds;
  switch (el.type) {
    case "task":
      return {
        masterId: m.task,
        properties: {
          BpmnActivityType: "Task",
          BpmnTaskType: TASK_TYPE_MAP[el.taskType ?? "none"] ?? "None",
          BpmnLoopType: el.repeatType === "loop" ? "Standard" : "None",
          BpmnName: el.label ?? "",
        },
      };

    case "gateway": {
      const gwInfo = GATEWAY_TYPE_MAP[el.gatewayType ?? "none"] ?? GATEWAY_TYPE_MAP["exclusive"];
      const gwProps: Record<string, string> = {
        BpmnGatewayType: gwInfo.type,
      };
      if (gwInfo.exclusive) gwProps.BpmnExclusiveType = gwInfo.exclusive;
      if (gwInfo.marker) gwProps.BpmnMarkerVisible = "1";  // BOOL: 1=true
      // Diagramatix v1.4+ ships separate Decision (with marker) and Merge
      // (plain diamond) gateway masters. Route through `gatewayMerge` when:
      //   • the gateway has no marker (gatewayType "none"); OR
      //   • the gateway is event-based — the Decision master in the
      //     current stencil renders the event marker incorrectly, while
      //     the Merge master draws it accurately.
      // Profiles without `gatewayMerge` (BPMN_M) fall back to the single
      // `gateway` master.
      const gwType = el.gatewayType ?? "none";
      const usesMergeMaster = gwType === "none" || gwType === "event-based";
      const masterId = (usesMergeMaster && m.gatewayMerge) ? m.gatewayMerge : m.gateway;
      return { masterId, properties: gwProps };
    }

    case "start-event": {
      const ni = (el.properties as Record<string, unknown> | undefined)
        ?.interruptionType === "non-interrupting";
      return {
        masterId: m.startEvent,
        properties: {
          BpmnEventType: ni ? "Start (Non-Interrupting)" : "Start",
          BpmnTriggerOrResult: EVENT_TYPE_MAP[el.eventType ?? "none"] ?? "None",
          BpmnName: el.label ?? "",
        },
      };
    }

    case "intermediate-event": {
      const isThrowing = el.flowType === "throwing" || el.taskType === "send";
      const ni = (el.properties as Record<string, unknown> | undefined)
        ?.interruptionType === "non-interrupting";
      const bpmnType = isThrowing
        ? "Intermediate (Throwing)"
        : ni
        ? "Intermediate (Non-Interrupting)"
        : "Intermediate";
      return {
        masterId: m.intermediateEvent,
        properties: {
          BpmnEventType: bpmnType,
          BpmnTriggerOrResult: EVENT_TYPE_MAP[el.eventType ?? "none"] ?? "None",
          BpmnName: el.label ?? "",
        },
      };
    }

    case "end-event":
      return {
        masterId: m.endEvent,
        properties: {
          BpmnEventType: "End",
          BpmnTriggerOrResult: EVENT_TYPE_MAP[el.eventType ?? "none"] ?? "None",
          BpmnName: el.label ?? "",
        },
      };

    case "subprocess":
    case "subprocess-expanded": {
      const SUB_TYPE_TO_BOUNDARY: Record<string, string> = {
        normal: "Default",
        call: "Call",
        event: "Event",
        transaction: "Transaction",
      };
      const subType = (el.properties as Record<string, unknown> | undefined)
        ?.subprocessType as string | undefined;
      const boundary = SUB_TYPE_TO_BOUNDARY[subType ?? "normal"] ?? "Default";
      return {
        masterId: el.type === "subprocess" ? m.collapsedSubprocess : m.expandedSubprocess,
        properties: {
          BpmnActivityType: "Sub-Process",
          BpmnBoundaryType: boundary,
          BpmnLoopType: el.repeatType === "loop" ? "Standard" : "None",
          BpmnIsCollapsed: el.type === "subprocess" ? "1" : "0",
          BpmnName: el.label ?? "",
        },
      };
    }

    case "pool":
      return { masterId: m.poolLane, properties: { BpmnName: el.label ?? "Pool" } };

    case "lane":
      return { masterId: m.poolLane, properties: { BpmnName: el.label ?? "Lane" } };

    case "data-object":
      return { masterId: m.dataObject, properties: {} };

    case "data-store":
      return { masterId: m.dataStore, properties: {} };

    case "text-annotation":
      return { masterId: m.textAnnotation, properties: {} };

    case "group":
      return { masterId: m.group, properties: {} };

    default:
      return null;
  }
}

export function getConnectorMappingV3(conn: Connector, profile: StencilProfile): MasterMapping {
  const m = profile.masterIds;
  switch (conn.type) {
    case "sequence":
      return { masterId: m.sequenceFlow, properties: {} };
    case "messageBPMN":
      return { masterId: m.messageFlow, properties: {} };
    case "associationBPMN":
      return { masterId: m.association, properties: {} };
    default:
      return { masterId: m.sequenceFlow, properties: {} };
  }
}
