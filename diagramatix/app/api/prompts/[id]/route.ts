import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  // Include planJson + planUpdatedAt (JSON column handled via raw SQL because
  // Prisma 7's generated select types exclude it).
  const row = await prisma.prompt.findFirst({ where: { id, userId: session.user.id, orgId } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const planRes = await pgPool.query<{ planJson: unknown; planUpdatedAt: Date | null }>(
    `SELECT "planJson", "planUpdatedAt" FROM "Prompt" WHERE id = $1`,
    [id],
  );
  const plan = planRes.rows[0] ?? { planJson: null, planUpdatedAt: null };
  return NextResponse.json({ ...row, planJson: plan.planJson, planUpdatedAt: plan.planUpdatedAt });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const existing = await prisma.prompt.findFirst({ where: { id, userId: session.user.id, orgId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, text, planJson } = await req.json();
  const data: Record<string, string> = {};
  if (name !== undefined) data.name = name.trim();
  if (text !== undefined) data.text = text.trim();
  if (Object.keys(data).length > 0) {
    await prisma.prompt.update({ where: { id }, data });
  }

  // planJson updates go through raw SQL (Prisma 7 JSON-field limitation).
  // Pass null to clear, or a JSON value to replace.
  if (planJson !== undefined) {
    await pgPool.query(
      `UPDATE "Prompt" SET "planJson" = $1::jsonb, "planUpdatedAt" = NOW() WHERE id = $2`,
      [planJson === null ? null : JSON.stringify(planJson), id],
    );
  }

  const updated = await prisma.prompt.findFirst({ where: { id } });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const existing = await prisma.prompt.findFirst({ where: { id, userId: session.user.id, orgId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.prompt.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
