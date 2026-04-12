import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const prompts = await prisma.prompt.findMany({
    where: { userId: session.user.id, orgId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, text: true, createdAt: true, updatedAt: true },
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

  const { name, text } = await req.json();
  if (!name?.trim() || !text?.trim()) {
    return NextResponse.json({ error: "Name and text are required" }, { status: 400 });
  }

  const prompt = await prisma.prompt.create({
    data: { name: name.trim(), text: text.trim(), userId: session.user.id, orgId },
  });

  return NextResponse.json(prompt, { status: 201 });
}
