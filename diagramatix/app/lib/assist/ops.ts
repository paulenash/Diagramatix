/**
 * Abracadabra Mode — the op vocabulary a spoken/typed command turns into, plus a
 * validator for AI-returned ops. Refs are spoken NAMES or pronouns, resolved to
 * ids at apply time (see resolveRef.ts) so the interpreter never needs ids.
 */
import type { SymbolType, GatewayType, EventType, ConnectorType } from "../diagram/types";

export type Ref = string;

export type AssistOp =
  | { op: "add"; symbolType: SymbolType; label?: string; eventType?: EventType; gatewayType?: GatewayType; afterRef?: Ref }
  | { op: "connect"; fromRef: Ref; toRef: Ref; connectorType?: ConnectorType }
  | { op: "disconnect"; fromRef: Ref; toRef: Ref }
  | { op: "delete"; ref: Ref; compact?: boolean }
  | { op: "rename"; ref: Ref; label: string }
  | { op: "renameByType"; itemType: string }
  | { op: "move"; ref: Ref; direction: "left" | "right" | "up" | "down"; count?: number }
  | { op: "wrapInPool"; label?: string }
  | { op: "addBoundary"; hostRef: Ref; label?: string; eventType?: EventType }
  | { op: "addPool"; label?: string; poolType?: "black-box" | "white-box"; position?: "above" | "below"; relativeTo?: Ref }
  | { op: "addLanes"; poolRef: Ref; labels: string[] }
  | { op: "addLaneAt"; poolRef: Ref; label?: string; position: "above" | "below"; refLane: Ref }
  | { op: "addSublanes"; laneRef: Ref; labels: string[] }
  | { op: "swapLanes"; laneA: Ref; laneB: Ref }
  | { op: "compressPool"; poolRef: Ref }
  | { op: "extendPools" }
  | { op: "nudgePool"; ref?: Ref; direction: "up" | "down"; distance?: number }
  | { op: "moveLane"; ref: Ref; direction: "up" | "down"; distance?: number }
  | { op: "again" }
  | { op: "addMessage"; fromRef: Ref; toRef: Ref; label?: string }
  | { op: "clear" }
  | { op: "export"; format?: "json" }
  | { op: "undo" };

// ── Spoken vocabulary → canonical BPMN types ────────────────────────────────
// Keys are matched lowercased; multi-word phrases are matched before words.
export const SYMBOL_SYNONYMS: Record<string, { symbolType: SymbolType; eventType?: EventType; gatewayType?: GatewayType }> = {
  "start event": { symbolType: "start-event" },
  "start": { symbolType: "start-event" },
  "end event": { symbolType: "end-event" },
  "end": { symbolType: "end-event" },
  "task": { symbolType: "task" },
  "activity": { symbolType: "task" },
  "step": { symbolType: "task" },
  "action": { symbolType: "task" },
  "user task": { symbolType: "task" },
  "subprocess": { symbolType: "subprocess" },
  "sub process": { symbolType: "subprocess" },
  "sub-process": { symbolType: "subprocess" },
  "gateway": { symbolType: "gateway", gatewayType: "exclusive" },
  "decision": { symbolType: "gateway", gatewayType: "exclusive" },
  "exclusive gateway": { symbolType: "gateway", gatewayType: "exclusive" },
  "xor": { symbolType: "gateway", gatewayType: "exclusive" },
  "parallel gateway": { symbolType: "gateway", gatewayType: "parallel" },
  "and gateway": { symbolType: "gateway", gatewayType: "parallel" },
  "fork": { symbolType: "gateway", gatewayType: "parallel" },
  "inclusive gateway": { symbolType: "gateway", gatewayType: "inclusive" },
  "or gateway": { symbolType: "gateway", gatewayType: "inclusive" },
  "event gateway": { symbolType: "gateway", gatewayType: "event-based" },
  "event-based gateway": { symbolType: "gateway", gatewayType: "event-based" },
  "intermediate event": { symbolType: "intermediate-event" },
  "timer": { symbolType: "intermediate-event", eventType: "timer" },
  "timer event": { symbolType: "intermediate-event", eventType: "timer" },
  "message event": { symbolType: "intermediate-event", eventType: "message" },
  "error event": { symbolType: "intermediate-event", eventType: "error" },
  "data object": { symbolType: "data-object" },
  "data store": { symbolType: "data-store" },
  "database": { symbolType: "data-store" },
  "note": { symbolType: "text-annotation" },
  "annotation": { symbolType: "text-annotation" },
};

/** Longest phrases first so "start event" beats "start", "sub process" beats… */
export const SYMBOL_PHRASES = Object.keys(SYMBOL_SYNONYMS).sort((a, b) => b.length - a.length);

const SYMBOL_VALUES = new Set<SymbolType>(Object.values(SYMBOL_SYNONYMS).map((s) => s.symbolType));
const CONNECTOR_VALUES = new Set<string>(["sequence", "message", "association", "associationBPMN", "messageBPMN"]);

function isRef(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Validate + normalise one candidate op (e.g. from the AI); null if invalid. */
export function validateOp(raw: unknown): AssistOp | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  switch (o.op) {
    case "add": {
      if (!isRef(o.symbolType) || !SYMBOL_VALUES.has(o.symbolType as SymbolType)) return null;
      const op: AssistOp = { op: "add", symbolType: o.symbolType as SymbolType };
      if (isRef(o.label)) op.label = (o.label as string).trim();
      if (isRef(o.eventType)) op.eventType = o.eventType as EventType;
      if (isRef(o.gatewayType)) op.gatewayType = o.gatewayType as GatewayType;
      if (isRef(o.afterRef)) op.afterRef = (o.afterRef as string).trim();
      return op;
    }
    case "connect":
    case "disconnect": {
      if (!isRef(o.fromRef) || !isRef(o.toRef)) return null;
      const op = { op: o.op, fromRef: (o.fromRef as string).trim(), toRef: (o.toRef as string).trim() } as AssistOp;
      if (o.op === "connect" && isRef(o.connectorType) && CONNECTOR_VALUES.has(o.connectorType as string)) {
        (op as { connectorType?: ConnectorType }).connectorType = o.connectorType as ConnectorType;
      }
      return op;
    }
    case "delete":
      return isRef(o.ref) ? { op: "delete", ref: (o.ref as string).trim(), ...(o.compact ? { compact: true } : {}) } : null;
    case "rename":
      return isRef(o.ref) && isRef(o.label) ? { op: "rename", ref: (o.ref as string).trim(), label: (o.label as string).trim() } : null;
    case "renameByType":
      return isRef(o.itemType) ? { op: "renameByType", itemType: (o.itemType as string).trim() } : null;
    case "move": {
      const dir = ["left", "right", "up", "down"].includes(o.direction as string) ? o.direction as "left" | "right" | "up" | "down" : null;
      if (!isRef(o.ref) || !dir) return null;
      const count = Number.isFinite(o.count) ? Math.max(1, Math.round(Number(o.count))) : 1;
      return { op: "move", ref: (o.ref as string).trim(), direction: dir, count };
    }
    case "wrapInPool":
      return { op: "wrapInPool", ...(isRef(o.label) ? { label: (o.label as string).trim() } : {}) };
    case "addBoundary": {
      if (!isRef(o.hostRef)) return null;
      const op: AssistOp = { op: "addBoundary", hostRef: (o.hostRef as string).trim() };
      if (isRef(o.label)) op.label = (o.label as string).trim();
      if (isRef(o.eventType)) op.eventType = o.eventType as EventType;
      return op;
    }
    case "addPool": {
      const op: AssistOp = { op: "addPool" };
      if (isRef(o.label)) op.label = (o.label as string).trim();
      if (o.poolType === "black-box" || o.poolType === "white-box") op.poolType = o.poolType;
      if (o.position === "above" || o.position === "below") op.position = o.position;
      if (isRef(o.relativeTo)) op.relativeTo = (o.relativeTo as string).trim();
      return op;
    }
    case "addLanes": {
      const labels = Array.isArray(o.labels) ? (o.labels as unknown[]).map((l) => String(l).trim()).filter(Boolean) : [];
      return isRef(o.poolRef) && labels.length ? { op: "addLanes", poolRef: (o.poolRef as string).trim(), labels } : null;
    }
    case "addLaneAt": {
      if (!isRef(o.poolRef) || !isRef(o.refLane) || (o.position !== "above" && o.position !== "below")) return null;
      const op: AssistOp = { op: "addLaneAt", poolRef: (o.poolRef as string).trim(), position: o.position, refLane: (o.refLane as string).trim() };
      if (isRef(o.label)) op.label = (o.label as string).trim();
      return op;
    }
    case "swapLanes":
      return isRef(o.laneA) && isRef(o.laneB) ? { op: "swapLanes", laneA: (o.laneA as string).trim(), laneB: (o.laneB as string).trim() } : null;
    case "compressPool":
      return isRef(o.poolRef) ? { op: "compressPool", poolRef: (o.poolRef as string).trim() } : null;
    case "extendPools":
      return { op: "extendPools" };
    case "nudgePool": {
      if (o.direction !== "up" && o.direction !== "down") return null;
      const op: AssistOp = { op: "nudgePool", direction: o.direction };
      if (isRef(o.ref)) op.ref = (o.ref as string).trim();
      if (Number.isFinite(o.distance)) op.distance = Math.max(1, Math.round(Number(o.distance)));
      return op;
    }
    case "moveLane": {
      if (!isRef(o.ref) || (o.direction !== "up" && o.direction !== "down")) return null;
      const op: AssistOp = { op: "moveLane", ref: (o.ref as string).trim(), direction: o.direction };
      if (Number.isFinite(o.distance)) op.distance = Math.max(1, Math.round(Number(o.distance)));
      return op;
    }
    case "again":
      return { op: "again" };
    case "addMessage": {
      if (!isRef(o.fromRef) || !isRef(o.toRef)) return null;
      const op: AssistOp = { op: "addMessage", fromRef: (o.fromRef as string).trim(), toRef: (o.toRef as string).trim() };
      if (isRef(o.label)) op.label = (o.label as string).trim();
      return op;
    }
    case "addSublanes": {
      const labels = Array.isArray(o.labels) ? (o.labels as unknown[]).map((l) => String(l).trim()).filter(Boolean) : [];
      return isRef(o.laneRef) && labels.length ? { op: "addSublanes", laneRef: (o.laneRef as string).trim(), labels } : null;
    }
    case "clear":
      return { op: "clear" };
    case "export":
      return { op: "export", format: "json" };
    case "undo":
      return { op: "undo" };
    default:
      return null;
  }
}

/** Validate a candidate op array (drops invalid entries). */
export function validateOps(raw: unknown): AssistOp[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(validateOp).filter((o): o is AssistOp => o !== null);
}
