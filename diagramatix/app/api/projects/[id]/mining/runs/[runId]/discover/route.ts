/**
 * POST — discover the BPMN process implied by a run's event log: variants →
 * directly-follows graph → BPMN plan → laid-out DiagramData → a new `bpmn`
 * diagram in the project. Records the diagram id on the run. `edgeThreshold`
 * (0..1) trims rare paths.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { discoverProcess } from "@/app/lib/mining/discoverProcess";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import type { Variant } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function POST(req: Request, { params }: Params) {
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

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const edgeThreshold = typeof body.edgeThreshold === "number" ? Math.max(0, Math.min(1, body.edgeThreshold)) : 0;
  const variants = (run.variants ?? []) as unknown as Variant[];
  if (!Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json({ error: "This run has no variants to discover from." }, { status: 400 });
  }

  const { plan } = discoverProcess(variants, { edgeThreshold });
  const data = layoutBpmnDiagram(plan.elements, plan.connections, { promptLabel: run.name });

  const userId = session?.user?.id;
  const diagram = await prisma.diagram.create({
    data: {
      name: `${run.name} — discovered`,
      type: "bpmn",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: data as any,
      userId: userId!, diagramOwnerId: userId ?? null, orgId, projectId: id,
    },
    select: { id: true },
  });
  await prisma.processMiningRun.update({ where: { id: runId }, data: { discoveredBpmnId: diagram.id } });

  return NextResponse.json({ diagramId: diagram.id, elements: plan.elements.length, connections: plan.connections.length }, { status: 201 });
}
