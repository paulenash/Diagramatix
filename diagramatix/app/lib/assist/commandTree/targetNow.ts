/**
 * What "this" / "that" would act on RIGHT NOW — for the help's live "Target:" line.
 *
 * Paul, 2026-10-01: "Have you included 'this' and the identified targets?" The answer comes
 * from the resolver itself (`resolveRef`), never a second copy of its rule, so what the panel
 * shows is what the command will do: the selection first, then the element under the cursor,
 * then the last one added (the order fixed on 2026-10-01 so "this" follows the cursor).
 *
 * Pure.
 */
import type { DiagramElement } from "../../diagram/types";
import { elementUnderPointer } from "../pointerRef";
import { resolveRef } from "../resolveRef";

export type TargetKind = "selected" | "cursor" | "last" | "many" | "none";

export interface TargetNow {
  kind: TargetKind;
  /** The element "this" means (absent for "many" and "none"). */
  id?: string;
  count?: number;
  /** The panel's sentence: "“Review Claim” (task) — selected". */
  label: string;
}

const typeWord = (e: DiagramElement): string => String(e.type).replace(/-/g, " ");
const nameOf = (e: DiagramElement): string => {
  const l = (e.label ?? "").replace(/\s+/g, " ").trim();
  return l ? `“${l}” (${typeWord(e)})` : `an unnamed ${typeWord(e)}`;
};

export function targetNow(
  elements: readonly DiagramElement[],
  selectedIds: readonly string[],
  lastAddedId: string | null | undefined,
  pointer: { x: number; y: number } | null | undefined,
): TargetNow {
  const els = elements as DiagramElement[];
  const selected = selectedIds.filter((id) => els.some((e) => e.id === id));
  if (selected.length > 1) {
    return { kind: "many", count: selected.length, label: `${selected.length} things selected — say “these”` };
  }
  const r = resolveRef("this", els, lastAddedId ?? null, selected, { pointer: pointer ?? null });
  if (!r || !("id" in r)) {
    return { kind: "none", label: "nothing — point at an element, or select one" };
  }
  const e = els.find((x) => x.id === r.id);
  if (!e) return { kind: "none", label: "nothing — point at an element, or select one" };
  const kind: TargetKind = selected.length === 1 ? "selected" : elementUnderPointer(pointer ?? null, els)?.id === e.id ? "cursor" : "last";
  const how = kind === "selected" ? "selected"
    : kind === "cursor" ? "under the cursor"
    : lastAddedId === e.id ? "the last one you added"
    : "the last element on the diagram";
  return { kind, id: e.id, label: `${nameOf(e)} — ${how}` };
}
