/**
 * Shared "one row per element" builder for the ArchiMate Symbols Panel and the
 * Icon Library assignment list, so the two always match.
 *
 * The catalogue stores many elements twice — a "box" master and an "icon-only"
 * master (same name, different key). The palette shows ONE row per element name
 * (preferring the box form) and ADDITIONALLY surfaces a separate icon-only row
 * for a configurable set of element names (SuperAdmin-editable — "add / remove
 * icon versions"). Default set = Business Actor / Business Service / Business Event.
 */
import type { ArchimateShapeEntry } from "./catalogue";

export const ARCHIMATE_SEPARATE_ICON_KEY = "archimate.icon.separate";
export const DEFAULT_SEPARATE_ICONS = ["Business Actor", "Business Service", "Business Event"];

export interface PaletteRow {
  entry: ArchimateShapeEntry;
  iconOnly: boolean;
  label: string;
  /** True if this element name has an icon-only counterpart in the catalogue, so
   *  a separate icon row CAN be offered (drives the add/remove-icon-version toggle). */
  hasIconCounterpart: boolean;
}

/** One row per element name (box/primary preferred), plus a separate icon-only
 *  row for names in `separateNames` that have an icon counterpart. */
export function buildElementRows(shapes: ArchimateShapeEntry[], separateNames: Set<string>): PaletteRow[] {
  const byName = new Map<string, { primary: ArchimateShapeEntry; iconCounterpart?: ArchimateShapeEntry }>();
  for (const s of shapes) {
    const ex = byName.get(s.name);
    if (!ex) byName.set(s.name, { primary: s });
    else if (ex.primary.variant === "icon" && s.variant === "box") byName.set(s.name, { primary: s, iconCounterpart: ex.primary });
    else if (ex.primary.variant === "box" && s.variant === "icon") byName.set(s.name, { primary: ex.primary, iconCounterpart: s });
  }
  const rows: PaletteRow[] = [];
  for (const [name, pair] of byName) {
    rows.push({ entry: pair.primary, iconOnly: false, label: name, hasIconCounterpart: !!pair.iconCounterpart });
    if (pair.iconCounterpart && separateNames.has(name)) {
      rows.push({ entry: pair.iconCounterpart, iconOnly: true, label: `${name} (icon)`, hasIconCounterpart: true });
    }
  }
  return rows;
}
