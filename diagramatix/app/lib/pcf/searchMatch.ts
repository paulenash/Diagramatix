/**
 * Build the Prisma `where` fragment for an APQC PCF node search box.
 *
 * Supports three query shapes so the user never has to reformat what they typed:
 *  • "1.1.1"                → code prefix (or exact pcfId for a bare integer)
 *  • "assess"               → name contains
 *  • "1.1.1 Assess the …"   → code prefix OR name contains (forgiving) — pasting
 *    a classification label / seeded folder name "code + name" still surfaces the
 *    node by its code even if the trailing name text doesn't line up exactly.
 */
export function buildPcfNodeWhere(qRaw: string): Record<string, unknown> {
  const q = (qRaw ?? "").trim();
  if (!q) return {};
  const codeName = q.match(/^(\d+(?:\.\d+)*)\s+(.+)$/);
  const or: Record<string, unknown>[] = [];
  if (codeName) {
    or.push({ hierarchyId: { startsWith: codeName[1] } });
    or.push({ name: { contains: codeName[2].trim(), mode: "insensitive" } });
  } else {
    or.push({ name: { contains: q, mode: "insensitive" } });
    or.push({ hierarchyId: { startsWith: q } });
    if (/^\d+$/.test(q)) or.push({ pcfId: parseInt(q, 10) });
  }
  return { OR: or };
}
