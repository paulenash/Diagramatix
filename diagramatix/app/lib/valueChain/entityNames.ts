/**
 * The organisation's own names, for entity alignment (Paul, 2026-10-08).
 *
 * When the author of a Process Repository prompt asks the lanes, roles and systems to line up with the organisation's Entity Lists, the generator
 * is handed those names, grouped by list, so a lane called "Accounts Payable" in the narrative becomes the organisation's "Accounts Payable"
 * rather than a near miss. Pure formatting here; the single database read is `loadEntityNames`.
 */
import { prisma } from "@/app/lib/db";

export interface EntityListLite { name: string; kind: string; nodes: { name: string; level: string }[] }

const MAX_NAMES = 200;

/** "Org structure — Finance (OrgUnit), Accounts Payable (Team) …" one line per list; capped so a huge list cannot swamp the prompt. */
export function formatEntityNames(lists: EntityListLite[]): string {
  let left = MAX_NAMES;
  const lines: string[] = [];
  for (const l of lists) {
    if (left <= 0) break;
    const names = [...new Set(l.nodes.map((n) => n.name.trim()).filter(Boolean))].slice(0, left);
    if (names.length === 0) continue;
    left -= names.length;
    lines.push(`- ${l.kind} — ${l.name}: ${names.join("; ")}`);
  }
  return lines.join("\n");
}

/** The organisation's master Entity Lists (org-level, not project copies), formatted. Empty string when there are none. */
export async function loadEntityNames(orgId: string): Promise<string> {
  const lists = await prisma.entityList.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
    include: { nodes: { select: { name: true, level: true }, orderBy: { sortOrder: "asc" } } },
  }).catch(() => []);
  return formatEntityNames(lists.map((l) => ({ name: l.name, kind: String(l.kind), nodes: l.nodes.map((n) => ({ name: n.name, level: String(n.level) })) })));
}
