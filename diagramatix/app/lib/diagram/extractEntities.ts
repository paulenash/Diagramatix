/**
 * Extract the org entities a diagram references — the participants / teams /
 * roles / IT systems named on its pools, lanes and system shapes — as a flat,
 * deduped list of raw labels. Stored (denormalised) on Diagram.entityRefs on
 * every save; the Process Portal canonicalises these against the Org Entity
 * Lists at read time to answer "which processes use System X / involve Team Y".
 *
 * Classification mirrors app/lib/diagram/prompt-from-diagram.ts:
 *   • white-box pool + lane + sublane  → org-structure name  (kind "org")
 *   • black-box pool, properties.isSystem === true  → IT system  (kind "system")
 *   • black-box pool, isSystem !== true  → external participant  (kind "participant")
 *   • data-store / system / process-system element labels  → IT system
 * Names are the plain element.label (elements carry no EntityNode id — the
 * Portal name-matches). Pure.
 */
import type { DiagramData, DiagramElement } from "./types";

export type EntityKind = "system" | "org" | "participant";
export interface EntityRef {
  kind: EntityKind;
  name: string;
}

const SYSTEM_ELEMENT_TYPES = new Set(["data-store", "system", "process-system"]);
const LANE_TYPES = new Set(["lane", "sublane", "flowchart-vswimlane"]);

export function extractDiagramEntities(data: unknown): EntityRef[] {
  const d = (data ?? {}) as Partial<DiagramData>;
  const els = (Array.isArray(d.elements) ? d.elements : []) as DiagramElement[];
  const out: EntityRef[] = [];
  const seen = new Set<string>();

  const add = (kind: EntityKind, raw: unknown) => {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) return;
    const key = `${kind}::${name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind, name });
  };

  for (const el of els) {
    const p = (el.properties ?? {}) as Record<string, unknown>;
    if (el.type === "pool") {
      const blackBox = p.poolType === "black-box";
      if (blackBox && p.isSystem === true) add("system", el.label);
      else if (blackBox) add("participant", el.label);
      else add("org", el.label);           // white-box (default): org / unit / team
    } else if (LANE_TYPES.has(el.type)) {
      add("org", el.label);                 // teams / roles
    } else if (SYSTEM_ELEMENT_TYPES.has(el.type)) {
      add("system", el.label);
    }
  }
  return out;
}
