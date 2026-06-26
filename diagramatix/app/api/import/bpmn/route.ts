import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { uploadSizeError } from "@/app/lib/uploadLimit";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";
import {
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

/**
 * POST /api/import/bpmn
 *
 * Single-file BPMN 2.0 XML import. Creates a new BPMN diagram in the
 * caller's current org (or updates an existing one when
 * `overwriteDiagramId` is supplied). Mirrors the single-file Visio
 * import route in form-field surface and response shape so the
 * project-detail UI can drive both with the same status modal.
 *
 * Form fields:
 *  - file (required): the `.bpmn` (XML) binary.
 *  - projectId (optional): place the new diagram in this project.
 *  - name (optional): override the imported diagram name (which
 *    otherwise comes from <collaboration name> → <process name> →
 *    filename stem).
 *  - folderName (optional): folder inside the project's folderTree.
 *    Default "Imported BPMN Diagrams". Folder created on demand.
 *  - overwriteDiagramId (optional): UPDATE that diagram's `data`
 *    instead of creating a new one. Name/project/type preserved.
 *
 * Name-conflict handling: if the resolved name collides with an
 * existing diagram in the same project, suffix with a `dd-mm-yy hh:mm`
 * timestamp (same behaviour as the Visio importer).
 */
function timestampSuffix(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${p(d.getFullYear() % 100)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Folder-tree shape mirrors the one in ProjectDetailClient.tsx /
// api/import/visio-v3/bulk/route.ts. Kept inline to avoid a cross-route
// import.
interface FolderNode { id: string; name: string; parentId: string | null; collapsed?: boolean }
interface FolderTree {
  folders: FolderNode[];
  diagramFolderMap: Record<string, string>;
  diagramOrder?: Record<string, string[]>;
  folderOrder?: Record<string, string[]>;
}

function emptyTree(): FolderTree {
  return { folders: [], diagramFolderMap: {} };
}

function upsertRootFolder(tree: FolderTree, folderName: string): { tree: FolderTree; folderId: string | null } {
  const trimmed = folderName.trim();
  if (!trimmed) return { tree, folderId: null };
  const existing = tree.folders.find((f) => f.parentId === null && f.name === trimmed);
  if (existing) return { tree, folderId: existing.id };
  const newId = `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    tree: { ...tree, folders: [...tree.folders, { id: newId, name: trimmed, parentId: null }] },
    folderId: newId,
  };
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isReadOnlyImpersonation(session, cookieStore)) {
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

  const overrideName = (form.get("name") as string | null)?.trim() || "";
  const projectIdRaw = (form.get("projectId") as string | null) || "";
  const projectId = projectIdRaw.length > 0 ? projectIdRaw : null;
  const folderName = (form.get("folderName") as string | null)?.trim() || "Imported BPMN Diagrams";
  const overwriteDiagramId = (form.get("overwriteDiagramId") as string | null)?.trim() || null;

  // Project ownership check (when supplied).
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id, orgId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // Subscription cap: individual imports (BPMN + Visio single share the counter).
  const limitBlock = await gateLimit(session.user.id, "individualImports");
  if (limitBlock) return limitBlock;

  // Read the file as text. BPMN XML is UTF-8.
  let xmlText: string;
  try {
    const sizeErr = uploadSizeError(upload); // IO-01
    if (sizeErr) return NextResponse.json({ error: sizeErr }, { status: 413 });
    const buf = await upload.arrayBuffer();
    xmlText = new TextDecoder("utf-8").decode(buf);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read uploaded file: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }

  const fileNameStem = upload.name.replace(/\.bpmn$/i, "").replace(/\.xml$/i, "");

  let parsed: Awaited<ReturnType<typeof importBpmnXml>>;
  try {
    parsed = await importBpmnXml(xmlText, fileNameStem);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to parse .bpmn: ${err instanceof Error ? err.message : "unknown error"}`,
      },
      { status: 400 },
    );
  }

  // Element-count gate on the parsed diagram data. Reject BEFORE we
  // touch the DB so the user's individualImports counter isn't spent
  // on an over-cap import that never lands.
  const elementBlock = await gateElementCount(session.user.id, "bpmn", parsed.data);
  if (elementBlock) return elementBlock;

  // ── Overwrite path ──
  if (overwriteDiagramId) {
    const existing = await prisma.diagram.findFirst({
      where: { id: overwriteDiagramId, userId: session.user.id, orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Diagram to overwrite not found, or not owned by caller" },
        { status: 404 },
      );
    }
    const updated = await prisma.diagram.update({
      where: { id: overwriteDiagramId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { data: parsed.data as any },
    });
    return NextResponse.json(
      { diagram: updated, warnings: parsed.warnings, stats: parsed.stats, overwrote: true },
      { status: 200 },
    );
  }

  // ── Create path with name-conflict resolution ──
  const rawName = (overrideName || parsed.diagramName || fileNameStem || "Imported BPMN Diagram").trim();
  let finalName = rawName;
  const conflict = await prisma.diagram.findFirst({
    where: {
      name: rawName,
      orgId,
      ...(projectId ? { projectId } : {}),
    },
    select: { id: true },
  });
  if (conflict) finalName = `${rawName} ${timestampSuffix()}`;

  const diagram = await prisma.diagram.create({
    data: {
      name: finalName,
      type: "bpmn",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: parsed.data as any,
      userId: session.user.id,
      orgId,
      ...(projectId ? { projectId } : {}),
    },
  });

  // Folder placement — upsert the chosen folder into the project's
  // folderTree and add the new diagram to it. No-op when no projectId
  // or folderName is empty.
  if (projectId && folderName) {
    const project = await prisma.project.findFirst({
      where: { id: projectId },
      select: { folderTree: true },
    });
    let tree = ((project?.folderTree as FolderTree | null) ?? emptyTree()) as FolderTree;
    if (!tree.folders || !tree.diagramFolderMap) tree = emptyTree();
    const { tree: nextTree, folderId } = upsertRootFolder(tree, folderName);
    if (folderId) {
      const finalTree = {
        ...nextTree,
        diagramFolderMap: { ...nextTree.diagramFolderMap, [diagram.id]: folderId },
      };
      await pgPool.query(
        'UPDATE "Project" SET "folderTree" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
        [JSON.stringify(finalTree), projectId],
      );
    }
  }

  // Record AFTER the diagram is committed so a failed parse doesn't burn quota.
  await recordUsage(session.user.id, "individualImports");
  return NextResponse.json(
    { diagram, warnings: parsed.warnings, stats: parsed.stats },
    { status: 201 },
  );
}
