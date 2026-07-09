import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/pcf/resolve  { frameworkId, codes:["1.1.1", …] }
 * Resolve a batch of APQC hierarchy codes (parsed from seeded folder names) to
 * their nodes within a framework, so bulk generation can classify + AI-ground
 * each folder's diagram. Returns { nodes: { code: { nodeId, pcfId, name, level } } }.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  let projectOrgId: string;
  try {
    ({ projectOrgId } = await requireProjectAccess(session, await cookies(), id, "view"));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const frameworkId = String(body?.frameworkId ?? "");
  const codes: string[] = (Array.isArray(body?.codes) ? body.codes : []).map((c: unknown) => String(c)).filter(Boolean);
  if (!frameworkId || codes.length === 0) return NextResponse.json({ nodes: {} });

  const fw = await prisma.pcfFramework.findFirst({ where: { id: frameworkId, OR: [{ orgId: null }, { orgId: projectOrgId }] }, select: { id: true } });
  if (!fw) return NextResponse.json({ error: "Framework not found" }, { status: 404 });

  const rows = await prisma.pcfNode.findMany({
    where: { frameworkId, active: true, hierarchyId: { in: [...new Set(codes)] } },
    select: { id: true, pcfId: true, hierarchyId: true, name: true, level: true, description: true },
  });
  const nodes: Record<string, { nodeId: string; pcfId: number; name: string; level: number; description: string | null }> = {};
  for (const n of rows) if (!nodes[n.hierarchyId]) nodes[n.hierarchyId] = { nodeId: n.id, pcfId: n.pcfId, name: n.name, level: n.level, description: n.description };
  return NextResponse.json({ nodes });
}
