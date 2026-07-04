/** Server-side load + serialize helpers for Risk & Control libraries, shared by
 *  the org + project route trees. Maps Prisma rows to client-safe DTOs. */
import { prisma } from "@/app/lib/db";
import type { RiskControlLibraryDTO } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function serializeLibrary(lib: any): RiskControlLibraryDTO {
  return {
    id: lib.id,
    name: lib.name,
    orgId: lib.orgId ?? null,
    projectId: lib.projectId ?? null,
    sourceLibraryId: lib.sourceLibraryId ?? null,
    items: (lib.items ?? []).map((it: any) => ({
      id: it.id, libraryId: it.libraryId, kind: it.kind, code: it.code, name: it.name,
      description: it.description ?? null, sortOrder: it.sortOrder,
      likelihood: it.likelihood ?? null, impact: it.impact ?? null, riskCategory: it.riskCategory ?? null,
      residualLikelihood: it.residualLikelihood ?? null, residualImpact: it.residualImpact ?? null,
      controlType: it.controlType ?? null, automation: it.automation ?? null, frequency: it.frequency ?? null,
      owner: it.owner ?? null, frameworkRef: it.frameworkRef ?? null,
      evidence: it.evidence ?? null, testMethod: it.testMethod ?? null, testFrequency: it.testFrequency ?? null,
    })),
    links: (lib.links ?? []).map((ln: any) => ({ id: ln.id, sourceId: ln.sourceId, targetId: ln.targetId })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const includeAll = {
  items: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
  links: true,
} as const;

/** Load a single library (by id) as a DTO, or null. */
export async function loadLibraryDTO(id: string): Promise<RiskControlLibraryDTO | null> {
  const lib = await prisma.riskControlLibrary.findUnique({ where: { id }, include: includeAll as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return lib ? serializeLibrary(lib) : null;
}

/** List the org's master libraries (with items/links) as DTOs. */
export async function loadOrgLibraries(orgId: string): Promise<RiskControlLibraryDTO[]> {
  const libs = await prisma.riskControlLibrary.findMany({ where: { orgId }, include: includeAll as any, orderBy: { createdAt: "asc" } }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return libs.map(serializeLibrary);
}

/** The project's own (single) library as a DTO, or null. */
export async function loadProjectLibrary(projectId: string): Promise<RiskControlLibraryDTO | null> {
  const lib = await prisma.riskControlLibrary.findFirst({ where: { projectId }, include: includeAll as any }); // eslint-disable-line @typescript-eslint/no-explicit-any
  return lib ? serializeLibrary(lib) : null;
}
