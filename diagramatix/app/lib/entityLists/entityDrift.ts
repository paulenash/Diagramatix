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
    let ok: boolean | null = null; // null → element type not checked
    if (el.type === "pool") {
      ok = el.properties?.poolType === "black-box"
        ? (el.properties?.isSystem ? sys.has(n) : part.has(n))
        : org.has(n);
    } else if (el.type === "lane" || el.type === "sublane") ok = org.has(n);
    else if (el.type === "system") ok = sys.has(n);
    else if (el.type === "data-object") ok = docs.has(n);
    else if (el.type === "data-store") ok = stores.has(n);
    if (ok === false) m.set(el.id, "drift");
  }
  return m;
}
