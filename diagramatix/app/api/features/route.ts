/**
 * GET /api/features
 *
 * Public — returns the published feature catalog. No auth. Used by the
 * marketing /features page and the in-dashboard "Features" modal.
 *
 * Only rows that have been published at least once AND aren't hidden
 * in their published snapshot are returned. Sorted by publishedSortOrder.
 *
 * `dynamic = "force-dynamic"` stops Next.js trying to PRE-render this
 * route at Docker build time (the build environment has no DB to call
 * into). Repeat-visitor caching is handled by the Cache-Control headers
 * the response carries — Azure App Service / any CDN in front will
 * serve cached responses for `s-maxage=60` before revalidating.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const features = await prisma.feature.findMany({
    where: {
      publishedAt: { not: null },
      publishedHidden: { not: true },
    },
    orderBy: { publishedSortOrder: "asc" },
    select: {
      id: true,
      publishedName: true,
      publishedSummary: true,
      publishedDetails: true,
      publishedSortOrder: true,
      publishedAt: true,
    },
  });

  // Reshape so the public client sees clean field names without the
  // "published" prefix — the prefix is an internal implementation
  // detail of the draft/published split.
  const items = features.map((f) => ({
    id: f.id,
    name: f.publishedName ?? "",
    summary: f.publishedSummary ?? "",
    details: f.publishedDetails ?? "",
    sortOrder: f.publishedSortOrder ?? 0,
  }));

  return NextResponse.json(
    { features: items },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
