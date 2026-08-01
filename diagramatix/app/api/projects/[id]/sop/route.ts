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
import type { DiagramData } from "@/app/lib/diagram/types";
import { extractSkeleton } from "@/app/lib/sop/extractSkeleton";
import type { SopScope } from "@/app/lib/sop/skeleton";
import { resolveSopTemplate } from "@/app/lib/sop/resolveTemplate";
import { generateSop, buildSopBriefing } from "@/app/lib/ai/generateSop";

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
    select: { id: true, diagramId: true, scope: true, scopeLabel: true, title: true, status: true, generatedAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ documents: docs });
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

  // Resolve the extraction target. A subprocess linked to a child diagram
  // scopes to that child (whole); an inline-expanded subprocess scopes in place.
  let data = diagram.data as unknown as DiagramData;
  let effScope = scope;
  let effScopeId = scopeElementId;
  let effDiagramName = diagram.name;
  if (scope === "subprocess" && scopeElementId) {
    const el = (data.elements ?? []).find((e) => e.id === scopeElementId);
    const linked = el?.properties?.linkedDiagramId as string | undefined;
    if (linked) {
      const child = await prisma.diagram.findUnique({ where: { id: linked }, select: { name: true, data: true, projectId: true } });
      if (child && child.projectId === projectId) {
        data = child.data as unknown as DiagramData;
        effScope = "whole"; effScopeId = undefined; effDiagramName = child.name;
      }
    }
  }

  const skeleton = extractSkeleton(data, { scope: effScope, scopeElementId: effScopeId, diagramId, diagramName: effDiagramName });
  const resolved = await resolveSopTemplate({ projectId, orgId, scope: effScope });
  let additions: string | null = null;
  try {
    const dr = await prisma.diagramRules.findFirst({ where: { category: "sop", isDefault: true }, select: { rules: true } });
    additions = dr?.rules ?? null;
  } catch { /* proceed without additions */ }
  const briefing = buildSopBriefing(additions, resolved.spec);

  const result = await generateSop({ apiKey, skeleton, briefing });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  await recordUsage(session.user.id, "aiAttempts");

  const created = await prisma.sopDocument.create({
    data: {
      projectId, diagramId,
      scope, scopeElementId: scopeElementId ?? null, scopeLabel: skeleton.meta.scopeLabel ?? null,
      title: skeleton.meta.title,
      status: "draft",
      templateId: resolved.templateId,
      model: result.model,
      generatedAt: new Date(),
      createdById: session.user.id,
      sections: {
        create: [
          ...result.sections.map((s, i) => ({ heading: s.heading, bodyMarkdown: s.body, sortOrder: i })),
          ...(figure ? [{ heading: "Process Diagram", bodyMarkdown: "", image: figure, sortOrder: result.sections.length }] : []),
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
        [JSON.stringify({ url, name: skeleton.meta.title }), diagramId],
      );
      await prisma.diagram.update({ where: { id: diagramId }, data: { procedureDocUrl: url, procedureDocName: skeleton.meta.title } });
    } catch { /* best-effort link */ }
  }

  return NextResponse.json({ id: created.id });
}
