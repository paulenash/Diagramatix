import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { prisma, pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { planBpmn } from "@/app/lib/ai/planBpmn";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { groundRulesWithPcf } from "@/app/lib/pcf/promptGrounding";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import {
  findConnectorConformance,
  summariseConformance,
} from "@/app/lib/diagram/checks/connectorConformance";
import { pickBestModel } from "@/app/lib/ai/pickBestModel";
import { allModels, resolvedEnvSecret } from "@/app/lib/ai/models";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";

/**
 * SuperAdmin "Full model comparison" for a BPMN AI prompt.
 *
 * Generates the diagram with each model, lays it out, runs the conformance net,
 * and saves a diagram per model named `<current name> · <model>`. The CURRENT
 * diagram is filled with the BEST result — the fewest connector-conformance issues
 * among the reasonably-complete diagrams (see pickBestModel), not a fixed model —
 * so the comparison actually picks a winner. Ties prefer the richer diagram, then
 * the MODELS order below (strongest first). The comparison matrix is persisted on
 * the current diagram's `aiComparison` column so the "AI Comparison Results"
 * button can show it. SuperAdmin-only; makes real model calls.
 */
type ModelResult = {
  model: string;
  label: string;
  ok: boolean;
  ms: number;
  elements?: number;
  connections?: number;
  issues?: number;
  summary?: Record<string, number>;
  diagramId?: string;
  error?: string;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;
  if (!isSuperuser(session)) return NextResponse.json({ error: "AI model comparison is SuperAdmin-only" }, { status: 403 });

  // Compare spans every configured provider (Claude + Kimi when a Moonshot key is
  // set). Pass as long as AT LEAST ONE provider key exists; per-model keys are
  // resolved in the loop, and a model whose provider key is missing is skipped.
  const anyKey = !!resolvedEnvSecret(process.env.ANTHROPIC_API_KEY) || !!resolvedEnvSecret(process.env.MOONSHOT_API_KEY);
  if (!anyKey) return NextResponse.json({ error: "No AI provider configured. Set ANTHROPIC_API_KEY and/or MOONSHOT_API_KEY." }, { status: 503 });
  // Accept every input the two-phase "Plan" flow accepts, so Compare is a
  // complete alternative: a text prompt AND/OR an attachment (PDF / text / image),
  // with image geometry-capture for the "reproduce original layout" mode.
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    diagramId?: string;
    models?: string[];
    attachment?: import("@/app/lib/ai/planBpmn").Attachment;
    captureGeometry?: boolean;
    imageAspect?: { w: number; h: number };
    pcfNodeId?: string;
    layoutMode?: string;
  };
  const { prompt, diagramId, attachment, captureGeometry, imageAspect } = body;
  // EXPERIMENTAL connector scheme — this route is already SuperAdmin-only.
  const mode = body.layoutMode === "test" ? "test" as const : "normal" as const;
  // Need a diagram to fill, plus SOME input (a prompt or an attachment).
  if (!diagramId || (!prompt?.trim() && !attachment)) {
    return NextResponse.json({ error: "diagramId and at least a prompt or an attachment are required" }, { status: 400 });
  }

  // The models compared — the caller-selected subset (validated against the picker
  // list); an empty/absent selection falls back to every model (Claude + Kimi + custom).
  const requested = Array.isArray(body.models) ? body.models.filter((x): x is string => typeof x === "string") : [];
  const MODELS = requested.length ? allModels().filter((m) => requested.includes(m.id)) : allModels();
  if (MODELS.length === 0) {
    return NextResponse.json({ error: "Select at least one valid model to compare" }, { status: 400 });
  }
  // planBpmn always needs prompt text — synthesise one when only a file is given.
  const effPrompt = prompt?.trim()
    || (attachment?.type === "image"
        ? `Reverse-engineer the BPMN diagram from the attached image (${attachment.name ?? "diagram"}).`
        : `Create a BPMN diagram from the attached file${attachment?.name ? ` (${attachment.name})` : ""}.`);
  const aspect = imageAspect && imageAspect.w > 0 && imageAspect.h > 0 ? imageAspect : undefined;
  const wantGeometry = captureGeometry === true && attachment?.type === "image";

  const current = await prisma.diagram.findUnique({
    where: { id: diagramId },
    select: { id: true, name: true, userId: true, orgId: true, projectId: true, data: true },
  });
  if (!current) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  // Same green-rule loading as the generate-bpmn route, so each model gets the
  // same brief as production.
  let rules = "";
  try {
    for (const category of ["general", "bpmn"]) {
      const dr = await prisma.diagramRules.findFirst({ where: { category, isDefault: true }, select: { rules: true } });
      if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
    }
  } catch { /* proceed without rules */ }
  const { aiRules } = splitRulesByEnforcement(rules);
  // Ground on the caller-supplied PCF node, else the diagram's own classification.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcfNodeId = body.pcfNodeId ?? ((current.data as any)?.pcf?.nodeId as string | undefined);
  const grounded = await groundRulesWithPcf(prisma, aiRules, pcfNodeId);

  const results: ModelResult[] = [];
  // Keep each model's laid-out diagram so we can fill with whichever wins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataByModel = new Map<string, any>();

  for (const m of MODELS) {
    // Each model uses its own provider's key; skip any whose key isn't configured.
    const key = aiApiKey(m.id);
    if (!key) { results.push({ model: m.id, label: m.label, ok: false, ms: 0, error: "No API key configured for this model's provider" }); continue; }
    const t0 = Date.now();
    try {
      const res = await planBpmn({ apiKey: key, prompt: effPrompt, attachment, rules: grounded, model: m.id, captureGeometry: wantGeometry });
      const ms = Date.now() - t0;
      if (!res.ok) { results.push({ model: m.id, label: m.label, ok: false, ms, error: res.error }); continue; }
      // Reproduce the imported image's layout when geometry was captured and the
      // model returned per-shape bounds; otherwise the normal auto-stack layout.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preserve = wantGeometry && res.plan.elements.some((e: any) => e.bounds);
      const data = layoutBpmnDiagram(res.plan.elements, res.plan.connections,
        { preservePositions: preserve, imageAspect: aspect, mode });
      const issues = findConnectorConformance(data);
      const flag = issues.length ? ` (!${issues.length})` : "";
      const saved = await prisma.diagram.create({
        data: {
          name: `${current.name} · ${m.label}${flag}`,
          type: "bpmn",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: data as any,
          userId: current.userId,
          orgId: current.orgId,
          ...(current.projectId ? { projectId: current.projectId } : {}),
        },
        select: { id: true },
      });
      results.push({
        model: m.id, label: m.label, ok: true, ms,
        elements: res.plan.elements.length, connections: res.plan.connections.length,
        issues: issues.length, summary: summariseConformance(issues), diagramId: saved.id,
      });
      dataByModel.set(m.id, data);
    } catch (e) {
      results.push({ model: m.id, label: m.label, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // The winner fills the current diagram (null if every model errored).
  const best = pickBestModel(results, MODELS.map((m) => m.id));
  const chosenData = best ? dataByModel.get(best.model) ?? null : null;

  // ENT-14: the raw prompt is customer content — don't persist it by default.
  // Store only its length; opt in to keeping the text with AI_COMPARE_STORE_PROMPT=1.
  const storePrompt = process.env.AI_COMPARE_STORE_PROMPT === "1";
  const comparison = {
    generatedAt: new Date().toISOString(),
    ...(storePrompt ? { prompt: effPrompt } : {}),
    promptChars: effPrompt.length,
    attachment: attachment ? { name: attachment.name ?? null, type: attachment.type } : null,
    chosenModel: best?.label ?? null,
    chosenModelId: best?.model ?? null,
    models: results,
  };

  // Fill the current diagram with the best output (if any model generated), and
  // persist the comparison matrix on the diagram either way.
  const filledData = chosenData ?? (current.data ?? {});
  await prisma.diagram.update({
    where: { id: diagramId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(chosenData ? { data: filledData as any } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      aiComparison: comparison as any,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return NextResponse.json({ comparison, filled: !!chosenData, diagramData: (chosenData as any) ?? undefined });
}

/**
 * DELETE — clear the stored AI comparison matrix on a diagram (resets the
 * `aiComparison` column to {}), so the "AI Comparison Results" button goes away.
 * SuperAdmin-only, same as generating it. Raw SQL (Prisma 7 omits JSON fields from
 * model update inputs). The per-model diagrams saved earlier are separate diagrams
 * the user deletes on their own; this only removes the comparison record.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  const diagramId = new URL(req.url).searchParams.get("diagramId");
  if (!diagramId) return NextResponse.json({ error: "diagramId is required" }, { status: 400 });
  await pgPool.query('UPDATE "Diagram" SET "aiComparison" = $1::jsonb WHERE id = $2', ["{}", diagramId]);
  return NextResponse.json({ ok: true });
}
