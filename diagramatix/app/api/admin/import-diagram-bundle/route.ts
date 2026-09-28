/**
 * SuperAdmin diagram-bundle IMPORT. Recreates a bundle (from
 * /api/admin/diagram-bundle/[id]) as a BRAND-NEW diagram in the chosen project,
 * with fresh ids throughout:
 *   1. create the linked Prompt (incl. planJson via raw SQL)
 *   2. create the per-model comparison diagrams
 *   2b. keep each bundled source image in the TARGET org (type and size checked
 *      again, hash recomputed; the importer's own identical image is reused)
 *   3. create the main diagram, rewriting data.aiGeneration.promptId → new prompt,
 *      data.aiGeneration.sourceImage.id → the kept image,
 *      and aiComparison.models[].diagramId → the new per-model diagrams
 *
 * Not wrapped in a cross-store transaction (Prisma + pgPool) — an admin tool; a
 * mid-import failure surfaces an error and may leave partial rows.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { checkSchemaCompatibility } from "@/app/lib/diagram/types";
import {
  isDiagramBundle, remapDiagramData, remapAiComparison, sourceImageIdOf,
  type BundledDiagram,
} from "@/app/lib/diagram/diagramBundle";
import { MAX_SOURCE_IMAGE_BYTES, SOURCE_IMAGE_TYPES } from "@/app/lib/ai/sourceImage";

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
  // Refuse a bundle from a newer XSD schema version (mirrors the JSON-import guard;
  // structural integer, tolerant of legacy "1.NN").
  const compat = checkSchemaCompatibility(String(bundle.schemaVersion ?? ""));
  if (!compat.ok) {
    return NextResponse.json({ error: compat.message }, { status: 400 });
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

    // 1b. The images the diagrams were generated from (bundle 1.1+). Nothing in
    //     a bundle is trusted: only the four types the model reads, up to the
    //     same 10 MB, and the hash is recomputed. Kept in the TARGET org as the
    //     importer's; importing the same image again reuses the row. One that
    //     fails the checks is skipped — the diagram still imports, and its
    //     "View source image" says the image is not available.
    const imageIdMap = new Map<string, string>();
    // Only an image a diagram in the bundle actually names — an edited bundle
    // cannot leave unreachable image rows behind in the target org.
    const named = new Set([bundle.diagram, ...(bundle.comparisonDiagrams ?? [])]
      .map((d) => sourceImageIdOf(d?.data)).filter((x): x is string => !!x));
    for (const im of Array.isArray(bundle.sourceImages) ? bundle.sourceImages : []) {
      if (!im || typeof im.originalId !== "string" || typeof im.data !== "string" || !named.has(im.originalId)) continue;
      const mimeType = String(im.mimeType ?? "").toLowerCase();
      if (!SOURCE_IMAGE_TYPES.includes(mimeType)) continue;
      const bytes = Buffer.from(im.data, "base64");
      if (!bytes.length || bytes.length > MAX_SOURCE_IMAGE_BYTES) continue;
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const where = { orgId_createdById_sha256: { orgId, createdById: userId, sha256 } };
      const size = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : null);
      const kept = await prisma.aiSourceImage.findUnique({ where, select: { id: true } })
        ?? await prisma.aiSourceImage.create({
          data: {
            orgId, createdById: userId, sha256, mimeType, bytes,
            name: String(im.name ?? "image").slice(0, 255), width: size(im.width), height: size(im.height),
          },
          select: { id: true },
        }).catch(() => prisma.aiSourceImage.findUnique({ where, select: { id: true } }));   // the same image, kept a moment ago
      if (kept) imageIdMap.set(im.originalId, kept.id);
    }

    // 2. Per-model comparison diagrams → new ids (also remap any embedded prompt
    //    or image reference, defensively — Compare-created diagrams usually carry none).
    const diagramIdMap = new Map<string, string>();
    for (const cd of bundle.comparisonDiagrams ?? []) {
      const remapped: BundledDiagram = { ...cd, data: remapDiagramData(cd.data, promptIdMap, imageIdMap) };
      diagramIdMap.set(cd.originalId, await createDiagram(remapped));
    }

    // 3. Main diagram — rewrite the embedded prompt, image + comparison references first.
    const data = remapDiagramData(bundle.diagram.data, promptIdMap, imageIdMap);
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
