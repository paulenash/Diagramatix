import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/orgs/[id]
 *
 * SuperAdmin-only. Cascades via the existing Prisma onDelete: Cascade
 * relations on Org → members, projects, diagrams, prompts, diagram
 * rules, and collaboration groups. Double-confirm is done client-side
 * on the Danger Zone button; this endpoint executes immediately.
 *
 * Refuses to delete the LAST Org in the system as a safety net — every
 * user needs at least one Org to belong to or the dashboard
 * `getCurrentOrgId` resolver breaks. Future feature: a "default Org"
 * concept would let us drop this constraint.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const org = await prisma.org.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!org) return NextResponse.json({ error: "Org not found" }, { status: 404 });

  const orgCount = await prisma.org.count();
  if (orgCount <= 1) {
    return NextResponse.json(
      { error: "Cannot delete the last Org in the system" },
      { status: 400 },
    );
  }

  // Paid-subscriber guard (Paul's 2026-06-08 rule): SuperAdmin can only
  // delete an Org when every member is on the Free tier. Any active
  // paid subscription must be cancelled first so we don't accidentally
  // strand Stripe rows or paid users.
  const nonFreeCount = await prisma.user.count({
    where: {
      orgMembers: { some: { orgId: id } },
      // subscriptionLevelId is "free" for free-tier users; anything
      // else (introductory / professional / expert) is paid. NULL is
      // treated as not-yet-assigned and counted as paid to be safe —
      // an unassigned membership in a paid Org should block delete
      // until reconciled.
      NOT: { subscriptionLevelId: "free" },
    },
  });
  if (nonFreeCount > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${nonFreeCount} member${nonFreeCount === 1 ? "" : "s"} still on a paid tier. Move them to Free first.`,
      },
      { status: 400 },
    );
  }

  // Cascade does the heavy lifting via the schema relations.
  await prisma.org.delete({ where: { id } });
  return NextResponse.json({ success: true, name: org.name });
}
