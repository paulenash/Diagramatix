import "dotenv/config";
import { writeFileSync } from "node:fs";
import { prisma } from "../app/lib/db";
import { planBpmn } from "../app/lib/ai/planBpmn";
import { splitRulesByEnforcement } from "../app/lib/ai/splitRules";
import { layoutBpmnDiagram } from "../app/lib/diagram/bpmnLayout";
import { findConnectorConformance, summariseConformance } from "../app/lib/diagram/checks/connectorConformance";
import type { DiagramData } from "../app/lib/diagram/types";
import { BPMN_PROMPTS } from "./ai-conformance/AI_TEST_HARNESS_PROMPTS";

/**
 * Model-dimension experiment (npm run ai:compare): run a SUBSET of the harness
 * prompts (diagrams 18-20) across several Claude models and compare conformance
 * — does a stronger model produce cleaner wiring than Sonnet on the same prompt?
 * Every generated diagram is saved (project "AI Model Comparison (18-20)") so all
 * model outputs can be inspected side by side. Manual / real model calls.
 */
const MODELS = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6" },
  { id: "claude-opus-4-8", label: "Opus 4.8" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5" },
];
const PROJECT = "AI Model Comparison (18-20)";
const SUBSET = BPMN_PROMPTS.slice(17, 20); // prompts #18, #19, #20

async function loadGreenRules(): Promise<string> {
  let rules = "";
  for (const category of ["general", "bpmn"]) {
    const dr = await prisma.diagramRules.findFirst({ where: { category, isDefault: true }, select: { rules: true } });
    if (dr?.rules) rules += (rules ? "\n\n" : "") + dr.rules;
  }
  return splitRulesByEnforcement(rules).aiRules;
}

function withPromptNote(data: DiagramData, text: string): DiagramData {
  const els = data.elements ?? [];
  const minX = els.length ? Math.min(...els.map((e) => e.x)) : 0;
  const minY = els.length ? Math.min(...els.map((e) => e.y)) : 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const note: any = { id: "__ai_prompt_note", type: "text-annotation", x: minX, y: minY - 200, width: 920, height: 170, label: text, properties: {} };
  return { ...data, elements: [note, ...els] };
}

type Cell = { name: string; model: string; ok: boolean; ms: number; issues?: number; summary?: Record<string, number>; elements?: number; error?: string };

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("Set ANTHROPIC_API_KEY to run the model comparison (real model calls)."); process.exit(2); }
  const aiRules = await loadGreenRules().catch(() => "");

  const owner =
    (await prisma.user.findFirst({ where: { email: "paul@nashcc.com.au" }, select: { id: true, name: true } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }));
  if (!owner) { console.error("no owner user"); process.exit(1); }
  const orgId = (await prisma.orgMember.findFirst({ where: { userId: owner.id }, select: { orgId: true }, orderBy: { createdAt: "asc" } }))?.orgId;
  if (!orgId) { console.error("owner has no org"); process.exit(1); }
  let project = await prisma.project.findFirst({ where: { userId: owner.id, name: PROJECT }, select: { id: true } });
  if (!project) project = await prisma.project.create({ data: { name: PROJECT, description: "npm run ai:compare — diagrams 18-20 across models. Recreated each run.", userId: owner.id, orgId, ownerName: owner.name ?? "" }, select: { id: true } });
  await prisma.diagram.deleteMany({ where: { projectId: project.id } });

  console.log(`[ai:compare] ${SUBSET.length} prompts × ${MODELS.length} models · green rules ${aiRules.length} chars`);
  const cells: Cell[] = [];
  let n = 0;
  for (let pi = 0; pi < SUBSET.length; pi++) {
    const { name, prompt } = SUBSET[pi];
    for (const m of MODELS) {
      const t0 = Date.now();
      try {
        const res = await planBpmn({ apiKey, prompt, rules: aiRules, model: m.id });
        const ms = Date.now() - t0;
        if (!res.ok) { cells.push({ name, model: m.label, ok: false, ms, error: res.error }); console.log(`[ai:compare] ${name} · ${m.label}: FAILED — ${res.error}`); continue; }
        const data = layoutBpmnDiagram(res.plan.elements, res.plan.connections);
        const issues = findConnectorConformance(data);
        const flag = issues.length ? ` (!${issues.length})` : "";
        await prisma.diagram.create({ data: {
          name: `${18 + pi} ${name} · ${m.label}${flag}`, type: "bpmn",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: withPromptNote(data, `[${m.label}] ${prompt}`) as any,
          userId: owner.id, orgId, projectId: project.id,
        } });
        cells.push({ name, model: m.label, ok: true, ms, issues: issues.length, summary: summariseConformance(issues), elements: res.plan.elements.length });
        console.log(`[ai:compare] ${name} · ${m.label}: ${issues.length} issue(s) · ${res.plan.elements.length} el · ${ms}ms`);
      } catch (e) {
        cells.push({ name, model: m.label, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
        console.log(`[ai:compare] ${name} · ${m.label}: ERROR — ${e}`);
      }
      n++;
    }
  }

  // Report: prompts as rows, models as columns.
  const L: string[] = [`# AI model comparison — diagrams 18-20`, ``, `_Same prompt + same green rules, one generation per model. Cell = conformance issues._`, ``];
  L.push(`| Prompt | ${MODELS.map((m) => m.label).join(" | ")} |`, `|---|${MODELS.map(() => "---").join("|")}|`);
  for (const { name } of SUBSET) {
    const row = MODELS.map((m) => {
      const c = cells.find((x) => x.name === name && x.model === m.label);
      if (!c) return "—";
      if (!c.ok) return `❌`;
      return c.issues === 0 ? `✅ 0 (${(c.ms / 1000) | 0}s)` : `⚠️ ${c.issues} (${(c.ms / 1000) | 0}s)`;
    });
    L.push(`| ${name} | ${row.join(" | ")} |`);
  }
  writeFileSync("ai-model-compare.md", L.join("\n") + "\n");
  console.log(`[ai:compare] saved ${n} diagram(s) to project "${PROJECT}" · wrote ai-model-compare.md`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
