import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { disabledReason, itemAllowed, repositoryAccessFor } from "@/app/lib/valueChain/repositoryAccess";
import { publishedChainsFor } from "@/app/lib/valueChain/repositoryChains";

/**
 * GET — the Process Repository as the signed-in USER sees it (Create Project from Process Repository).
 *
 * Only PUBLISHED, non-hidden chains — the master repository's, with the user's Org's own published chains standing in for the master chains they
 * replace (repositoryChains.ts) — each with its diagrams in the order a generated project reads (the chain-level diagrams first, then one per
 * process), and for every diagram whether the user's Process Repository feature opens it. A disabled diagram is still listed, with the reason, so
 * the dialog can show what an upgrade would unlock. The SuperAdmin and OrgAdmin maintenance screens are different routes.
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

  let orgId: string | null = null;
  try { orgId = await getCurrentOrgId(session, await cookies()); } catch { orgId = null; }
  const rows = await publishedChainsFor(orgId);

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
      // "org" = the user's Org's own version of this chain (shown as such in the dialog).
      source: row.source,
      diagrams,
      available: diagrams.filter((d) => d.allowed).length,
    };
  }).filter((c) => c.diagrams.length > 0);

  return NextResponse.json({ mode: access.mode, levelId: access.levelId, chains });
}
