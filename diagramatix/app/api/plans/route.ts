/**
 * GET /api/plans — the plans' names and prices and the starting trial
 * length, for pages that have no server component of their own (the sign-up
 * form). Public and read-only. It replaces a hard-coded copy of the prices that
 * carried a "keep these in sync" comment.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const levels = await prisma.subscriptionLevel.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, priceMonthly: true, trialDays: true },
  });
  return NextResponse.json({
    plans: levels.map((l) => ({ id: l.id, name: l.name, priceMonthly: l.priceMonthly })),
    trialDays: levels.find((l) => l.id === "free")?.trialDays ?? null,
  });
}
