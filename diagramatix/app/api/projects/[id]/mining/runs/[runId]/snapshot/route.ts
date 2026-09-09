/**
 * Snapshot a (live) run to a new dated ProcessMiningRun, freezing its current
 * stats / variants / performance / governance / conformance so org Compliance
 * Monitoring gains a point-in-time history entry. The discovered/live diagrams
 * are NOT cloned (they stay with the live run); a snapshot is a data record.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { updateRunJson } from "@/app/lib/mining/runStore";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, runId } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "edit");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const fg = await gateFeature(session?.user?.id ?? "", "processMining");
  if (fg) return fg;

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const snap = await prisma.processMiningRun.create({
    data: { name: `${run.name} — ${stamp}`, projectId: id, orgId, createdById: session?.user?.id ?? null, referenceSmId: run.referenceSmId },
  });
  await updateRunJson(snap.id, {
    mapping: run.mapping, stats: run.stats, variants: run.variants,
    performance: run.performance, governance: run.governance ?? null, conformance: run.conformance ?? null,
  });

  return NextResponse.json({ run: { id: snap.id, name: snap.name } }, { status: 201 });
}
