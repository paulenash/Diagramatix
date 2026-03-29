/**
 * Maps Diagramatix BPMN elements and connectors to Visio master shape IDs
 * from the "BPMN Diagram Shapes v4.6.vssx" stencil.
 */
import type { DiagramElement, Connector } from "./types";

// ── Element mapping ──────────────────────────────────────────────────

const TASK_TYPE_MAP: Record<string, number> = {
  none: 2,             // Task
  user: 94,            // User Task
  service: 95,         // Service Task
  script: 117,         // Script Task
  send: 113,           // Send Task
  receive: 112,        // Receive Task
  manual: 96,          // Manual Task
  "business-rule": 114, // Business Rule Task
};

const GATEWAY_TYPE_MAP: Record<string, number> = {
  none: 27,            // Exclusive Gateway (default)
  exclusive: 27,       // Exclusive Gateway
  inclusive: 66,        // Inclusive OR
  parallel: 31,        // Parallel Gateway
  "event-based": 110,  // Event Gateway
};

const START_EVENT_MAP: Record<string, number> = {
  none: 13,            // Start Event
  message: 82,         // Receive Message Start
  timer: 93,           // Start with Timer
};

const END_EVENT_MAP: Record<string, number> = {
  none: 17,            // End Event
  message: 83,         // Send Message End Event
};

// Boundary events (have boundaryHostId set)
const BOUNDARY_EVENT_MAP: Record<string, number> = {
  cancel: 84,          // Edge Cancel Event
  error: 85,           // Edge Error / Exception Event
  timer: 86,           // Edge Time out Event
};

/**
 * Returns the Visio master ID for a Diagramatix element, or null if unmapped.
 */
export function getElementMasterId(el: DiagramElement): number | null {
  switch (el.type) {
    case "task":
      return TASK_TYPE_MAP[el.taskType ?? "none"] ?? 2;

    case "gateway":
      return GATEWAY_TYPE_MAP[el.gatewayType ?? "none"] ?? 27;

    case "start-event":
      if (el.boundaryHostId) return 98;  // Edge Start
      return START_EVENT_MAP[el.eventType ?? "none"] ?? 13;

    case "end-event":
      if (el.boundaryHostId) return 99;  // Edge End
      return END_EVENT_MAP[el.eventType ?? "none"] ?? 17;

    case "intermediate-event": {
      if (el.boundaryHostId) {
        // Boundary-mounted event
        const mapped = BOUNDARY_EVENT_MAP[el.eventType ?? "none"];
        if (mapped) return mapped;
        return 19; // Edge-mounted Intermediate Event (generic)
      }
      // Free-standing intermediate events
      if (el.eventType === "timer") return 79;
      if (el.eventType === "message") {
        return el.flowType === "throwing" ? 81 : 80; // Send Message : Receive Message
      }
      return 15; // Intermediate Event (generic)
    }

    case "pool": {
      const poolType = (el.properties.poolType as string | undefined) ?? "black-box";
      return poolType === "white-box" ? 140 : 143; // Pool with 2 Lanes : Black-Box Pool
    }

    case "lane":
      return 137; // Additional Lane

    case "subprocess": {
      const subType = (el.properties.subprocessType as string | undefined) ?? "normal";
      return subType === "call" ? 90 : 6; // Call Collapsed Sub-process : Collapsed Sub-process
    }

    case "subprocess-expanded":
      return 8; // Expanded Sub-process

    case "data-object": {
      const role = (el.properties.role as string | undefined) ?? "none";
      const mult = (el.properties.multiplicity as string | undefined) ?? "single";
      if (mult === "collection") return 111; // Data Object Collection
      if (role === "input") return 106;      // Input Data Object
      if (role === "output") return 109;     // Output Data Object
      return 44;                             // Data Object with Associations
    }

    case "data-store":
      return 73; // Data Store

    case "group":
      return 65; // Group

    case "text-annotation":
      return 52; // Annotation

    default:
      return null;
  }
}

// ── Connector mapping ────────────────────────────────────────────────

/**
 * Returns the Visio master ID for a connector.
 */
export function getConnectorMasterId(
  conn: Connector,
  elements: DiagramElement[]
): number {
  switch (conn.type) {
    case "sequence": {
      // Use Decision Output Flow for connectors originating from gateways
      const source = elements.find(e => e.id === conn.sourceId);
      if (source?.type === "gateway") {
        return conn.sourceSide === "top" ? 89 : 88; // Decision Top Output Flow : Decision Output Flow
      }
      return 97; // Sequence Flow
    }

    case "messageBPMN": {
      // Direction based on source side: bottom = down, top = up
      return conn.sourceSide === "bottom" ? 123 : 124; // Message Flow - Down : Message Flow - Up
    }

    case "associationBPMN":
      return 77; // Association

    default:
      return 97; // Fallback to Sequence Flow
  }
}
