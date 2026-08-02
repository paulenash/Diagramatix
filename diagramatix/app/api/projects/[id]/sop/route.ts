/**
 * SOP documents for a project.
 *   GET  /api/projects/:id/sop           → list this project's SOPs (metadata)
 *   POST /api/projects/:id/sop           → generate a new SOP {diagramId, scope, scopeElementId?}
 *
 * POST is the deterministic-extract → AI-prose → store pipeline. Auth + quota +
 * telemetry mirror the staff-narrative route; SOP generation is a metered
 * `sop.generate` invocation point (shows in AI Usage).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import type { SopScope } from "@/app/lib/sop/skeleton";
import { runSopGenerate, runSopSuite } from "@/app/lib/sop/runGenerate";

const SCOPES: SopScope[] = ["whole", "lane", "pool", "subprocess", "group"];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await requireProjectAccess(session, await cookies(), projectId, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const docs = await prisma.sopDocument.findMany({
    where: { projectId },
    select: { id: true, diagramId: true, scope: true, scopeElementId: true, scopeLabel: true, title: true, status: true, generatedAt: true, updatedAt: true, diagram: { select: { name: true, updatedAt: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({
    documents: docs.map((d) => ({
      ...d,
      diagramName: d.diagram?.name ?? null,
      // Stale = the source diagram was changed after this SOP was last generated →
      // "SOP Regeneration required". generatedAt is (re)stamped on generate/regenerate.
      stale: !!(d.generatedAt && d.diagram && d.diagram.updatedAt > d.generatedAt),
      diagram: undefined,
    })),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let orgId: string;
  try {
    const access = await requireProjectAccess(session, await cookies(), projectId, "edit");
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

  const body = await req.json().catch(() => ({}));
  const diagramId = typeof body.diagramId === "string" ? body.diagramId : "";
  const scope: SopScope = SCOPES.includes(body.scope) ? body.scope : "whole";
  const scopeElementId = typeof body.scopeElementId === "string" ? body.scopeElementId : undefined;
  // Optional client-rasterised diagram PNG (data: URI) → embedded as a figure.
  const figure = typeof body.figure === "string" && body.figure.startsWith("data:image/") ? body.figure : null;
  if (!diagramId) return NextResponse.json({ error: "diagramId is required" }, { status: 400 });

  const diagram = await prisma.diagram.findUnique({
    where: { id: diagramId },
    select: { id: true, name: true, projectId: true, data: true },
  });
  if (!diagram || diagram.projectId !== projectId) {
    return NextResponse.json({ error: "Diagram not found in this project" }, { status: 404 });
  }

  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Deterministic extract → AI prose (shared core). A "group" scope generates a
  // suite across the diagram's forward-link closure; everything else is one scope.
  const gen = scope === "group"
    ? await runSopSuite({ projectId, orgId, rootDiagramId: diagramId, apiKey })
    : await runSopGenerate({ projectId, orgId, diagramId, scope, scopeElementId, apiKey });
  if (!gen.ok) return NextResponse.json({ error: gen.error }, { status: gen.status });
  await recordUsage(session.user.id, "aiAttempts");

  const created = await prisma.sopDocument.create({
    data: {
      projectId, diagramId,
      scope, scopeElementId: scopeElementId ?? null, scopeLabel: gen.scopeLabel,
      title: gen.title,
      status: "draft",
      templateId: gen.templateId,
      model: gen.model,
      generatedAt: new Date(),
      createdById: session.user.id,
      sections: {
        create: [
          ...gen.sections.map((s, i) => ({ heading: s.heading, bodyMarkdown: s.body, sortOrder: i })),
          ...(figure ? [{ heading: "Process Diagram", bodyMarkdown: "", image: figure, sortOrder: gen.sections.length }] : []),
        ],
      },
    },
    select: { id: true },
  });

  // Whole-diagram SOP → point the diagram's Procedure Doc at it (JSON key +
  // denorm columns the Portal reads). jsonb_set is surgical so it won't clobber
  // a concurrent editor save of other keys.
  if (scope === "whole") {
    const url = `/dashboard/projects/${projectId}/sop/${created.id}`;
    try {
      await pgPool.query(
        `UPDATE "Diagram" SET data = jsonb_set(data, '{procedureDoc}', $1::jsonb) WHERE id = $2`,
        [JSON.stringify({ url, name: gen.title }), diagramId],
      );
      await prisma.diagram.update({ where: { id: diagramId }, data: { procedureDocUrl: url, procedureDocName: gen.title } });
    } catch { /* best-effort link */ }
  }

  return NextResponse.json({ id: created.id });
}
