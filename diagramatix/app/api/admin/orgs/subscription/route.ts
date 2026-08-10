/**
 * SuperAdmin — assign a whole Org to a subscription level (e.g. Enterprise).
 * Every member of the org (including domain auto-joiners for its claimed
 * emailDomains) then resolves to at least that level. See
 * app/lib/features/availability.ts `resolveEffectiveLevelId`.
 *   GET → { orgs: [{ id, name, emailDomains, subscriptionLevelId }], levels }
 *   PUT { orgId, levelId } → set (levelId null/"" clears the org assignment)
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  const [orgs, levels] = await Promise.all([
    prisma.org.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, emailDomains: true, subscriptionLevelId: true } }),
    prisma.subscriptionLevel.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  return NextResponse.json({ orgs, levels });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  let body: { orgId?: string; levelId?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const levelId = body.levelId || null;
  if (levelId) {
    const lvl = await prisma.subscriptionLevel.findUnique({ where: { id: levelId }, select: { id: true } });
    if (!lvl) return NextResponse.json({ error: "Unknown level" }, { status: 400 });
  }
  const org = await prisma.org.findUnique({ where: { id: body.orgId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  await prisma.org.update({ where: { id: body.orgId }, data: { subscriptionLevelId: levelId } });
  return NextResponse.json({ ok: true, orgId: body.orgId, levelId });
}
