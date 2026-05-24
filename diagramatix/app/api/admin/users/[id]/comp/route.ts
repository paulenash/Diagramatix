/**
 * Admin: grant or revoke a comp tier for a user.
 *
 *   POST   /api/admin/users/[id]/comp
 *     Body: { tierId: "introductory" | "professional" | "expert",
 *             durationDays: number,
 *             reason?: string }     // reason currently logged only, not persisted
 *
 *     Sets User.compTierLevelId + compTierExpiresAt + compTierGrantedAt.
 *     Also wipes monthly UsageCounter rows so the user gets a fresh
 *     quota at the new (higher) tier rather than carrying over usage
 *     accumulated under the underlying paid tier — the "replace"
 *     semantics Paul confirmed when we designed Option A.
 *
 *   DELETE /api/admin/users/[id]/comp
 *     Revokes immediately — nulls all three columns. User reverts to
 *     their underlying subscriptionLevelId on next page load (via
 *     getEffectiveSubscriptionLevelId).
 *
 * Both endpoints are isSuperuser-gated. Free is NOT a valid comp
 * target (a comp grant is meant to UPGRADE a user; "comping" to Free
 * is just a regular tier change via PATCH /subscription).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

const ALLOWED_COMP_TIERS = new Set(["introductory", "professional", "expert"]);
/** Hard upper bound to prevent obvious data-entry mistakes (e.g. typing
 *  3650 when meaning 365). 3 years is generous; longer comps probably
 *  want to be a real tier change anyway. */
const MAX_DURATION_DAYS = 365 * 3;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  let body: { tierId?: unknown; durationDays?: unknown; reason?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tierId = body.tierId;
  if (typeof tierId !== "string" || !ALLOWED_COMP_TIERS.has(tierId)) {
    return NextResponse.json(
      {
        error: `Comp tier must be one of ${[...ALLOWED_COMP_TIERS].join(", ")} — got "${String(tierId ?? "(missing)")}".`,
      },
      { status: 400 },
    );
  }

  const durationDaysRaw = body.durationDays;
  const durationDays =
    typeof durationDaysRaw === "number"
      ? durationDaysRaw
      : Number(durationDaysRaw);
  if (
    !Number.isFinite(durationDays) ||
    durationDays <= 0 ||
    durationDays > MAX_DURATION_DAYS
  ) {
    return NextResponse.json(
      {
        error: `Duration must be a positive number of days, ≤ ${MAX_DURATION_DAYS}.`,
      },
      { status: 400 },
    );
  }

  // Confirm the target user actually exists before mutating.
  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  // Transaction: write the comp + wipe monthly counters so the user
  // gets fresh quota at the new tier. Lifetime counters (periodKey =
  // "all-time") are intentionally preserved — they're Free-tier
  // counters that don't reset on tier changes either.
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        compTierLevelId: tierId,
        compTierExpiresAt: expiresAt,
        compTierGrantedAt: now,
      },
    }),
    prisma.usageCounter.deleteMany({
      where: { userId: id, NOT: { periodKey: "all-time" } },
    }),
  ]);

  return NextResponse.json({
    user: {
      id: target.id,
      email: target.email,
      compTierLevelId: tierId,
      compTierExpiresAt: expiresAt.toISOString(),
      compTierGrantedAt: now.toISOString(),
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // Revoke is idempotent — nulling already-null columns is a no-op.
  await prisma.user.update({
    where: { id },
    data: {
      compTierLevelId: null,
      compTierExpiresAt: null,
      compTierGrantedAt: null,
    },
  });

  return NextResponse.json({ revoked: true });
}
