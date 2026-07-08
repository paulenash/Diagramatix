import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

const DEFAULT_APQC_NOTICE =
  "Derived from the APQC Process Classification Framework® (PCF). ©APQC. All rights reserved. " +
  "This tailored framework is a derivative work of the PCF and carries APQC's notice for the branches sourced from it.";

/**
 * GET /api/orgs/[id]/pcf
 * Frameworks visible to the org: the current global APQC reference frameworks
 * plus the org's own (imported reference or tailored). SuperAdmin OR Owner/Admin.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const frameworks = await prisma.pcfFramework.findMany({
    where: { OR: [{ orgId: null, kind: "reference", isCurrent: true }, { orgId: id }] },
    select: {
      id: true, name: true, variant: true, version: true, kind: true, division: true,
      attributionNote: true, _count: { select: { nodes: true } },
    },
    orderBy: [{ kind: "asc" }, { variant: "asc" }],
  });
  return NextResponse.json({ frameworks });
}

/**
 * POST /api/orgs/[id]/pcf  { name, division? }
 * Create an empty org-owned TAILORED framework (Level 5). The org then composes
 * branches from reference variants and extends it with custom nodes. Carries the
 * APQC attribution notice (it will hold APQC-derived branches). SuperAdmin OR Owner/Admin.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const division = typeof body?.division === "string" && body.division.trim() ? body.division.trim() : null;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const framework = await prisma.pcfFramework.create({
    data: {
      orgId: id, kind: "tailored", familyKey: `tailored-${randomUUID()}`,
      name, variant: name, version: "1", isCurrent: true, division,
      attributionNote: DEFAULT_APQC_NOTICE,
    },
    select: { id: true, name: true, variant: true, version: true, kind: true, division: true },
  });
  return NextResponse.json({ framework }, { status: 201 });
}
