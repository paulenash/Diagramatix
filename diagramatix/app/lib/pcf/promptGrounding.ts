/** Level 3 — AI grounding. Render a PCF branch (a classified process + its
 *  standard sub-activities) as a reference block that's appended to the AI
 *  generation prompt's rules seam, so a generated process aligns to the APQC
 *  standard's decomposition + terminology. Returns null when the node has no
 *  sub-structure to ground with (or doesn't exist). */
import type { PrismaClient } from "@/app/generated/prisma/client";

/** Append the PCF grounding block for `pcfNodeId` (if any) to the AI rules that
 *  feed the generation prompt. No-op when nothing is classified. */
export async function groundRulesWithPcf(prisma: PrismaClient, aiRules: string, pcfNodeId?: string | null): Promise<string> {
  if (!pcfNodeId) return aiRules;
  const block = await renderPcfBranchForPrompt(prisma, pcfNodeId).catch(() => null);
  return block ? (aiRules ? `${aiRules}\n\n${block}` : block) : aiRules;
}

/** Trim an APQC element description to a prompt-friendly length. */
function shortDesc(d: string | null | undefined, max = 220): string {
  const s = (d ?? "").replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export async function renderPcfBranchForPrompt(prisma: PrismaClient, nodeId: string): Promise<string | null> {
  const node = await prisma.pcfNode.findUnique({
    where: { id: nodeId },
    select: { hierarchyId: true, name: true, level: true, description: true, frameworkId: true, framework: { select: { variant: true } } },
  });
  if (!node) return null;

  // Descendants down two levels (children + grandchildren) — the standard
  // sub-processes/activities. Capped so the prompt stays lean.
  const descendants = await prisma.pcfNode.findMany({
    where: {
      frameworkId: node.frameworkId, active: true,
      hierarchyId: { startsWith: `${node.hierarchyId}.` },
      level: { lte: node.level + 2 },
    },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    take: 80,
    select: { hierarchyId: true, name: true, level: true, description: true },
  });
  if (descendants.length === 0) return null;

  // Each sub-activity: "- <code> <name> — <APQC element description>" so the AI
  // has the standard's own definition of what the step entails, not just its name.
  const lines = descendants.map((d) => {
    const desc = shortDesc(d.description);
    return `${"  ".repeat(Math.max(0, d.level - node.level - 1))}- ${d.hierarchyId} ${d.name}${desc ? ` — ${desc}` : ""}`;
  });
  const nodeDesc = shortDesc(node.description, 400);
  return [
    `APQC PCF ALIGNMENT — the target process maps to the APQC ${node.framework.variant} standard process "${node.hierarchyId} ${node.name}"${nodeDesc ? ` (${nodeDesc})` : ""}. Use the standard sub-activities below (with their APQC element descriptions) as a reference for completeness and naming; adapt them to the user's described process, and omit any that don't apply:`,
    ...lines,
  ].join("\n");
}
