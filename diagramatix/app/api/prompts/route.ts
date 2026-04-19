import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const diagramType = searchParams.get("diagramType");

  const prompts = await prisma.prompt.findMany({
    where: { userId: session.user.id, orgId, ...(diagramType ? { diagramType } : {}) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, text: true, diagramType: true, createdAt: true, updatedAt: true },
  });

  return NextResponse.json(prompts);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { name, text, diagramType, planJson } = await req.json();
  if (!name?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "Name and text are required" }, { status: 400 });
  }

  const prompt = await prisma.prompt.create({
    data: { name: name.trim(), text: text.trim(), diagramType: diagramType ?? "bpmn", userId: session.user.id, orgId },
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
