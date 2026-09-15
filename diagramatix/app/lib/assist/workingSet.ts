/**
 * The elements a multi-op command sees while it runs.
 *
 * `applyAssistOps` used to read `data.elements` once and resolve every ref of a
 * batch against it. React had not re-rendered mid-loop, so "add X and connect
 * it to Y" could not find X: "it" fell back to the previous last element and
 * the connect landed on the wrong thing with a green tick. The apply loop now
 * keeps a working copy and threads each op's effect into it through these
 * helpers, so the rule lives in one place and is testable.
 *
 * Only what reference resolution needs is modelled — id, type, label, geometry,
 * parent — never the reducer's full behaviour (container growth, connector
 * re-routing). The reducer remains the truth; this is the command's view of it.
 */
import type { DiagramElement, SymbolType, EventType } from "../diagram/types";

/** A stand-in for an element the reducer is about to create. `center` is the
 *  point the placement helpers hand to `addElement`. */
export function syntheticElement(
  id: string,
  symbolType: SymbolType,
  center: { x: number; y: number },
  w: number,
  h: number,
  opts: { label?: string; parentId?: string; eventType?: EventType } = {},
): DiagramElement {
  return {
    id,
    type: symbolType,
    label: opts.label ?? "",
    x: center.x - w / 2,
    y: center.y - h / 2,
    width: w,
    height: h,
    properties: {},
    ...(opts.parentId ? { parentId: opts.parentId } : {}),
    ...(opts.eventType ? { eventType: opts.eventType } : {}),
  } as DiagramElement;
}

export const withAdded = (els: readonly DiagramElement[], el: DiagramElement): DiagramElement[] => [...els, el];

/** Remove an element — and the boundary events mounted on it, which die with their host. */
export const withDeleted = (els: readonly DiagramElement[], id: string): DiagramElement[] =>
  els.filter((e) => e.id !== id && e.boundaryHostId !== id);

export const withLabel = (els: readonly DiagramElement[], id: string, label: string): DiagramElement[] =>
  els.map((e) => (e.id === id ? { ...e, label } : e));
