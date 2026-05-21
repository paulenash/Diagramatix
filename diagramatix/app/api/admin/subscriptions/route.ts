/**
 * Admin: read + edit the four SubscriptionLevel rows.
 *
 *   GET  /api/admin/subscriptions
 *     Returns [{ tier rows }] sorted by sortOrder.
 *
 *   PUT  /api/admin/subscriptions
 *     Body: { tiers: SubscriptionLevelInput[] } — full replacement of the
 *     editable fields for each tier (by id). Unknown tier ids are
 *     ignored; new tier ids are NOT created from here (the four
 *     canonical tiers are seeded by scripts/seed-subscriptions.ts).
 *
 * Both endpoints are gated by isSuperuser(session). Returns 403 otherwise.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

const ALLOWED_TIER_IDS = new Set(["free", "introductory", "professional", "expert"]);

export async function GET() {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tiers = await prisma.subscriptionLevel.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ tiers });
}

/** Allowed payload shape. Every limit field is `number | null`; bool
 *  flags are required. Caller may omit fields they don't want to update,
 *  but missing keys are left untouched (partial update). */
interface TierInput {
  id: string;
  name?: string;
  priceMonthly?: number;
  maxProjects?: number | null;
  maxDiagramsPerTypePerProject?: number | null;
  maxArchimateDiagramsTotal?: number | null;
  maxNonBpmnElementsPerDiagram?: number | null;
  maxBpmnElementsPerDiagram?: number | null;
  maxAiAttempts?: number | null;
  aiAttemptsResetMonthly?: boolean;
  maxIndividualExports?: number | null;
  individualExportsResetMonthly?: boolean;
  maxIndividualImports?: number | null;
  individualImportsResetMonthly?: boolean;
  maxBulkExports?: number | null;
  maxBulkImports?: number | null;
  trialDays?: number | null;
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { tiers?: TierInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tiers = Array.isArray(body.tiers) ? body.tiers : [];
  if (tiers.length === 0) {
    return NextResponse.json({ error: "Missing tiers in body" }, { status: 400 });
  }

  // Validate every tier id up front so the transaction either fully
  // succeeds or doesn't run at all.
  for (const t of tiers) {
    if (!t.id || !ALLOWED_TIER_IDS.has(t.id)) {
      return NextResponse.json(
        { error: `Unknown tier id: ${t.id ?? "(missing)"}` },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const results = [];
    for (const t of tiers) {
      // Only the fields actually present in the payload are passed through.
      // Prisma will treat undefined as "no change".
      const data: Record<string, unknown> = {};
      const copy = (k: keyof TierInput) => {
        if (t[k] !== undefined) data[k as string] = t[k];
      };
      copy("name");
      copy("priceMonthly");
      copy("maxProjects");
      copy("maxDiagramsPerTypePerProject");
      copy("maxArchimateDiagramsTotal");
      copy("maxNonBpmnElementsPerDiagram");
      copy("maxBpmnElementsPerDiagram");
      copy("maxAiAttempts");
      copy("aiAttemptsResetMonthly");
      copy("maxIndividualExports");
      copy("individualExportsResetMonthly");
      copy("maxIndividualImports");
      copy("individualImportsResetMonthly");
      copy("maxBulkExports");
      copy("maxBulkImports");
      copy("trialDays");

      const row = await tx.subscriptionLevel.update({
        where: { id: t.id },
        data,
      });
      results.push(row);
    }
    return results;
  });

  return NextResponse.json({ tiers: updated });
}
