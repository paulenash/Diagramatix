/**
 * V2 Visio Export — Maps Diagramatix BPMN elements to master IDs.
 * Uses template masters where available, BPMN_M masters (added with IDs 100+) for the rest.
 */
import type { DiagramElement, Connector } from "../types";

interface MasterMapping {
  masterId: number;
  properties: Record<string, string>;
}

// Template masters (original) + BPMN_M masters (added with IDs 100+)
const MASTER = {
  // From template
  TASK: 9,
  START_EVENT: 8,
  END_EVENT: 15,
  COLLAPSED_SUBPROCESS: 33,
  POOL_LANE: 19,
  MESSAGE_FLOW: 24,
  // From BPMN_M (added to template with new IDs)
  GATEWAY: 104,
  INTERMEDIATE_EVENT: 105,
  SEQUENCE_FLOW: 111,
  ASSOCIATION: 112,
  DATA_OBJECT: 115,
  DATA_STORE: 116,
  TEXT_ANNOTATION: 110,
  GROUP: 117,
  EXPANDED_SUBPROCESS: 33,
} as const;

// Task type mapping
const TASK_TYPE_MAP: Record<string, string> = {
  "none": "None", "user": "User", "service": "Service", "script": "Script",
  "send": "Send", "receive": "Receive", "manual": "Manual", "business-rule": "Business Rule",
};

// Gateway type mapping — use "with Marker" for external text
const GATEWAY_TYPE_MAP: Record<string, { type: string; exclusive?: string; marker?: boolean }> = {
  "none": { type: "Exclusive", exclusive: "Data", marker: true },
  "exclusive": { type: "Exclusive", exclusive: "Data", marker: true },
  "inclusive": { type: "Inclusive" },
  "parallel": { type: "Parallel" },
  "event-based": { type: "Exclusive Event (Instantiate)" },
};

// Event trigger/result mapping
const EVENT_TYPE_MAP: Record<string, string> = {
  "none": "None", "message": "Message", "timer": "Timer", "error": "Error",
  "signal": "Signal", "terminate": "Terminate", "conditional": "Conditional",
  "escalation": "Escalation", "cancel": "Cancel", "compensation": "Compensation", "link": "Link",
};

export function getElementMappingV2(el: DiagramElement): MasterMapping | null {
  switch (el.type) {
    case "task":
      return {
        masterId: MASTER.TASK,
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
      return { masterId: MASTER.GATEWAY, properties: gwProps };
    }

    case "start-event":
      return {
        masterId: MASTER.START_EVENT,
        properties: {
          BpmnEventType: "Start",
          BpmnTriggerOrResult: EVENT_TYPE_MAP[el.eventType ?? "none"] ?? "None",
          BpmnName: el.label ?? "",
        },
      };

    case "intermediate-event": {
      const isThrowing = el.flowType === "throwing" || el.taskType === "send";
      return {
        masterId: MASTER.INTERMEDIATE_EVENT,
        properties: {
          BpmnEventType: isThrowing ? "Intermediate (Throwing)" : "Intermediate",
          BpmnTriggerOrResult: EVENT_TYPE_MAP[el.eventType ?? "none"] ?? "None",
          BpmnName: el.label ?? "",
        },
      };
    }

    case "end-event":
      return {
        masterId: MASTER.END_EVENT,
        properties: {
          BpmnEventType: "End",
          BpmnTriggerOrResult: EVENT_TYPE_MAP[el.eventType ?? "none"] ?? "None",
          BpmnName: el.label ?? "",
        },
      };

    case "subprocess":
      return {
        masterId: MASTER.COLLAPSED_SUBPROCESS,
        properties: {
          BpmnBoundaryType: (el.properties as any)?.subprocessType === "call" ? "Call" : "Default",
          BpmnLoopType: el.repeatType === "loop" ? "Standard" : "None",
          BpmnName: el.label ?? "",
        },
      };

    case "subprocess-expanded":
      return { masterId: MASTER.EXPANDED_SUBPROCESS, properties: {} };

    case "pool":
      return { masterId: MASTER.POOL_LANE, properties: { BpmnName: el.label ?? "Pool" } };

    case "lane":
      return { masterId: MASTER.POOL_LANE, properties: { BpmnName: el.label ?? "Lane" } };

    case "data-object":
      return { masterId: MASTER.DATA_OBJECT, properties: {} };

    case "data-store":
      return { masterId: MASTER.DATA_STORE, properties: {} };

    case "text-annotation":
      return { masterId: MASTER.TEXT_ANNOTATION, properties: {} };

    case "group":
      return { masterId: MASTER.GROUP, properties: {} };

    default:
      return null;
  }
}

export function getConnectorMappingV2(conn: Connector): MasterMapping {
  switch (conn.type) {
    case "sequence":
      return { masterId: MASTER.SEQUENCE_FLOW, properties: {} };
    case "messageBPMN":
      return { masterId: MASTER.MESSAGE_FLOW, properties: {} };
    case "associationBPMN":
      return { masterId: MASTER.ASSOCIATION, properties: {} };
    default:
      return { masterId: MASTER.SEQUENCE_FLOW, properties: {} };
  }
}
