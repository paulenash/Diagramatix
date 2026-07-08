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
  const [runs, libraries, pcfProjects] = await Promise.all([
    prisma.processMiningRun.findMany({
      where: { project: { orgId: id } },
      select: { id: true, name: true, projectId: true, createdAt: true, conformance: true, governance: true, excludeFromCompliance: true, project: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.riskControlLibrary.findMany({
      where: { OR: [{ orgId: id }, { project: { orgId: id } }] },
      select: { items: { where: { kind: "Control" }, select: { code: true, name: true, monitorSignature: true } } },
    }),
    prisma.project.findMany({ where: { orgId: id }, select: { id: true, pcf: true } }),
  ]);

  // L4b: attribute each project to an APQC category via its linked framework
  // root (Project.pcf). The category code is the root code's first segment + ".0"
  // (e.g. "1.1.1" → "1.0"); names come from the frameworks' level-1 nodes.
  const projPcf = new Map<string, { frameworkId: string; categoryCode: string }>();
  const fwCatKeys = new Set<string>();
  for (const p of pcfProjects) {
    const v = (p.pcf ?? {}) as { frameworkId?: string; rootHierarchyId?: string };
    if (!v.frameworkId || !v.rootHierarchyId) continue;
    const categoryCode = `${v.rootHierarchyId.split(".")[0]}.0`;
    projPcf.set(p.id, { frameworkId: v.frameworkId, categoryCode });
    fwCatKeys.add(`${v.frameworkId}|${categoryCode}`);
  }
  const categoryName = new Map<string, string>();
  if (projPcf.size > 0) {
    const catNodes = await prisma.pcfNode.findMany({
      where: { level: 1, frameworkId: { in: [...new Set([...projPcf.values()].map((v) => v.frameworkId))] } },
      select: { frameworkId: true, hierarchyId: true, name: true },
    });
    for (const n of catNodes) categoryName.set(`${n.frameworkId}|${n.hierarchyId}`, n.name);
  }
  const pcfCategoryFor = (projectId: string | null): { code: string; name: string } | null => {
    if (!projectId) return null;
    const v = projPcf.get(projectId);
    if (!v) return null;
    return { code: v.categoryCode, name: categoryName.get(`${v.frameworkId}|${v.categoryCode}`) ?? v.categoryCode };
  };

  // The full run catalog (for the console's include/exclude panel) — every run,
  // flagged. Only NON-excluded runs feed the aggregation below.
  const runsCatalog = runs.map((r) => ({
    id: r.id, name: r.name, projectId: r.projectId ?? "", projectName: r.project?.name ?? "(project)",
    createdAt: r.createdAt.toISOString(), excluded: r.excludeFromCompliance,
  }));
  const includedRuns = runs.filter((r) => !r.excludeFromCompliance);

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

  const runInputs: ComplianceRunInput[] = includedRuns.map((r) => ({
    id: r.id,
    name: r.name,
    projectId: r.projectId ?? "",
    projectName: r.project?.name ?? "(project)",
    createdAt: r.createdAt.toISOString(),
    conformance: (r.conformance ?? null) as unknown as ConformanceResult | null,
    governance: (r.governance ?? null) as unknown as GovernanceStats | null,
    pcfCategory: pcfCategoryFor(r.projectId ?? null),
  }));

  const report = buildComplianceReport(runInputs, [...controlByCode.values()], { threshold });
  return NextResponse.json({ ...report, runsCatalog });
}
