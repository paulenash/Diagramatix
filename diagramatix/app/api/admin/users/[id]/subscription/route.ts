/**
 * Admin: change a user's subscription tier.
 *
 *   PATCH /api/admin/users/[id]/subscription
 *     Body: { tierId: "free" | "introductory" | "professional" | "expert" }
 *
 * Updates User.subscriptionLevelId AND User.subscriptionAssignedAt (the
 * latter restarts the trial clock, intentional: moving someone to Free
 * gives them a fresh 30 days; moving them back off Free resets too so
 * the trial-expiry computation has a clean reference). isSuperuser-gated.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

const ALLOWED_TIER_IDS = new Set(["free", "introductory", "professional", "expert"]);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { tierId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tierId = body.tierId;
  if (typeof tierId !== "string" || !ALLOWED_TIER_IDS.has(tierId)) {
    return NextResponse.json(
      { error: `Unknown tier id: ${String(tierId ?? "(missing)")}` },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      subscriptionLevelId: tierId,
      subscriptionAssignedAt: new Date(),
    },
    select: {
      id: true,
      email: true,
      subscriptionLevelId: true,
      subscriptionAssignedAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}
