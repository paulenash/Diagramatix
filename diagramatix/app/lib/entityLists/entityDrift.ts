/**
 * "Highlight Entity List Changes" — compute which diagram elements carry a name
 * that ISN'T in the project's adopted Entity Structure. Pure (no React) so the
 * editor's highlight memo and tests share one source of truth.
 *
 * Mapping (mirrors the naming autocomplete): a black-box pool → External
 * Participants (or IT Systems when flagged `isSystem`); a white-box pool / lane /
 * sublane → Organisation Hierarchy; a process-context `system` → IT Systems;
 * `data-object` → Documents; `data-store` → Data Stores. Untyped/blank-name
 * elements are ignored. Matching is case-insensitive, trimmed.
 */
import type { DiagramElement } from "@/app/lib/diagram/types";
import type { ProjectEntityStructure } from "./types";

export function computeEntityDrift(
  elements: DiagramElement[],
  structure: ProjectEntityStructure,
): Map<string, "drift"> {
  const norm = (s: string) => s.trim().toLowerCase();
  const set = (arr: { name: string }[]) => new Set(arr.map((n) => norm(n.name)));
  const org = set(structure.orgStructure), part = set(structure.participants),
    sys = set(structure.systems), docs = set(structure.documents), stores = set(structure.dataStores);

  const m = new Map<string, "drift">();
  for (const el of elements) {
    const label = (el.label ?? "").trim();
    if (!label) continue;
    const n = norm(label);
    let target: Set<string> | null = null; // the list this element's name should be in
    if (el.type === "pool") {
      target = el.properties?.poolType === "black-box"
        ? (el.properties?.isSystem ? sys : part)
        : org;
    } else if (el.type === "lane" || el.type === "sublane") target = org;
    else if (el.type === "system") target = sys;
    else if (el.type === "data-object") target = docs;
    else if (el.type === "data-store") target = stores;
    // Only flag against a NON-EMPTY list — an empty (uncurated) list flags nothing,
    // so a project that hasn't populated e.g. Documents doesn't ring every Data Object.
    if (target && target.size > 0 && !target.has(n)) m.set(el.id, "drift");
  }
  return m;
}
