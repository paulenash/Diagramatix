/**
 * SuperAdmin diagram-bundle IMPORT. Recreates a bundle (from
 * /api/admin/diagram-bundle/[id]) as a BRAND-NEW diagram in the chosen project,
 * with fresh ids throughout:
 *   1. create the linked Prompt (incl. planJson via raw SQL)
 *   2. create the per-model comparison diagrams
 *   3. create the main diagram, rewriting data.aiGeneration.promptId → new prompt
 *      and aiComparison.models[].diagramId → the new per-model diagrams
 *
 * Not wrapped in a cross-store transaction (Prisma + pgPool) — an admin tool; a
 * mid-import failure surfaces an error and may leave partial rows.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import {
  isDiagramBundle, remapDiagramData, remapAiComparison,
  type BundledDiagram,
} from "@/app/lib/diagram/diagramBundle";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { bundle, projectId } = await req.json();
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  if (!isDiagramBundle(bundle)) {
    return NextResponse.json({ error: "Not a diagram bundle (kind mismatch)" }, { status: 400 });
  }
  // Refuse a bundle from a newer schema major (mirrors the JSON-import guard).
  const fileMajor = parseInt(String(bundle.schemaVersion ?? "0").split(".")[0] ?? "0", 10);
  const appMajor = parseInt(SCHEMA_VERSION.split(".")[0] ?? "0", 10);
  if (fileMajor > appMajor) {
    return NextResponse.json(
      { error: `Bundle schema ${bundle.schemaVersion} is newer than this app (${SCHEMA_VERSION}).` },
      { status: 400 },
    );
  }

  // Target project decides org + owner (same rule as POST /api/diagrams).
  let orgId: string;
  let diagramOwnerId: string;
  try {
    const access = await requireProjectAccess(session, await cookies(), projectId, "edit");
    orgId = access.projectOrgId;
    diagramOwnerId = access.ownerUserId;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const userId = session.user.id;

  const createDiagram = async (d: BundledDiagram): Promise<string> => {
    const row = await prisma.diagram.create({
      data: {
        name: `${d.name} (import)`, type: d.type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: d.data as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colorConfig: d.colorConfig as any,
        displayMode: d.displayMode,
        userId, orgId, projectId, diagramOwnerId,
      },
      select: { id: true },
    });
    return row.id;
  };

  try {
    // 1. Prompt (+ planJson via raw SQL, per the prompts API pattern).
    const promptIdMap = new Map<string, string>();
    if (bundle.prompt) {
      const p = bundle.prompt;
      const created = await prisma.prompt.create({
        data: { name: p.name, text: p.text, diagramType: p.diagramType ?? "bpmn", userId, orgId },
        select: { id: true },
      });
      if (p.planJson !== undefined && p.planJson !== null) {
        await pgPool.query(
          `UPDATE "Prompt" SET "planJson" = $1::jsonb, "planUpdatedAt" = NOW() WHERE id = $2`,
          [JSON.stringify(p.planJson), created.id],
        );
      }
      promptIdMap.set(p.originalId, created.id);
    }

    // 2. Per-model comparison diagrams → new ids (also remap any embedded prompt
    //    reference, defensively — Compare-created diagrams usually carry none).
    const diagramIdMap = new Map<string, string>();
    for (const cd of bundle.comparisonDiagrams ?? []) {
      const remapped: BundledDiagram = { ...cd, data: remapDiagramData(cd.data, promptIdMap) };
      diagramIdMap.set(cd.originalId, await createDiagram(remapped));
    }

    // 3. Main diagram — rewrite the embedded prompt + comparison references first.
    const data = remapDiagramData(bundle.diagram.data, promptIdMap);
    const aiComparison = remapAiComparison(bundle.diagram.aiComparison, diagramIdMap);
    const main = await prisma.diagram.create({
      data: {
        name: `${bundle.diagram.name} (import)`, type: bundle.diagram.type,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: data as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colorConfig: bundle.diagram.colorConfig as any,
        displayMode: bundle.diagram.displayMode,
        userId, orgId, projectId, diagramOwnerId,
      },
      select: { id: true },
    });
    // aiComparison is a JSON column Prisma 7 omits from writes — set via raw SQL.
    await pgPool.query(
      `UPDATE "Diagram" SET "aiComparison" = $1::jsonb WHERE id = $2`,
      [JSON.stringify(aiComparison ?? {}), main.id],
    );

    return NextResponse.json({ id: main.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Bundle import failed: ${msg}` }, { status: 500 });
  }
}
