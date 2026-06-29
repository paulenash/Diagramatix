import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { planBpmn } from "@/app/lib/ai/planBpmn";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import {
  findConnectorConformance,
  summariseConformance,
} from "@/app/lib/diagram/checks/connectorConformance";

/**
 * SuperAdmin "Full model comparison" for a BPMN AI prompt.
 *
 * Generates the diagram with each model, lays it out, runs the conformance net,
 * and saves a diagram per model named `<current name> · <model>`. The CURRENT
 * diagram is filled with the OPUS 4.8 output (the strongest model we can reach —
 * Fable 5 is access-gated; no "best" scoring). The comparison matrix is persisted
 * on the current diagram's `aiComparison` column so the "AI Comparison Results"
 * button can show it. SuperAdmin-only; makes real model calls.
 */
const MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];
const CHOSEN_ID = "claude-opus-4-8"; // fills the current diagram

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

  const results: ModelResult[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let chosenData: any = null;

  for (const m of MODELS) {
    const t0 = Date.now();
    try {
      const res = await planBpmn({ apiKey, prompt, rules: aiRules, model: m.id });
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
      if (m.id === CHOSEN_ID) chosenData = data;
    } catch (e) {
      results.push({ model: m.id, label: m.label, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const comparison = {
    generatedAt: new Date().toISOString(),
    prompt,
    chosenModel: MODELS.find((m) => m.id === CHOSEN_ID)?.label ?? CHOSEN_ID,
    chosenModelId: CHOSEN_ID,
    models: results,
  };

  // Fill the current diagram with the Opus 4.8 output (if it generated), and
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

  return NextResponse.json({ comparison, filled: !!chosenData });
}
