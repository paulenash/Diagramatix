/**
 * Import an OCEL 2.0 log as an object-centric STUDY: mine one lifecycle per
 * object type (each → its own discovered state-machine diagram + ProcessMiningRun)
 * and build the shared Domain Diagram (object types = entities, O2O = associations)
 * whose entities link to their type's state machine. The per-type runs are grouped
 * by ocelGroupId + carry the objectType + the domainDiagramId.
 *
 * Body: { name?, ocelText, selectedTypes?, activityStateByType? }.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildOcelStudy } from "@/app/lib/mining/ocelStudy";
import { buildDomainFromOcel } from "@/app/lib/mining/buildDomainFromOcel";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  let orgId: string | null = null;
  try {
    const ctx = await requireProjectAccess(session, await cookies(), id, "edit");
    orgId = ctx.projectOrgId ?? null;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const userId = session?.user?.id ?? null;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "OCEL log";
  const ocelText = typeof body.ocelText === "string" ? body.ocelText : "";
  if (!ocelText.trim()) return NextResponse.json({ error: "No OCEL content provided." }, { status: 400 });
  const selectedTypes: string[] | undefined = Array.isArray(body.selectedTypes) ? body.selectedTypes.map(String) : undefined;
  const activityStateByType = (body.activityStateByType ?? undefined) as Record<string, Record<string, string>> | undefined;

  const plan = buildOcelStudy(ocelText, { selectedTypes, activityStateByType });
  if (plan.types.length === 0) {
    return NextResponse.json({ error: "No object type has a usable lifecycle to mine." }, { status: 400 });
  }

  const ocelGroupId = randomUUID();

  // 1) A discovered state-machine diagram per object type.
  const smIdByType: Record<string, string> = {};
  for (const t of plan.types) {
    const d = await prisma.diagram.create({
      data: {
        name: `${name} — ${t.objectType} states`, type: "state-machine",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: t.smData as any,
        userId: userId!, diagramOwnerId: userId, orgId, projectId: id,
      },
      select: { id: true },
    });
    smIdByType[t.objectType] = d.id;
  }

  // 2) The Domain Diagram — entities linked to their state machines.
  const domainData = buildDomainFromOcel(plan.oc, { linkedByType: smIdByType });
  const domain = await prisma.diagram.create({
    data: {
      name: `${name} — object model`, type: "domain",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: domainData as any,
      userId: userId!, diagramOwnerId: userId, orgId, projectId: id,
    },
    select: { id: true },
  });

  // 3) One ProcessMiningRun per object type, grouped + linked to the domain.
  const runs: { id: string; objectType: string; cases: number }[] = [];
  for (const t of plan.types) {
    const run = await prisma.processMiningRun.create({
      data: {
        name: `${name} — ${t.objectType}`, projectId: id, orgId, createdById: userId,
        discoveredSmId: smIdByType[t.objectType], ocelGroupId, objectType: t.objectType, domainDiagramId: domain.id,
      },
      select: { id: true },
    });
    await pgPool.query(
      'UPDATE "ProcessMiningRun" SET mapping = $1::jsonb, stats = $2::jsonb, variants = $3::jsonb, performance = $4::jsonb, governance = $5::jsonb, "updatedAt" = NOW() WHERE id = $6',
      [JSON.stringify(t.mapping), JSON.stringify(t.log.stats), JSON.stringify(t.log.variants), JSON.stringify(t.performance), JSON.stringify(t.governance), run.id],
    );
    runs.push({ id: run.id, objectType: t.objectType, cases: t.log.stats.cases });
  }

  return NextResponse.json({ ocelGroupId, domainDiagramId: domain.id, runs }, { status: 201 });
}
