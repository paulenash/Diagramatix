/**
 * Server-side resolver for the effective diagram-type styles: the static
 * defaults overlaid with any DiagramTypeStyle override rows (code, colours AND
 * sortOrder), sorted by the effective sortOrder. Shared by the code/colour PUT
 * and the sort-order PUT so they can't drift.
 */
import { prisma } from "@/app/lib/db";
import { DEFAULT_DIAGRAM_TYPE_STYLES, type DiagramTypeStyle } from "./diagramTypeStyles";

export async function effectiveDiagramTypeStyles(): Promise<DiagramTypeStyle[]> {
  const rows = await prisma.diagramTypeStyle.findMany();
  const byKey = new Map(rows.map((r) => [r.typeKey, r]));
  return DEFAULT_DIAGRAM_TYPE_STYLES.map((d) => {
    const o = byKey.get(d.typeKey);
    return o
      ? { ...d, code: o.code, bgColor: o.bgColor, textColor: o.textColor, sortOrder: o.sortOrder }
      : d;
  }).sort((a, b) => a.sortOrder - b.sortOrder);
}
