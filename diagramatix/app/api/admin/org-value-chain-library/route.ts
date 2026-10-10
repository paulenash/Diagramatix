import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

/**
 * SuperAdmin — which Organisations have a repository of their own, for the Org picker on the Process Repository screen (Create a New Value
 * Chain, Paul 2026-10-10: the SuperAdmin manages the chains users create). Reads only: every Org with at least one chain, with how many were
 * created by users and how many were adopted from the master.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rows = await prisma.valueChainLibrary.groupBy({ by: ["orgId"], where: { orgId: { not: "" } }, _count: { _all: true } });
  const made = await prisma.valueChainLibrary.groupBy({ by: ["orgId"], where: { orgId: { not: "" }, createdByUserId: { not: null } }, _count: { _all: true } });
  const madeBy = new Map(made.map((m) => [m.orgId, m._count._all]));
  const orgs = await prisma.org.findMany({ where: { id: { in: rows.map((r) => r.orgId) } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const count = new Map(rows.map((r) => [r.orgId, r._count._all]));
  return NextResponse.json({ orgs: orgs.map((o) => ({ id: o.id, name: o.name, chains: count.get(o.id) ?? 0, userChains: madeBy.get(o.id) ?? 0 })) });
}
