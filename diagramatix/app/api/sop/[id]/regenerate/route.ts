/**
 * POST /api/sop/:id/regenerate
 * Re-run the deterministic extract + AI prose for the SOP's stored diagram +
 * scope, replacing its sections IN PLACE (same id, so its Procedure-Doc link
 * survives). The existing embedded figure is preserved (the editor can't
 * recapture the canvas). Metered as a `sop.generate` AI attempt.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import type { SopScope } from "@/app/lib/sop/skeleton";
import { runSopGenerate, runSopSuite } from "@/app/lib/sop/runGenerate";
import { mergeSopSections, type MergedSopSection } from "@/app/lib/sop/mergeSections";
import { sopBodyHash } from "@/app/lib/sop/sopHash";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.sopDocument.findUnique({ where: { id }, select: { projectId: true, diagramId: true, scope: true, scopeElementId: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let orgId: string;
  try {
    const access = await requireProjectAccess(session, await cookies(), doc.projectId, "edit");
    orgId = access.projectOrgId;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.GenerateSop));
  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI not configured for the selected model." }, { status: 503 });
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  const scope = doc.scope as SopScope;
  const gen = scope === "group"
    ? await runSopSuite({ projectId: doc.projectId, orgId, rootDiagramId: doc.diagramId, apiKey })
    : await runSopGenerate({ projectId: doc.projectId, orgId, diagramId: doc.diagramId, scope, scopeElementId: doc.scopeElementId ?? undefined, apiKey });
  if (!gen.ok) return NextResponse.json({ error: gen.error }, { status: gen.status });
  await recordUsage(session.user.id, "aiAttempts");

  // Non-destructive regenerate: merge the fresh AI sections into the current ones
  // by section identity so author edits + added sections + locked sections survive.
  const existing = await prisma.sopSection.findMany({
    where: { sopDocumentId: id },
    select: { heading: true, bodyMarkdown: true, image: true, imageCaption: true, key: true, aiBodyHash: true, locked: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  });

  let mergedSections: MergedSopSection[];
  let summary: { refreshed: number; kept: number; added: number; dropped: number };
  if (scope === "group") {
    // A suite repeats template keys across diagrams → key-merge is unsafe. Replace,
    // but carry over LOCKED sections + the figure; one-level Undo covers the rest.
    const fresh: MergedSopSection[] = gen.sections.map((s) => ({ heading: s.heading, bodyMarkdown: s.body, image: null, imageCaption: null, key: s.key ?? null, aiBodyHash: sopBodyHash(s.body), locked: false }));
    const lockedKept = existing.filter((e) => e.locked && !e.image);
    const images = existing.filter((e) => e.image);
    mergedSections = [...fresh, ...lockedKept, ...images];
    summary = { refreshed: fresh.length, kept: lockedKept.length + images.length, added: 0, dropped: 0 };
  } else {
    const merged = mergeSopSections(existing, gen.sections.map((s) => ({ heading: s.heading, body: s.body, key: s.key ?? null })), sopBodyHash);
    mergedSections = merged.sections;
    summary = merged.summary;
  }

  const prevSectionsJson = JSON.stringify(existing);

  await prisma.$transaction(async (tx) => {
    await tx.sopSection.deleteMany({ where: { sopDocumentId: id } });
    await tx.sopSection.createMany({
      data: mergedSections.map((s, i) => ({
        sopDocumentId: id, heading: s.heading, bodyMarkdown: s.bodyMarkdown,
        image: s.image, imageCaption: s.imageCaption, key: s.key, aiBodyHash: s.aiBodyHash, locked: s.locked, sortOrder: i,
      })),
    });
    await tx.sopDocument.update({ where: { id }, data: { title: gen.title, model: gen.model, templateId: gen.templateId, scopeLabel: gen.scopeLabel, generatedAt: new Date(), prevSectionsJson } });
  });
  return NextResponse.json({ ok: true, summary });
}
