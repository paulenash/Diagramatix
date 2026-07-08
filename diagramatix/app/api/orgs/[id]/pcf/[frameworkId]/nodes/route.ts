import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string; frameworkId: string }> };

/**
 * POST /api/orgs/[id]/pcf/[frameworkId]/nodes  { name, parentId?, orgCode? }
 * Add a CUSTOM (org-authored) node to a tailored framework — no APQC source.
 * Custom nodes get a synthetic negative pcfId (unique within the framework) so
 * they never collide with real APQC pcfIds. SuperAdmin OR Owner/Admin.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const fw = await prisma.pcfFramework.findFirst({ where: { id: frameworkId, orgId: id, kind: "tailored" }, select: { id: true } });
  if (!fw) return NextResponse.json({ error: "Not an editable tailored framework" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const orgCode = typeof body?.orgCode === "string" && body.orgCode.trim() ? body.orgCode.trim() : null;
  const parentId = typeof body?.parentId === "string" && body.parentId ? body.parentId : null;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  let level = 1;
  if (parentId) {
    const parent = await prisma.pcfNode.findFirst({ where: { id: parentId, frameworkId }, select: { level: true } });
    if (!parent) return NextResponse.json({ error: "Parent not found in this framework" }, { status: 400 });
    level = parent.level + 1;
  }

  // Synthetic pcfId: one below the framework's current minimum (negative range).
  const min = await prisma.pcfNode.aggregate({ where: { frameworkId }, _min: { pcfId: true } });
  const pcfId = Math.min(0, min._min.pcfId ?? 0) - 1;
  const maxSort = await prisma.pcfNode.aggregate({ where: { frameworkId, parentId }, _max: { sortOrder: true } });

  const node = await prisma.pcfNode.create({
    data: {
      frameworkId, pcfId, hierarchyId: orgCode ?? "custom", name, level, parentId,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1, isCustom: true, active: true, orgCode,
    },
    select: { id: true, pcfId: true, hierarchyId: true, name: true, level: true, parentId: true, isCustom: true, active: true, orgCode: true },
  });
  return NextResponse.json({ node }, { status: 201 });
}
