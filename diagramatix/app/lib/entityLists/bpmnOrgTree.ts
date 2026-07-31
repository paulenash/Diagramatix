/**
 * Derive an Organisation Hierarchy from the project's BPMN diagrams.
 *
 * BPMN nesting (pool → lane → sublane, via each element's `parentId` in the raw
 * DiagramData) maps onto the fixed OrgStructure levels:
 *   white-box Pool → Organisation · Lane → OrgUnit · Sublane → Team.
 * (Role is left for manual refinement.) Black-box pools are external
 * participants / systems, not part of the org hierarchy, so they're skipped —
 * matching the white/black-box test in app/lib/diagram/extractEntities.ts.
 *
 * Names are deduped by (case-insensitive) name within the SAME parent path
 * across ALL diagrams: one "ACME" Organisation, its "Finance" OrgUnit once, etc.
 * Pure + framework-free so it's unit-testable.
 */
import type { EntityNodeLevel } from "./types";

export interface OrgTreeNode {
  name: string;
  level: Extract<EntityNodeLevel, "Organisation" | "OrgUnit" | "Team">;
  children: OrgTreeNode[];
}

type RawEl = { id?: unknown; type?: unknown; label?: unknown; parentId?: unknown; properties?: unknown };

const label = (e: RawEl): string => (typeof e.label === "string" ? e.label.trim() : "");
const isWhiteBoxPool = (e: RawEl): boolean =>
  e.type === "pool" && (e.properties as Record<string, unknown> | undefined)?.poolType !== "black-box";

/** Merge `name` into `siblings` at `level`, returning the (new or existing) node. */
function findOrAdd(
  siblings: OrgTreeNode[], name: string, level: OrgTreeNode["level"],
): OrgTreeNode {
  const key = name.toLowerCase();
  let node = siblings.find((s) => s.name.toLowerCase() === key);
  if (!node) { node = { name, level, children: [] }; siblings.push(node); }
  return node;
}

/** Build the merged Organisation → OrgUnit → Team forest from BPMN diagrams. */
export function extractOrgTreeFromBpmn(diagrams: { data: unknown }[]): OrgTreeNode[] {
  const roots: OrgTreeNode[] = [];
  for (const d of diagrams) {
    const els = (Array.isArray((d.data as { elements?: unknown })?.elements)
      ? (d.data as { elements: RawEl[] }).elements : []) as RawEl[];
    const childrenOf = (type: string, parentId: unknown) =>
      els.filter((e) => e.type === type && e.parentId === parentId && label(e));

    for (const pool of els.filter((e) => isWhiteBoxPool(e) && label(e))) {
      const org = findOrAdd(roots, label(pool), "Organisation");
      for (const lane of childrenOf("lane", pool.id)) {
        const unit = findOrAdd(org.children, label(lane), "OrgUnit");
        for (const sub of childrenOf("sublane", lane.id)) {
          findOrAdd(unit.children, label(sub), "Team");
        }
      }
    }
  }
  return roots;
}
