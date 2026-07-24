/**
 * Shared "one row per element" builder for the ArchiMate Symbols Panel and the
 * Icon Library assignment list, so the two always match.
 *
 * The catalogue stores elements irregularly — some have a "box" master, some an
 * "icon-only" master, some both. The palette shows ONE row per element name
 * (preferring the box form) and ADDITIONALLY surfaces a separate icon-only row
 * for a SuperAdmin-configurable set of element names ("add / remove icon
 * versions"). The icon row reuses the element's own key with the iconOnly flag,
 * so ANY element can offer an icon version regardless of catalogue quirks.
 */
import type { ArchimateShapeEntry } from "./catalogue";

export const ARCHIMATE_SEPARATE_ICON_KEY = "archimate.icon.separate";
/** Elements that surface a separate icon-only palette entry by default. */
export const DEFAULT_SEPARATE_ICONS = [
  "Business Actor", "Business Service", "Business Event",
  "Node", "Device", "Application Component", "Application Service",
  "Application Event", "Technology Service", "Technology Event",
];

export interface PaletteRow {
  entry: ArchimateShapeEntry;
  iconOnly: boolean;
  label: string;
}

/** One row per element name (box/primary preferred), plus a separate icon-only
 *  row for names in `separateNames`. The icon row uses the dedicated icon master
 *  when one exists, else the primary entry dropped icon-only. */
export function buildElementRows(shapes: ArchimateShapeEntry[], separateNames: Set<string>): PaletteRow[] {
  const byName = new Map<string, { primary: ArchimateShapeEntry; icon?: ArchimateShapeEntry }>();
  for (const s of shapes) {
    const ex = byName.get(s.name);
    if (!ex) byName.set(s.name, s.variant === "icon" ? { primary: s, icon: s } : { primary: s });
    else {
      if (s.variant === "box") ex.primary = s;   // prefer the box form as primary
      if (s.variant === "icon") ex.icon = s;     // remember the dedicated icon master
    }
  }
  const rows: PaletteRow[] = [];
  for (const [name, pair] of byName) {
    rows.push({ entry: pair.primary, iconOnly: false, label: name });
    if (separateNames.has(name)) rows.push({ entry: pair.icon ?? pair.primary, iconOnly: true, label: `${name} (icon)` });
  }
  return rows;
}
