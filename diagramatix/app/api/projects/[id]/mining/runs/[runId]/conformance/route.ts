/**
 * POST — replay a run's mined state changes over a chosen reference State-Machine
 * diagram and persist the conformance result (fitness + deviations) on the run.
 * Body: { referenceSmId }.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const referenceSmId = typeof body.referenceSmId === "string" ? body.referenceSmId : "";
  if (!referenceSmId) return NextResponse.json({ error: "Pick a reference state machine." }, { status: 400 });

  const ref = await prisma.diagram.findFirst({ where: { id: referenceSmId, projectId: id, type: "state-machine" }, select: { data: true } });
  if (!ref) return NextResponse.json({ error: "Reference state machine not found in this project." }, { status: 404 });

  const variants = (run.variants ?? []) as unknown as Variant[];
  const result = checkTransitionConformance(variants, (ref.data ?? { elements: [], connectors: [] }) as unknown as ReferenceSm);

  await pgPool.query(
    'UPDATE "ProcessMiningRun" SET conformance = $1::jsonb, "referenceSmId" = $2, "updatedAt" = NOW() WHERE id = $3',
    [JSON.stringify(result), referenceSmId, runId],
  );

  return NextResponse.json({ conformance: result }, { status: 200 });
}
