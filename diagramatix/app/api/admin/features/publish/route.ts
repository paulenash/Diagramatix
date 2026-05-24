/**
 * POST /api/admin/features/publish
 *
 * Copies every Feature's draft fields (name / summary / details /
 * hidden / sortOrder) into the published* mirror columns and stamps
 * publishedAt = NOW(). One transaction so the public /features page
 * never sees a half-published snapshot.
 *
 * isSuperuser-gated.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

export async function POST() {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const features = await prisma.feature.findMany();

  await prisma.$transaction(
    features.map((f) =>
      prisma.feature.update({
        where: { id: f.id },
        data: {
          publishedName: f.name,
          publishedSummary: f.summary,
          publishedDetails: f.details,
          publishedHidden: f.hidden,
          publishedSortOrder: f.sortOrder,
          publishedAt: now,
        },
      }),
    ),
  );

  return NextResponse.json({ publishedAt: now.toISOString(), count: features.length });
}
