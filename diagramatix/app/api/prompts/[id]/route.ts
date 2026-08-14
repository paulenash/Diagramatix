import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

// SEC-21: getCurrentOrgId is impersonation-aware, so the owner scope must be
// too. Filtering by session.user.id (the SUPERUSER) inside the impersonated
// user's org matched nothing — the prompt belongs to the impersonated user.
// Resolve org + effective user together for every handler.
async function scope(session: Parameters<typeof getCurrentOrgId>[0]) {
  const cookieStore = await cookies();
  const orgId = await getCurrentOrgId(session, cookieStore);
  const userId = getEffectiveUserId(session, cookieStore) ?? session?.user?.id ?? "";
  return { cookieStore, orgId, userId };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string, userId: string;
  try { ({ orgId, userId } = await scope(session)); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  // Include planJson + planUpdatedAt (JSON column handled via raw SQL because
  // Prisma 7's generated select types exclude it).
  const row = await prisma.prompt.findFirst({ where: { id, userId, orgId } });
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

  let orgId: string, userId: string, cookieStore: Awaited<ReturnType<typeof cookies>>;
  try { ({ orgId, userId, cookieStore } = await scope(session)); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // Editing a prompt is a write against the effective user (SEC-21) — block in
  // read-only impersonation.
  if (isReadOnlyImpersonation(session, cookieStore)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.prompt.findFirst({ where: { id, userId, orgId } });
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

  let orgId: string, userId: string, cookieStore: Awaited<ReturnType<typeof cookies>>;
  try { ({ orgId, userId, cookieStore } = await scope(session)); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (isReadOnlyImpersonation(session, cookieStore)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.prompt.findFirst({ where: { id, userId, orgId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.prompt.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
