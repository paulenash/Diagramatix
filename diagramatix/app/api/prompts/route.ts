import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  let orgId: string;
  try { orgId = await getCurrentOrgId(session, cookieStore); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  // SEC-21: the org above is impersonation-aware, so the owner scope must be too.
  // Using session.user.id here listed the SUPERUSER's prompts inside the
  // impersonated user's org — the wrong set. Resolve the effective user.
  const userId = getEffectiveUserId(session, cookieStore) ?? session.user.id;

  const { searchParams } = new URL(req.url);
  const diagramType = searchParams.get("diagramType");

  const prompts = await prisma.prompt.findMany({
    where: { userId, orgId, ...(diagramType ? { diagramType } : {}) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, text: true, diagramType: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(prompts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  // Creating a prompt is a write; now that it targets the EFFECTIVE user
  // (SEC-21), a read-only impersonating SuperAdmin must not create data as the
  // viewed user.
  if (isReadOnlyImpersonation(session, cookieStore)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  let orgId: string;
  try { orgId = await getCurrentOrgId(session, cookieStore); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const userId = getEffectiveUserId(session, cookieStore) ?? session.user.id;

  const { name, text, diagramType, planJson } = await req.json();
  if (!name?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "Name and text are required" }, { status: 400 });
  }

  const prompt = await prisma.prompt.create({
    data: { name: name.trim(), text: text.trim(), diagramType: diagramType ?? "bpmn", userId, orgId },
  });

  // planJson is a JSON column and Prisma 7 doesn't parameterise it in the update
  // input schema. Use raw SQL through pgPool when the caller supplies it.
  if (planJson !== undefined) {
    await pgPool.query(
      `UPDATE "Prompt" SET "planJson" = $1::jsonb, "planUpdatedAt" = NOW() WHERE id = $2`,
      [planJson === null ? null : JSON.stringify(planJson), prompt.id],
    );
  }

  return NextResponse.json(prompt, { status: 201 });
}
