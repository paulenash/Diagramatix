/**
 * What a command DID, in words, with the before and the after — for the Voice Assist Help tile's
 * "Last command" line.
 *
 * Paul, 2026-10-01: "the parser makes it rename" is not enough. It should say what it renamed and
 * what the name was and became, e.g. renamed the end event (selected) from “Claim Closed” to
 * “Claim is now closed”.
 *
 * It really applies the ops to a copy of the diagram (the same headless path the test harness uses —
 * `applyAssistOps` on the real reducer), then reads the difference. Nothing here decides what a
 * command means; it only reports what the real code did. Pure: the diagram passed in is never changed.
 */
import type { Connector, DiagramData, DiagramElement } from "../diagram/types";
import type { AssistOp } from "./ops";
import { applyAssistOps } from "./applyAssistOps";
import { headlessDiagram } from "./headlessDiagram";

export interface DescribedResult {
  /** Whether the command would run (false: refused, or it would ask something first). */
  ok: boolean;
  /** One sentence per change, before and after where there is one. Empty when nothing changed. */
  changes: string[];
  /** What the apply layer said, as the live log would show it. */
  summary: string;
}

const MAX_LINES = 8;
const typeWord = (e: { type: unknown }): string => String(e.type).replace(/-/g, " ");
const q = (s: string | undefined | null): string => `“${String(s ?? "").replace(/\s+/g, " ").trim()}”`;
const clean = (s: string | undefined | null): string => String(s ?? "").replace(/\s+/g, " ").trim();
const num = (n: number | undefined): number => Math.round(Number(n ?? 0));

export function describeResult(
  ops: AssistOp[],
  diagram: DiagramData,
  selectedIds: string[] = [],
  pointer: { x: number; y: number } | null = null,
  cursorId: string | null = null,
): DescribedResult {
  const h = headlessDiagram(structuredClone(diagram));
  const before = structuredClone(h.data);                  // after the load heal, so a heal is never reported as an effect
  const { ok, summary } = applyAssistOps(ops, h.context({ selectedIds, pointer }));
  if (h.screen.includes("pick")) {
    return { ok: false, changes: ["it would ask which one you meant, and wait for your answer"], summary };
  }
  if (!ok) return { ok: false, changes: [], summary };

  const how = (id: string): string => (selectedIds.includes(id) ? " (selected)" : cursorId === id ? " (under the cursor)" : "");
  const changes: string[] = [];
  const after = h.data;

  const elsBefore = new Map<string, DiagramElement>(before.elements.map((e) => [e.id, e]));
  const elsAfter = new Map<string, DiagramElement>(after.elements.map((e) => [e.id, e]));
  for (const a of after.elements) {
    const b = elsBefore.get(a.id);
    if (!b) { changes.push(`added a ${typeWord(a)}${clean(a.label) ? ` ${q(a.label)}` : ""}`); continue; }
    if (clean(a.label) !== clean(b.label)) {
      changes.push(clean(b.label)
        ? `${clean(a.label) ? "renamed" : "cleared the name of"} the ${typeWord(b)}${how(a.id)} from ${q(b.label)}${clean(a.label) ? ` to ${q(a.label)}` : ""}`
        : `named the unnamed ${typeWord(b)}${how(a.id)} ${q(a.label)}`);
    }
    if (a.type !== b.type) changes.push(`changed ${q(a.label || b.label)} from a ${typeWord(b)} to a ${typeWord(a)}`);
    const dx = num(a.x) - num(b.x), dy = num(a.y) - num(b.y);
    if (dx || dy) {
      const parts = [dx ? `${Math.abs(dx)} px ${dx > 0 ? "right" : "left"}` : "", dy ? `${Math.abs(dy)} px ${dy > 0 ? "down" : "up"}` : ""].filter(Boolean).join(" and ");
      changes.push(`moved the ${typeWord(a)} ${q(a.label)}${how(a.id)} ${parts}`);
    }
    if (num(a.width) !== num(b.width) || num(a.height) !== num(b.height)) {
      changes.push(`resized the ${typeWord(a)} ${q(a.label)} from ${num(b.width)}×${num(b.height)} to ${num(a.width)}×${num(a.height)}`);
    }
    const ra = (a as { repeatType?: string }).repeatType, rb = (b as { repeatType?: string }).repeatType;
    if ((ra ?? "none") !== (rb ?? "none")) changes.push(`set the loop marker on ${q(a.label)} from ${rb ?? "none"} to ${ra ?? "none"}`);
  }
  for (const b of before.elements) {
    if (!elsAfter.has(b.id)) changes.push(`removed the ${typeWord(b)}${clean(b.label) ? ` ${q(b.label)}` : ""}${how(b.id)}`);
  }

  const name = (id: string): string => {
    const e = elsAfter.get(id) ?? elsBefore.get(id);
    return e && clean(e.label) ? q(e.label) : `an unnamed ${e ? typeWord(e) : "element"}`;
  };
  const consBefore = new Map<string, Connector>(before.connectors.map((c) => [c.id, c]));
  const consAfter = new Map<string, Connector>(after.connectors.map((c) => [c.id, c]));
  for (const a of after.connectors) {
    const b = consBefore.get(a.id);
    if (!b) { changes.push(`added a ${String(a.type).replace(/-/g, " ")} connector from ${name(a.sourceId)} to ${name(a.targetId)}`); continue; }
    if (clean(a.label) !== clean(b.label)) {
      changes.push(clean(b.label)
        ? `${clean(a.label) ? "relabelled" : "cleared the label of"} the connector ${name(a.sourceId)} → ${name(a.targetId)} from ${q(b.label)}${clean(a.label) ? ` to ${q(a.label)}` : ""}`
        : `labelled the connector ${name(a.sourceId)} → ${name(a.targetId)} ${q(a.label)}`);
    }
    if (a.sourceId !== b.sourceId || a.targetId !== b.targetId) {
      changes.push(`reconnected a connector from ${name(b.sourceId)} → ${name(b.targetId)} to ${name(a.sourceId)} → ${name(a.targetId)}`);
    }
  }
  for (const b of before.connectors) {
    if (!consAfter.has(b.id)) changes.push(`removed the connector ${name(b.sourceId)} → ${name(b.targetId)}`);
  }

  if (changes.length > MAX_LINES) {
    const more = changes.length - MAX_LINES;
    changes.length = MAX_LINES;
    changes.push(`…and ${more} more change${more === 1 ? "" : "s"}`);
  }
  return { ok: true, changes, summary };
}
