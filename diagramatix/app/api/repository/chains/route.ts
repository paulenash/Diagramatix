import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { disabledReason, itemAllowed, repositoryAccessFor } from "@/app/lib/valueChain/repositoryAccess";

/**
 * GET — the Process Repository as the signed-in USER sees it (Create Project from Process Repository).
 *
 * Only PUBLISHED, non-hidden chains, each with its diagrams in the order a generated project reads (the chain-level diagrams first, then one
 * per process), and for every diagram whether the user's Process Repository feature opens it. A disabled diagram is still listed — with the
 * reason — so the dialog can show what an upgrade would unlock. The SuperAdmin maintenance screen is a different route (admin/value-chain-library).
 */
export const dynamic = "force-dynamic";

const CHAIN_LEVEL_ORDER = ["value-chain", "context", "process-context", "archimate"];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await repositoryAccessFor(session.user.id);
  if (access.mode === "none") {
    return NextResponse.json({ mode: "none", levelId: access.levelId, chains: [], error: "The Process Repository is not part of your subscription." }, { status: 403 });
  }

  const rows = await prisma.valueChainLibrary.findMany({
    where: { hidden: false, publishedAt: { not: null } },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { processes: { orderBy: { sortOrder: "asc" } }, prompts: { select: { type: true, processCode: true, name: true, publishedPrompt: true } } },
  });

  const chains = rows.map((row) => {
    const live = row.prompts.filter((p) => (p.publishedPrompt ?? "").trim());
    const ordered = [
      ...CHAIN_LEVEL_ORDER.flatMap((t) => live.filter((p) => p.type === t && !p.processCode)),
      ...row.processes.flatMap((proc) => live.filter((p) => p.type === "bpmn" && p.processCode === proc.code)),
    ];
    const diagrams = ordered.map((p) => {
      const item = { chainCode: row.code, type: p.type, processCode: p.processCode };
      return {
        key: `${p.type}::${p.name}`, name: p.name, type: p.type, processCode: p.processCode,
        allowed: itemAllowed(access, item), reason: disabledReason(access, item),
      };
    });
    return {
      code: row.code, title: row.publishedTitle ?? row.title, group: row.groupName,
      diagrams,
      available: diagrams.filter((d) => d.allowed).length,
    };
  }).filter((c) => c.diagrams.length > 0);

  return NextResponse.json({ mode: access.mode, levelId: access.levelId, chains });
}
