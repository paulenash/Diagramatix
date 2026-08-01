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

  // Preserve the previously-embedded figure.
  const figure = await prisma.sopSection.findFirst({ where: { sopDocumentId: id, image: { not: null } }, select: { image: true, imageCaption: true }, orderBy: { sortOrder: "asc" } });

  await prisma.$transaction(async (tx) => {
    await tx.sopSection.deleteMany({ where: { sopDocumentId: id } });
    await tx.sopSection.createMany({
      data: [
        ...gen.sections.map((s, i) => ({ sopDocumentId: id, heading: s.heading, bodyMarkdown: s.body, sortOrder: i })),
        ...(figure?.image ? [{ sopDocumentId: id, heading: "Process Diagram", bodyMarkdown: "", image: figure.image, imageCaption: figure.imageCaption ?? null, sortOrder: gen.sections.length }] : []),
      ],
    });
    await tx.sopDocument.update({ where: { id }, data: { title: gen.title, model: gen.model, templateId: gen.templateId, scopeLabel: gen.scopeLabel, generatedAt: new Date() } });
  });
  return NextResponse.json({ ok: true });
}
