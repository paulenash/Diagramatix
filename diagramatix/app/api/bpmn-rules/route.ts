import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";
import { isSuperuser } from "@/app/lib/superuser";

/** GET — return user's rules (or default if none saved) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Try user-specific rules first
  let orgId: string | null = null;
  try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no org */ }

  if (orgId) {
    const userRules = await prisma.bpmnRules.findFirst({
      where: { userId: session.user.id, orgId },
      select: { id: true, rules: true, isDefault: true, updatedAt: true },
    });
    if (userRules) return NextResponse.json(userRules);
  }

  // Fall back to system default
  const defaultRules = await prisma.bpmnRules.findFirst({
    where: { isDefault: true },
    select: { id: true, rules: true, isDefault: true, updatedAt: true },
  });

  return NextResponse.json(defaultRules ?? { id: null, rules: "", isDefault: true });
}

/** PUT — save user's customised rules */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { rules } = await req.json();
  if (typeof rules !== "string") return NextResponse.json({ error: "Rules must be a string" }, { status: 400 });

  // Upsert user-specific rules
  const existing = await prisma.bpmnRules.findFirst({
    where: { userId: session.user.id, orgId },
  });

  if (existing) {
    await prisma.bpmnRules.update({ where: { id: existing.id }, data: { rules } });
  } else {
    await prisma.bpmnRules.create({
      data: { rules, userId: session.user.id, orgId, isDefault: false },
    });
  }

  return NextResponse.json({ success: true });
}

/** POST — admin: update default rules */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { rules } = await req.json();
  if (typeof rules !== "string") return NextResponse.json({ error: "Rules must be a string" }, { status: 400 });

  const existing = await prisma.bpmnRules.findFirst({ where: { isDefault: true } });
  if (existing) {
    await prisma.bpmnRules.update({ where: { id: existing.id }, data: { rules } });
  } else {
    await prisma.bpmnRules.create({ data: { rules, isDefault: true } });
  }

  return NextResponse.json({ success: true });
}
