import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { buildPcfNodeWhere } from "@/app/lib/pcf/searchMatch";

/**
 * GET /api/pcf/search?framework=<id>&q=<text>
 * Org-scoped node search (global reference + the caller's org frameworks) for
 * the dashboard "Create APQC Project" dialog. Mirrors the project-scoped
 * /api/projects/[id]/pcf/search, minus the project gate.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await tryGetCurrentOrgId(session, await cookies());

  const url = new URL(req.url);
  const frameworkId = url.searchParams.get("framework") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!frameworkId) return NextResponse.json({ nodes: [] });

  const fw = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, ...(orgId ? [{ orgId }] : [])] },
    select: { id: true, variant: true },
  });
  if (!fw) return NextResponse.json({ error: "Framework not found" }, { status: 404 });

  const nodes = await prisma.pcfNode.findMany({
    where: { frameworkId, active: true, ...buildPcfNodeWhere(q) },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    take: 40,
    select: { id: true, pcfId: true, hierarchyId: true, name: true, level: true },
  });
  return NextResponse.json({ variant: fw.variant, nodes });
}
