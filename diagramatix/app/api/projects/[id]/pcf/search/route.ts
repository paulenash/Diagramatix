import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildPcfNodeWhere } from "@/app/lib/pcf/searchMatch";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/pcf/search?framework=<id>&q=<text>
 * Up to 40 matching PCF nodes for the classify picker, by name / code / PCF id.
 * The framework must be a global reference or belong to the project's org.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  let projectOrgId: string;
  try {
    ({ projectOrgId } = await requireProjectAccess(session, await cookies(), id, "view"));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const url = new URL(req.url);
  const frameworkId = url.searchParams.get("framework") ?? "";
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!frameworkId) return NextResponse.json({ nodes: [] });

  const fw = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, { orgId: projectOrgId }] },
    select: { id: true, variant: true },
  });
  if (!fw) return NextResponse.json({ error: "Framework not found" }, { status: 404 });

  // Match on APQC ID (the dotted hierarchy code), Name, or both together.
  //  • "1.1.1"            → code prefix (or exact pcfId if a bare integer)
  //  • "assess"           → name contains
  //  • "1.1.1 assess ..." → code prefix AND name contains the rest
  // A leading dotted/numeric token followed by a space is treated as an
  // "APQC ID + Name" query so pasting a classification label like
  // "1.1.1 Assess the external environment" resolves to its node.
  const nodes = await prisma.pcfNode.findMany({
    where: {
      frameworkId, active: true,
      ...buildPcfNodeWhere(q),
    },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    take: 40,
    select: { id: true, pcfId: true, hierarchyId: true, name: true, level: true },
  });
  return NextResponse.json({ variant: fw.variant, nodes });
}
