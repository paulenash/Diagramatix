/**
 * Server-side SOP generation core, shared by the create route, the regenerate
 * route, and the group/suite path. Deterministic extract → resolve template →
 * AI prose. The route owns AI auth/quota/telemetry; this owns extract + prose.
 */
import { prisma } from "@/app/lib/db";
import type { DiagramData } from "../diagram/types";
import { extractSkeleton } from "./extractSkeleton";
import type { SopScope } from "./skeleton";
import { resolveSopTemplate } from "./resolveTemplate";
import { generateSop, buildSopBriefing } from "../ai/generateSop";
import { walkForwardClosure } from "../diagram/linkClosure";

export interface SopSectionOut { heading: string; body: string }
export type RunResult =
  | { ok: true; sections: SopSectionOut[]; model: string; templateId: string | null; title: string; scopeLabel: string | null }
  | { ok: false; status: number; error: string };

/** Max diagrams a single suite will generate prose for (bounds cost/time). */
export const SOP_SUITE_CAP = 12;

async function loadSopBriefing(projectId: string, orgId: string, scope: SopScope) {
  const resolved = await resolveSopTemplate({ projectId, orgId, scope });
  let additions: string | null = null;
  try {
    const dr = await prisma.diagramRules.findFirst({ where: { category: "sop", isDefault: true }, select: { rules: true } });
    additions = dr?.rules ?? null;
  } catch { /* proceed without additions */ }
  return { resolved, briefing: buildSopBriefing(additions, resolved.spec) };
}

/** Generate one SOP for a single scope (whole/lane/pool/subprocess). */
export async function runSopGenerate(opts: {
  projectId: string; orgId: string; diagramId: string; scope: SopScope; scopeElementId?: string; apiKey: string;
}): Promise<RunResult> {
  const diagram = await prisma.diagram.findUnique({ where: { id: opts.diagramId }, select: { name: true, data: true, projectId: true } });
  if (!diagram || diagram.projectId !== opts.projectId) return { ok: false, status: 404, error: "Diagram not found in this project" };

  let data = diagram.data as unknown as DiagramData;
  let effScope = opts.scope, effScopeId = opts.scopeElementId, effName = diagram.name;
  if (opts.scope === "subprocess" && opts.scopeElementId) {
    const el = (data.elements ?? []).find((e) => e.id === opts.scopeElementId);
    const linked = el?.properties?.linkedDiagramId as string | undefined;
    if (linked) {
      const child = await prisma.diagram.findUnique({ where: { id: linked }, select: { name: true, data: true, projectId: true } });
      if (child && child.projectId === opts.projectId) { data = child.data as unknown as DiagramData; effScope = "whole"; effScopeId = undefined; effName = child.name; }
    }
  }

  const skeleton = extractSkeleton(data, { scope: effScope, scopeElementId: effScopeId, diagramId: opts.diagramId, diagramName: effName });
  const { resolved, briefing } = await loadSopBriefing(opts.projectId, opts.orgId, effScope);
  const result = await generateSop({ apiKey: opts.apiKey, skeleton, briefing });
  if (!result.ok) return { ok: false, status: result.status, error: result.error };
  return { ok: true, sections: result.sections, model: result.model, templateId: resolved.templateId, title: skeleton.meta.title, scopeLabel: skeleton.meta.scopeLabel ?? null };
}

/** Generate a SUITE: one procedure per diagram in the root's forward-link
 *  closure (dependency order, capped), each as a divider section + its sections. */
export async function runSopSuite(opts: {
  projectId: string; orgId: string; rootDiagramId: string; apiKey: string;
}): Promise<RunResult> {
  const root = await prisma.diagram.findUnique({ where: { id: opts.rootDiagramId }, select: { name: true, projectId: true } });
  if (!root || root.projectId !== opts.projectId) return { ok: false, status: 404, error: "Diagram not found in this project" };

  const closure = await walkForwardClosure(opts.rootDiagramId, opts.projectId, prisma);
  // Root first, then the rest (closure includes the root).
  const ids = [opts.rootDiagramId, ...closure.diagramIds.filter((d) => d !== opts.rootDiagramId)].slice(0, SOP_SUITE_CAP);

  const sections: SopSectionOut[] = [];
  let model = "";
  let templateId: string | null = null;
  let any = false;
  for (const did of ids) {
    const one = await runSopGenerate({ projectId: opts.projectId, orgId: opts.orgId, diagramId: did, scope: "whole" as SopScope, apiKey: opts.apiKey });
    if (!one.ok) continue; // skip a diagram that fails; keep building the suite
    any = true; model = one.model; templateId = one.templateId;
    sections.push({ heading: one.title, body: `_Process ${sections.filter((s) => !s.body.startsWith("_")).length + 1} of the suite._` });
    for (const s of one.sections) sections.push(s);
  }
  if (!any) return { ok: false, status: 502, error: "The suite produced no procedures" };
  if (closure.diagramIds.length > SOP_SUITE_CAP) {
    sections.push({ heading: "Note", body: `This suite covers the first ${SOP_SUITE_CAP} linked diagrams; ${closure.diagramIds.length - SOP_SUITE_CAP} more are linked but omitted.` });
  }
  return { ok: true, sections, model, templateId, title: `${root.name} — Suite`, scopeLabel: `${ids.length} linked processes` };
}
