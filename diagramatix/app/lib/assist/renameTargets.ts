/**
 * Guided "rename by number" (Abracadabra): the user says "rename <type>", green
 * numbers appear on every element/connector of that type, and they pick one by
 * number then dictate the new name. This module is the pure part: mapping a
 * spoken type word to a RenameType, and collecting + numbering the targets in
 * reading order (top-to-bottom rows, left-to-right within a row).
 */
import type { DiagramElement, Connector } from "../diagram/types";

export type RenameType =
  | "pool" | "lane" | "message" | "task" | "subprocess" | "gateway" | "event" | "connector";

export interface RenameTarget {
  id: string;
  n: number;                       // 1-based badge number
  kind: "element" | "connector";
  x: number;                       // badge anchor (world coords) — centre of the item
  y: number;
  height: number;                  // item height (0 for connectors) — badge sits below elements
}

const EVENT_TYPES = new Set<string>(["start-event", "intermediate-event", "end-event"]);
const SUBPROCESS_TYPES = new Set<string>(["subprocess", "subprocess-expanded", "subprocess-collapsed"]);

/** Map a spoken type word ("tasks", "sub-lane", "decision"…) to a RenameType. */
export function parseRenameType(word: string): RenameType | null {
  const w = word.toLowerCase().replace(/[-\s]/g, "").trim();
  if (/^pools?$/.test(w)) return "pool";
  if (/^(?:sub)?lanes?$/.test(w)) return "lane";               // lane includes sub-lanes
  if (/^messages?$/.test(w)) return "message";
  if (/^(?:tasks?|activit(?:y|ies)|steps?)$/.test(w)) return "task";
  if (/^subprocess(?:es)?$/.test(w)) return "subprocess";      // includes expanded/collapsed
  if (/^(?:gateways?|decisions?)$/.test(w)) return "gateway";
  if (/^events?$/.test(w)) return "event";                     // all events incl. boundary
  if (/^(?:connectors?|sequence(?:flows?)?|flows?)$/.test(w)) return "connector"; // sequence flows only
  return null;
}

/** Collect + number every renamable target of `itemType`, in reading order. */
export function collectRenameTargets(
  elements: DiagramElement[],
  connectors: Connector[],
  itemType: RenameType,
): RenameTarget[] {
  const raw: Array<Omit<RenameTarget, "n">> = [];
  if (itemType === "message" || itemType === "connector") {
    const wantType = itemType === "message" ? "messageBPMN" : "sequence";
    for (const c of connectors) {
      if (c.type !== wantType) continue;
      const wps = c.waypoints ?? [];
      const mid = wps.length ? wps[Math.floor(wps.length / 2)] : { x: 0, y: 0 };
      raw.push({ id: c.id, x: mid.x, y: mid.y, height: 0, kind: "connector" });
    }
  } else {
    const match = (e: DiagramElement): boolean =>
      itemType === "pool" ? e.type === "pool"
      : itemType === "lane" ? e.type === "lane"                 // sub-lanes are lanes too
      : itemType === "task" ? e.type === "task"
      // A merge gateway is never labelled, so don't number it (#4).
      : itemType === "gateway" ? e.type === "gateway" && (e.properties?.gatewayRole as string | undefined) !== "merge"
      : itemType === "event" ? EVENT_TYPES.has(e.type)
      : itemType === "subprocess" ? SUBPROCESS_TYPES.has(e.type)
      : false;
    for (const e of elements) {
      if (match(e)) raw.push({ id: e.id, x: e.x + e.width / 2, y: e.y + e.height / 2, height: e.height, kind: "element" });
    }
  }
  // Reading order: band the y into Task-height rows, then left-to-right in-row.
  const band = (y: number) => Math.round(y / 64);
  raw.sort((a, b) => band(a.y) - band(b.y) || a.x - b.x);
  return raw.map((r, i) => ({ ...r, n: i + 1 }));
}
