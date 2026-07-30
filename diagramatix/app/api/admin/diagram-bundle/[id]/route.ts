/**
 * SuperAdmin diagram-bundle EXPORT. Assembles a self-contained package for one
 * diagram — the diagram + its linked Prompt (incl. planJson) + its aiComparison
 * matrix + the per-model comparison diagrams — so it can be transferred and
 * re-imported via /api/admin/import-diagram-bundle.
 *
 * Server-side because the client doesn't hold aiComparison (a DB column), the
 * prompt's planJson (JSON column read via raw SQL), or the per-model rows.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import {
  BUNDLE_KIND, BUNDLE_VERSION, comparisonDiagramIds,
  type DiagramBundle, type BundledDiagram, type BundledPrompt,
} from "@/app/lib/diagram/diagramBundle";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Cross-org by design (SuperAdmin export); read the whole diagram incl. the
  // aiComparison JSON column.
  const diagram = await prisma.diagram.findUnique({ where: { id } });
  if (!diagram) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  const toBundled = (d: typeof diagram): BundledDiagram => ({
    originalId: d.id, name: d.name, type: d.type,
    data: d.data, colorConfig: d.colorConfig, displayMode: d.displayMode,
  });

  // Linked Prompt (via data.aiGeneration.promptId) — with planJson via raw SQL.
  let prompt: BundledPrompt | null = null;
  const gen = (diagram.data as Record<string, unknown> | null)?.aiGeneration as
    | { promptId?: string } | undefined;
  const promptId = typeof gen?.promptId === "string" ? gen.promptId : undefined;
  if (promptId) {
    const row = await prisma.prompt.findUnique({ where: { id: promptId } });
    if (row) {
      const planRes = await pgPool.query<{ planJson: unknown; planUpdatedAt: Date | null }>(
        `SELECT "planJson", "planUpdatedAt" FROM "Prompt" WHERE id = $1`, [promptId],
      );
      const plan = planRes.rows[0] ?? { planJson: null, planUpdatedAt: null };
      prompt = {
        originalId: row.id, name: row.name, text: row.text, diagramType: row.diagramType,
        planJson: plan.planJson ?? null,
        planUpdatedAt: plan.planUpdatedAt ? plan.planUpdatedAt.toISOString() : null,
      };
    }
  }

  // Per-model comparison diagrams referenced by the aiComparison matrix.
  const compIds = comparisonDiagramIds(diagram.aiComparison);
  const comparisonDiagrams: BundledDiagram[] = compIds.length
    ? (await prisma.diagram.findMany({ where: { id: { in: compIds } } })).map(toBundled)
    : [];

  const bundle: DiagramBundle = {
    bundleVersion: BUNDLE_VERSION,
    kind: BUNDLE_KIND,
    schemaVersion: SCHEMA_VERSION,
    appVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    diagram: { ...toBundled(diagram), aiComparison: diagram.aiComparison },
    prompt,
    comparisonDiagrams,
  };

  return NextResponse.json(bundle);
}
