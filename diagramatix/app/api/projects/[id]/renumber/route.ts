/**
 * Project re-numbering — GET computes the old→new diff (preview); POST recomputes
 * server-side and applies it (never trusts a client-sent diff). Bulk JSON writes
 * go through pgPool in one transaction (Prisma 7 rule).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { dataHasPcf } from "@/app/lib/pcf/attribution";
import { computeRenumber, resolveNumberingConfig, type FolderTree, type DiagramInput } from "@/app/lib/numbering/renumber";
import type { DiagramData } from "@/app/lib/diagram/types";

type Params = { params: Promise<{ id: string }> };

async function loadProject(projectId: string, orgId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, orgId },
    select: { id: true, folderTree: true, pcf: true, numberingConfig: true },
  });
  if (!project) return null;
  const diagrams = (await prisma.diagram.findMany({
    where: { projectId, orgId },
    select: { id: true, name: true, data: true },
  })) as unknown as DiagramInput[];
  const folderTree = (project.folderTree && typeof project.folderTree === "object"
    ? project.folderTree
    : { folders: [], diagramFolderMap: {} }) as FolderTree;
  const pcfProject = !!project.pcf && typeof project.pcf === "object" && Object.keys(project.pcf).length > 0;
  const hasPcf = pcfProject || diagrams.some((d) => dataHasPcf(d.data as DiagramData));
  const config = resolveNumberingConfig(project.numberingConfig, hasPcf);
  return { folderTree, diagrams, hasPcf, config };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  let orgId: string;
  try { orgId = (await requireProjectAccess(session, await cookies(), projectId, "edit")).projectOrgId; }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const loaded = await loadProject(projectId, orgId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const diff = computeRenumber(loaded.config, loaded.folderTree, loaded.diagrams);
  return NextResponse.json({ diff, config: loaded.config, hasPcf: loaded.hasPcf });
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: projectId } = await params;
  let orgId: string;
  try { orgId = (await requireProjectAccess(session, await cookies(), projectId, "edit")).projectOrgId; }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const loaded = await loadProject(projectId, orgId);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { folderTree, diagrams, config } = loaded;
  const diff = computeRenumber(config, folderTree, diagrams); // recompute — never trust the client
  const diagramById = new Map(diagrams.map((d) => [d.id, d]));

  const client = await pgPool.connect();
  try {
    await client.query("BEGIN");
    // Diagrams: element labels + codes, data.nameCode, Diagram.name.
    for (const dd of diff.diagrams) {
      const d = diagramById.get(dd.id);
      if (!d) continue;
      const data = (d.data ?? { elements: [], connectors: [] }) as DiagramData;
      data.nameCode = dd.code;
      const byId = new Map(dd.elements.map((e) => [e.id, e]));
      for (const el of data.elements ?? []) {
        const e = byId.get(el.id);
        if (e) { el.label = e.newLabel; el.properties = { ...(el.properties ?? {}), nameCode: e.newCode }; }
      }
      await client.query(
        'UPDATE "Diagram" SET "data" = $1::jsonb, "name" = $2, "updatedAt" = NOW() WHERE id = $3',
        [JSON.stringify(data), dd.newName, dd.id],
      );
    }
    // Folder names (full mode).
    if (diff.folders.length) {
      const nameById = new Map(diff.folders.map((f) => [f.id, f.newName]));
      const ft = { ...folderTree, folders: folderTree.folders.map((f) => (nameById.has(f.id) ? { ...f, name: nameById.get(f.id)! } : f)) };
      await client.query('UPDATE "Project" SET "folderTree" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(ft), projectId]);
    }
    // Mark applied.
    const newConfig = { ...config, applied: true, lastAppliedAt: new Date().toISOString() };
    await client.query('UPDATE "Project" SET "numberingConfig" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(newConfig), projectId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return NextResponse.json({ ok: true, counters: diff.counters });
}
