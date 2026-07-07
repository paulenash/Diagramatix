import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildComplianceReport, type ComplianceRunInput, type ComplianceControlInput } from "@/app/lib/riskControls/compliance";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";
import type { GovernanceStats } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/orgs/[id]/compliance[?threshold=80]
 * Org-wide control operating-effectiveness OVER TIME, aggregated from every
 * process-mining run retained across the org's projects, rolled up by control
 * code (Σapplied/Σexpected). SuperAdmin OR Owner/Admin in this org. Read-only —
 * no persistence; the data already exists on the runs + the RCM catalog.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const thresholdRaw = Number(new URL(req.url).searchParams.get("threshold"));
  const threshold = Number.isFinite(thresholdRaw) && thresholdRaw > 0 && thresholdRaw <= 100 ? thresholdRaw : 80;

  // Every mining run across the org's projects (relational filter covers legacy
  // runs whose own orgId is null). Plus the org's whole control catalog (master +
  // project copies) — deduped by code, since codes are org-wide.
  const [runs, libraries] = await Promise.all([
    prisma.processMiningRun.findMany({
      where: { project: { orgId: id } },
      select: { id: true, name: true, projectId: true, createdAt: true, conformance: true, governance: true, project: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.riskControlLibrary.findMany({
      where: { OR: [{ orgId: id }, { project: { orgId: id } }] },
      select: { items: { where: { kind: "Control" }, select: { code: true, name: true, monitorSignature: true } } },
    }),
  ]);

  // Dedupe controls by code; prefer an entry that actually names a monitorSignature.
  const controlByCode = new Map<string, ComplianceControlInput>();
  for (const lib of libraries) {
    for (const it of lib.items) {
      const existing = controlByCode.get(it.code);
      if (!existing || (!existing.monitorSignature && it.monitorSignature)) {
        controlByCode.set(it.code, { code: it.code, name: it.name, monitorSignature: it.monitorSignature ?? null });
      }
    }
  }

  const runInputs: ComplianceRunInput[] = runs.map((r) => ({
    id: r.id,
    name: r.name,
    projectId: r.projectId ?? "",
    projectName: r.project?.name ?? "(project)",
    createdAt: r.createdAt.toISOString(),
    conformance: (r.conformance ?? null) as unknown as ConformanceResult | null,
    governance: (r.governance ?? null) as unknown as GovernanceStats | null,
  }));

  const report = buildComplianceReport(runInputs, [...controlByCode.values()], { threshold });
  return NextResponse.json(report);
}
