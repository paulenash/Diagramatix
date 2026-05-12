import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { importVisioV3 } from "@/app/lib/diagram/v3/importVisioV3";
import { listVisioPages } from "@/app/lib/diagram/v3/visioPages";
import { isImpersonating } from "@/app/lib/superuser";
import {
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

/**
 * POST /api/import/visio-v3/bulk
 * Multi-page Visio import. Imports one or more pages from a single .vsdx
 * file as separate Diagramatix diagrams. Optionally creates a new Project
 * to receive them.
 *
 * Form fields:
 *  - file (required): the .vsdx binary
 *  - pageIndices (required): CSV of 0-based page indices, e.g. "0,2,3"
 *  - newProjectName (optional): if set, creates a new project with this
 *    name in the caller's active org and imports diagrams into it
 *  - projectId (optional): existing project to receive the diagrams.
 *    Ignored when newProjectName is set
 *  - folderName (optional): folder name inside the project's folderTree.
 *    Default "Imported BPMN Diagrams". Created if missing.
 *
 * Returns: `{ project?, folderId, diagrams: [{ diagram, pageIndex, pageName,
 *           warnings, stats }], errors: [{ pageIndex, pageName, message }] }`.
 */

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  collapsed?: boolean;
}
interface FolderTree {
  folders: FolderNode[];
  diagramFolderMap: Record<string, string>;
  diagramOrder?: Record<string, string[]>;
  folderOrder?: Record<string, string[]>;
}

function emptyTree(): FolderTree {
  return { folders: [], diagramFolderMap: {} };
}

/** Add a root-level folder to the tree if no folder of that name exists.
 *  Returns the resolved folderId. If folderName is empty/null, returns null
 *  (caller should leave diagram at project root). */
function upsertRootFolder(tree: FolderTree, folderName: string): { tree: FolderTree; folderId: string | null } {
  const trimmed = folderName.trim();
  if (!trimmed) return { tree, folderId: null };
  const existing = tree.folders.find((f) => f.parentId === null && f.name === trimmed);
  if (existing) return { tree, folderId: existing.id };
  const newId = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    tree: {
      ...tree,
      folders: [...tree.folders, { id: newId, name: trimmed, parentId: null }],
    },
    folderId: newId,
  };
}

function timestampSuffix(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${p(d.getFullYear() % 100)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isImpersonating(session, cookieStore)) {
      return NextResponse.json(
        { error: "Read-only: viewing another user" },
        { status: 403 },
      );
    }
  } catch {
    /* cookies() may fail in some contexts — proceed normally */
  }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart upload" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  const upload = file as File;

  const pageIndicesRaw = (form.get("pageIndices") as string | null)?.trim() ?? "";
  if (!pageIndicesRaw) {
    return NextResponse.json({ error: "Missing 'pageIndices' field" }, { status: 400 });
  }
  const pageIndices = pageIndicesRaw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0);
  if (pageIndices.length === 0) {
    return NextResponse.json({ error: "No valid page indices supplied" }, { status: 400 });
  }

  const newProjectNameRaw = (form.get("newProjectName") as string | null)?.trim() ?? "";
  const projectIdRaw = (form.get("projectId") as string | null)?.trim() ?? "";
  const folderName = (form.get("folderName") as string | null)?.trim() ?? "Imported BPMN Diagrams";

  // Resolve target project
  let project: { id: string; folderTree: unknown } | null = null;
  let createdNewProject = false;
  if (newProjectNameRaw) {
    const created = await prisma.project.create({
      data: {
        name: newProjectNameRaw,
        userId: session.user.id,
        orgId,
        ownerName: session.user.name ?? session.user.email ?? "",
      },
    });
    project = { id: created.id, folderTree: (created as unknown as { folderTree?: unknown }).folderTree ?? null };
    createdNewProject = true;
  } else if (projectIdRaw) {
    const found = await prisma.project.findFirst({
      where: { id: projectIdRaw, userId: session.user.id, orgId },
    });
    if (!found) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    project = { id: found.id, folderTree: (found as unknown as { folderTree?: unknown }).folderTree ?? null };
  } else {
    return NextResponse.json({ error: "Either projectId or newProjectName required" }, { status: 400 });
  }

  // Load .vsdx into memory once.
  const buf = await upload.arrayBuffer();

  // Validate page indices against actual page count.
  let pages: Awaited<ReturnType<typeof listVisioPages>>;
  try {
    pages = await listVisioPages(buf);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read .vsdx pages: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }
  if (pages.length === 0) {
    return NextResponse.json({ error: "No usable pages in .vsdx" }, { status: 400 });
  }
  const validIndices = pageIndices.filter((i) => i < pages.length);

  // Existing diagram names in target project (for conflict resolution).
  const existingDiagrams = await prisma.diagram.findMany({
    where: { projectId: project.id, orgId },
    select: { name: true },
  });
  const existingNames = new Set(existingDiagrams.map((d) => d.name));

  // Load + prep folderTree.
  let tree = ((project.folderTree as FolderTree | null) ?? emptyTree()) as FolderTree;
  if (!tree.folders || !tree.diagramFolderMap) tree = emptyTree();
  const folderUpsert = upsertRootFolder(tree, folderName);
  tree = folderUpsert.tree;
  const folderId = folderUpsert.folderId;

  // Iterate pages, importing each. Failures collected without aborting.
  const diagrams: Array<{
    diagram: { id: string; name: string };
    pageIndex: number;
    pageName: string;
    warnings: string[];
    stats: unknown;
  }> = [];
  const errors: Array<{ pageIndex: number; pageName: string; message: string }> = [];
  // Track names used within this bulk batch so two identical page names
  // get deduplicated even before we check the per-project set.
  const batchNames = new Set<string>();

  for (const pageIndex of validIndices) {
    const pageMeta = pages[pageIndex];
    try {
      const parsed = await importVisioV3(buf, pageIndex);
      // Resolve a non-clashing name: page name → +" (n)" within batch →
      // +" dd-mm-yy hh:mm" if it collides with an existing diagram.
      let name = pageMeta.name || `Page-${pageIndex + 1}`;
      if (batchNames.has(name)) {
        let n = 2;
        while (batchNames.has(`${name} (${n})`)) n++;
        name = `${name} (${n})`;
      }
      if (existingNames.has(name)) {
        name = `${name} ${timestampSuffix()}`;
      }
      batchNames.add(name);
      existingNames.add(name);

      const created = await prisma.diagram.create({
        data: {
          name,
          type: "bpmn",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: parsed.data as any,
          userId: session.user.id,
          orgId,
          projectId: project.id,
        },
      });

      // Add to folder map if a folder was chosen / created.
      if (folderId) {
        tree = {
          ...tree,
          diagramFolderMap: { ...tree.diagramFolderMap, [created.id]: folderId },
        };
      }

      diagrams.push({
        diagram: { id: created.id, name: created.name },
        pageIndex,
        pageName: pageMeta.name,
        warnings: parsed.warnings,
        stats: parsed.stats,
      });
    } catch (err) {
      errors.push({
        pageIndex,
        pageName: pageMeta.name,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // Persist folderTree if it changed.
  if (folderId || createdNewProject) {
    await prisma.$executeRawUnsafe(
      'UPDATE "Project" SET "folderTree" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
      JSON.stringify(tree),
      project.id,
    );
  }

  return NextResponse.json(
    {
      project: createdNewProject ? { id: project.id, name: newProjectNameRaw } : undefined,
      folderId,
      diagrams,
      errors,
    },
    { status: 200 },
  );
}
