import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
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
import { AI_MODELS } from "@/app/lib/ai/models";

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
// The models compared — the shared AI_MODELS list (also drives the AI-Generate
// default picker), so adding/renaming a model updates both surfaces at once.
const MODELS = AI_MODELS;

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
  if (!isSuperuser(session)) return NextResponse.json({ error: "AI model comparison is SuperAdmin-only" }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI service not configured. Set ANTHROPIC_API_KEY in .env" }, { status: 503 });

  const { prompt, diagramId } = (await req.json().catch(() => ({}))) as { prompt?: string; diagramId?: string };
  if (!prompt?.trim() || !diagramId) return NextResponse.json({ error: "prompt and diagramId are required" }, { status: 400 });

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
  // Ground on the diagram's own APQC PCF classification, if any.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pcfNodeId = (current.data as any)?.pcf?.nodeId as string | undefined;
  const grounded = await groundRulesWithPcf(prisma, aiRules, pcfNodeId);

  const results: ModelResult[] = [];
  // Keep each model's laid-out diagram so we can fill with whichever wins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dataByModel = new Map<string, any>();

  for (const m of MODELS) {
    const t0 = Date.now();
    try {
      const res = await planBpmn({ apiKey, prompt, rules: grounded, model: m.id });
      const ms = Date.now() - t0;
      if (!res.ok) { results.push({ model: m.id, label: m.label, ok: false, ms, error: res.error }); continue; }
      const data = layoutBpmnDiagram(res.plan.elements, res.plan.connections);
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

  const comparison = {
    generatedAt: new Date().toISOString(),
    prompt,
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
