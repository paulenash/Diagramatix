/**
 * Linked-subprocess roll-up — flatten a subprocess that LINKS to a separate
 * diagram (`properties.linkedDiagramId`) into an INLINE expanded subprocess, so
 * the existing inline-EP engine simulates its body and rolls its times/teams up
 * into the parent. No new engine concepts: the child's elements/connectors are
 * cloned in as children of the subprocess; `assembleFromDiagram` then treats it
 * exactly like a drawn-in expanded subprocess (scope instances, concurrency,
 * loops, event subs all come for free).
 *
 * Per-USE-SITE cloning: ids are prefixed with the subprocess element id, so the
 * same child diagram linked from two places (or two parallel branches) becomes
 * two independent, isolated bodies that still contend on the shared team pools.
 *
 * Opt-out: a subprocess with `sim.subMode === "summary"` stays a black-box task
 * (uses its own cycle time). Cycles + runaway depth are capped.
 */

import type { DiagramData, DiagramElement, Connector, SymbolType } from "@/app/lib/diagram/types";
import { getSimParams } from "@/app/lib/diagram/simParams";

const MAX_DEPTH = 6;
const LINKABLE = new Set<string>(["subprocess", "subprocess-expanded"]);

/** Does this subprocess link out, want simulating, and have no inline body of
 *  its own (an inline body is authoritative — don't double it up)? */
function isSpliceable(el: DiagramElement, hasInlineChildren: boolean): string | null {
  if (!LINKABLE.has(el.type)) return null;
  const linkedId = el.properties?.linkedDiagramId;
  if (typeof linkedId !== "string" || !linkedId) return null;
  if (getSimParams(el).subMode === "summary") return null; // explicit black-box
  if (hasInlineChildren) return null;
  return linkedId;
}

/**
 * Return `root` with every spliceable linked subprocess flattened to an inline
 * expanded subprocess. `byId` maps diagram id → its DiagramData. `path` carries
 * the diagram ids currently on the splice chain (cycle guard).
 */
export function spliceLinkedSubprocesses(
  root: DiagramData,
  rootId: string,
  byId: Map<string, DiagramData>,
  path: Set<string> = new Set(),
  depth = 0,
): DiagramData {
  if (depth >= MAX_DEPTH) return root;
  const nextPath = new Set(path).add(rootId);

  const childParentSet = new Set(root.elements.map((e) => e.parentId).filter(Boolean) as string[]);
  const addedEls: DiagramElement[] = [];
  const addedConns: Connector[] = [];

  const elements = root.elements.map((el) => {
    const linkedId = isSpliceable(el, childParentSet.has(el.id));
    if (!linkedId) return el;
    const child = byId.get(linkedId);
    if (!child || nextPath.has(linkedId)) return el; // missing or cyclic → stays a black-box

    // Splice the child's OWN links first so nested drill-downs roll up too.
    const spliced = spliceLinkedSubprocesses(child, linkedId, byId, nextPath, depth + 1);

    // Clone the child under this use-site. Top-level child elements re-parent
    // to the subprocess (becoming its inline body); nested ones keep their
    // namespaced parent.
    const ns = (id: string) => `${el.id}~${id}`;
    for (const ce of spliced.elements) {
      addedEls.push({ ...ce, id: ns(ce.id), parentId: ce.parentId ? ns(ce.parentId) : el.id });
    }
    for (const cc of spliced.connectors) {
      addedConns.push({ ...cc, id: ns(cc.id), sourceId: ns(cc.sourceId), targetId: ns(cc.targetId) });
    }

    // Become an inline expanded subprocess; drop the link so it isn't re-spliced.
    const props = { ...el.properties };
    delete (props as Record<string, unknown>).linkedDiagramId;
    return { ...el, type: "subprocess-expanded" as SymbolType, properties: props };
  });

  return { ...root, elements: [...elements, ...addedEls], connectors: [...root.connectors, ...addedConns] };
}
