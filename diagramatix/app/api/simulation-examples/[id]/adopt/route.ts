/**
 * Adopt a published example simulation into a fresh project owned by the
 * caller — the one-click "load a ready-made simulation to demo" path.
 *
 * Recreates the whole bundle: the annotated diagrams (element/connector ids
 * preserved, so sim params + interventions keyed by those ids stay valid), the
 * team library, the study + its roots (remapped package-key → new diagram id),
 * and the scenarios (run config + overrides + planned interventions copied
 * verbatim — team references are by name, which we preserve). Returns the new
 * project id + the diagram to open so the caller can jump straight in.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { validateExamplePackage, type ExamplePackage } from "@/app/lib/simulation/examplePackage";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* not impersonating */ }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;
  const example = await prisma.simulationExample.findFirst({ where: { id, published: true } });
  if (!example) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const pkg = (example.package ?? {}) as unknown as ExamplePackage;
  const errs = validateExamplePackage(pkg);
  if (errs.length) return NextResponse.json({ error: `Example package invalid: ${errs.join("; ")}` }, { status: 500 });

  const userId = session.user.id;
  const ownerName = session.user.name ?? session.user.email ?? "";

  // One transaction so a partial failure never leaves a half-built project.
  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: `${example.title} (example)`, userId, orgId, ownerName },
    });

    // Diagrams — preserve `data` (incl. internal element/connector ids). Pre-assign
    // the ids so a subprocess's `linkedDiagramId` (which references a diagram KEY
    // in the package) can be rewritten to the new id before creating — otherwise
    // the linked child can't be resolved (drill-down + simulation break).
    const keyToDiagramId = new Map<string, string>();
    for (const d of pkg.diagrams) keyToDiagramId.set(d.key, crypto.randomUUID());
    for (const d of pkg.diagrams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(JSON.stringify(d.data)) as any; // clone so the package isn't mutated
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const el of (data.elements ?? []) as any[]) {
        const linked = el.properties?.linkedDiagramId as string | undefined;
        if (linked && keyToDiagramId.has(linked)) el.properties.linkedDiagramId = keyToDiagramId.get(linked);
      }
      await tx.diagram.create({
        data: {
          id: keyToDiagramId.get(d.key)!,
          name: d.name,
          type: d.type || "bpmn",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: data as any,
          userId, diagramOwnerId: userId, orgId, projectId: project.id,
        },
      });
    }

    // Team library.
    for (const t of pkg.teams) {
      await tx.simulationTeam.create({
        data: {
          name: t.name, projectId: project.id,
          capacity: Math.max(1, Math.round(t.capacity ?? 1)),
          costPerHour: t.costPerHour ?? null,
          efficiency: t.efficiency && t.efficiency > 0 ? t.efficiency : 1,
        },
      });
    }

    // Study + roots (remap package keys → new diagram ids).
    const study = await tx.simulationStudy.create({ data: { name: pkg.study.name, projectId: project.id, createdById: userId } });
    for (const rk of pkg.study.rootKeys) {
      const diagramId = keyToDiagramId.get(rk);
      if (diagramId) await tx.simulationStudyRoot.create({ data: { studyId: study.id, diagramId } });
    }

    // Scenarios — config + overrides + interventions copied verbatim. Process
    // variants (As-is vs To-be) remap their package keys → the new diagram ids.
    for (const sc of pkg.scenarios) {
      const variantRootIds = (sc.variantRootKeys ?? [])
        .map((k) => keyToDiagramId.get(k))
        .filter((x): x is string => !!x);
      await tx.simulationScenario.create({
        data: {
          name: sc.name, studyId: study.id, isBaseline: !!sc.isBaseline,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          runConfig: (sc.runConfig ?? {}) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          overrides: (sc.overrides ?? {}) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(variantRootIds.length ? { variantRootIds: variantRootIds as any } : {}),
        },
      });
    }

    const openDiagramId = pkg.study.rootKeys.map((k) => keyToDiagramId.get(k)).find(Boolean)
      ?? keyToDiagramId.values().next().value ?? null;
    return { projectId: project.id, openDiagramId };
  });

  return NextResponse.json(result, { status: 201 });
}
