/**
 * Diagramatix user backup / restore helpers.
 *
 * A backup is a JSZip-zipped JSON file with extension `.diag` containing a
 * single entry `backup.json`. It includes everything a user can recreate of
 * their own data:
 *   - All projects (incl. colorConfig, folderTree)
 *   - All diagrams (incl. data, colorConfig, displayMode)
 *   - User templates (templateType: "user" only — built-ins are shared)
 *
 * Restore is purely additive: every project / diagram / template gets a fresh
 * cuid and is created alongside whatever the user already has. Internal
 * cross-references (folder tree → diagram IDs, subprocess linkedDiagramId)
 * are remapped to the new IDs at restore time. Project names are suffixed
 * with " (restored)" so the user can tell them apart.
 *
 * Excluded from backup: password / reset tokens / Microsoft tokens (security),
 * the user's own row, org membership (multi-tenant scope), built-in templates,
 * the system archive project.
 */

import JSZip from "jszip";
import { prisma } from "./db";
import { ARCHIVE_PROJECT_NAME } from "./archive";
import { SCHEMA_VERSION } from "./diagram/types";

const BACKUP_KIND = "diagramatix-user-backup";
const BACKUP_ENTRY = "backup.json";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface BackupDiagram {
  id: string;
  name: string;
  type: string;
  data: unknown;
  colorConfig: unknown;
  displayMode: string;
  createdAt: string;
  updatedAt: string;
}

interface BackupProject {
  id: string;
  name: string;
  description: string;
  ownerName: string;
  colorConfig: unknown;
  folderTree: unknown;
  createdAt: string;
  updatedAt: string;
  diagrams: BackupDiagram[];
}

interface BackupTemplate {
  id: string;
  name: string;
  diagramType: string;
  templateType: string;
  data: unknown;
  createdAt: string;
}

export interface BackupPayload {
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  kind: typeof BACKUP_KIND;
  user: { email: string; name: string | null };
  projects: BackupProject[];
  unfiledDiagrams: BackupDiagram[];
  userTemplates: BackupTemplate[];
}

// ────────────────────────────────────────────────────────────────────────────
// Build backup
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build a backup zip for a single user. Returns a Uint8Array containing the
 * `.diag` file bytes (JSZip output, deflate-compressed).
 */
export async function buildUserBackup(
  userId: string,
  appVersion: string,
): Promise<Uint8Array> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) throw new Error("User not found");

  // Projects (excluding the system archive). Diagrams are pulled separately
  // so we can also catch unfiled diagrams (projectId === null).
  const projectsRaw = await prisma.project.findMany({
    where: { userId, name: { not: ARCHIVE_PROJECT_NAME } },
    orderBy: { createdAt: "asc" },
  });
  const allDiagrams = await prisma.diagram.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const projectIdSet = new Set(projectsRaw.map((p) => p.id));
  const projects: BackupProject[] = projectsRaw.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    ownerName: p.ownerName,
    colorConfig: p.colorConfig,
    folderTree: p.folderTree,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    diagrams: allDiagrams
      .filter((d) => d.projectId === p.id)
      .map((d) => diagramToBackup(d)),
  }));

  // Unfiled diagrams: not assigned to any (live) project
  const unfiledDiagrams: BackupDiagram[] = allDiagrams
    .filter((d) => d.projectId == null || !projectIdSet.has(d.projectId))
    .map((d) => diagramToBackup(d));

  // User templates only — built-in templates are shared system data
  const userTemplates = await prisma.diagramTemplate.findMany({
    where: { userId, templateType: "user" },
    orderBy: { createdAt: "asc" },
  });

  const payload: BackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    kind: BACKUP_KIND,
    user: { email: user.email, name: user.name },
    projects,
    unfiledDiagrams,
    userTemplates: userTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      diagramType: t.diagramType,
      templateType: t.templateType,
      data: t.data,
      createdAt: t.createdAt.toISOString(),
    })),
  };

  const zip = new JSZip();
  zip.file(BACKUP_ENTRY, JSON.stringify(payload, null, 2));
  return await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function diagramToBackup(d: any): BackupDiagram {
  return {
    id: d.id,
    name: d.name,
    type: d.type,
    data: d.data,
    colorConfig: d.colorConfig,
    displayMode: d.displayMode,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Restore backup
// ────────────────────────────────────────────────────────────────────────────

export interface RestoreResult {
  projectsRestored: number;
  diagramsRestored: number;
  unfiledDiagramsRestored: number;
  templatesRestored: number;
  log: string[];
}

/**
 * Restore a backup for the current user / org. Purely additive — never
 * overwrites or deletes anything. New cuids are minted for every row;
 * folder-tree references and subprocess linkedDiagramId properties are
 * rewritten to point at the new IDs. Project names are suffixed with
 * " (restored)" so the user can distinguish from any pre-existing projects
 * with the same name.
 */
export async function restoreUserBackup(
  bytes: ArrayBuffer | Uint8Array,
  userId: string,
  orgId: string,
  ownerDisplayName: string,
): Promise<RestoreResult> {
  // Read the zip
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file(BACKUP_ENTRY);
  if (!entry) throw new Error(`Backup is missing ${BACKUP_ENTRY}`);
  const text = await entry.async("string");
  let payload: BackupPayload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Backup contains invalid JSON");
  }
  if (payload.kind !== BACKUP_KIND) {
    throw new Error("File is not a Diagramatix user backup");
  }

  const log: string[] = [];
  log.push(`Backup created ${payload.exportedAt} by ${payload.user?.email ?? "unknown"}`);
  log.push(`Schema version ${payload.schemaVersion}`);

  // Phase 1: build the global old-diagram-id → new-diagram-id map.
  // We need this BEFORE we write any diagram data so that subprocess
  // linkedDiagramId references inside data.elements can be rewritten.
  // We pre-allocate cuids client-side via Prisma's default — easiest is to
  // do it in two passes: first create rows, capture the new IDs, then in a
  // second pass update the data.elements that reference other diagrams.

  const oldToNewDiagramId = new Map<string, string>();
  const oldToNewProjectId = new Map<string, string>();

  let projectsRestored = 0;
  let diagramsRestored = 0;

  // ── Projects ────────────────────────────────────────────────────────────
  for (const proj of payload.projects ?? []) {
    log.push(`Importing project: ${proj.name}`);
    const newProj = await prisma.project.create({
      data: {
        name: `${proj.name} (restored)`,
        description: proj.description ?? "",
        ownerName: proj.ownerName ?? ownerDisplayName,
        // colorConfig & folderTree are JSON columns — Prisma 7 needs these
        // written via raw SQL. We'll set them in a follow-up UPDATE below.
        userId,
        orgId,
      },
    });
    oldToNewProjectId.set(proj.id, newProj.id);
    projectsRestored++;

    // Diagrams in this project
    for (const diag of proj.diagrams ?? []) {
      const newDiag = await prisma.diagram.create({
        data: {
          name: diag.name,
          type: diag.type ?? "context",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: (diag.data ?? {}) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colorConfig: (diag.colorConfig ?? {}) as any,
          displayMode: diag.displayMode ?? "normal",
          userId,
          orgId,
          projectId: newProj.id,
        },
      });
      oldToNewDiagramId.set(diag.id, newDiag.id);
      diagramsRestored++;
    }
  }

  // ── Unfiled diagrams ───────────────────────────────────────────────────
  let unfiledDiagramsRestored = 0;
  for (const diag of payload.unfiledDiagrams ?? []) {
    const newDiag = await prisma.diagram.create({
      data: {
        name: diag.name,
        type: diag.type ?? "context",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: (diag.data ?? {}) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        colorConfig: (diag.colorConfig ?? {}) as any,
        displayMode: diag.displayMode ?? "normal",
        userId,
        orgId,
      },
    });
    oldToNewDiagramId.set(diag.id, newDiag.id);
    unfiledDiagramsRestored++;
  }

  // ── User templates ─────────────────────────────────────────────────────
  let templatesRestored = 0;
  for (const tpl of payload.userTemplates ?? []) {
    await prisma.diagramTemplate.create({
      data: {
        name: tpl.name,
        diagramType: tpl.diagramType ?? "bpmn",
        templateType: "user", // never restore as built-in
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: (tpl.data ?? {}) as any,
        userId,
      },
    });
    templatesRestored++;
  }

  // ── Phase 2: rewrite cross-references using the id maps ────────────────
  // 2a. Project folder trees + colorConfig (raw SQL because Prisma 7 doesn't
  //     write JSON columns through model.update for nested structures)
  for (const proj of payload.projects ?? []) {
    const newProjId = oldToNewProjectId.get(proj.id);
    if (!newProjId) continue;
    const remappedTree = remapFolderTree(proj.folderTree, oldToNewDiagramId);
    await prisma.$executeRawUnsafe(
      'UPDATE "Project" SET "colorConfig" = $1::jsonb, "folderTree" = $2::jsonb WHERE id = $3',
      JSON.stringify(proj.colorConfig ?? {}),
      JSON.stringify(remappedTree ?? {}),
      newProjId,
    );
  }

  // 2b. Rewrite subprocess.linkedDiagramId in every restored diagram's data
  for (const [oldDiagId, newDiagId] of oldToNewDiagramId.entries()) {
    const sourceDiag = findBackupDiagram(payload, oldDiagId);
    if (!sourceDiag) continue;
    const data = sourceDiag.data as
      | { elements?: Array<{ properties?: Record<string, unknown> }> }
      | undefined;
    if (!data?.elements) continue;
    let dirty = false;
    for (const el of data.elements) {
      const linked = el.properties?.linkedDiagramId;
      if (typeof linked === "string" && oldToNewDiagramId.has(linked)) {
        el.properties!.linkedDiagramId = oldToNewDiagramId.get(linked)!;
        dirty = true;
      }
    }
    if (dirty) {
      await prisma.$executeRawUnsafe(
        'UPDATE "Diagram" SET "data" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
        JSON.stringify(data),
        newDiagId,
      );
    }
  }

  log.push(
    `✔ Restore complete: ${projectsRestored} project(s), ${diagramsRestored} diagram(s) ` +
      `in projects, ${unfiledDiagramsRestored} unfiled diagram(s), ${templatesRestored} template(s)`,
  );

  return {
    projectsRestored,
    diagramsRestored,
    unfiledDiagramsRestored,
    templatesRestored,
    log,
  };
}

/**
 * Locate a diagram in the backup payload by its OLD id (search both project
 * children and unfiled diagrams).
 */
function findBackupDiagram(
  payload: BackupPayload,
  oldId: string,
): BackupDiagram | undefined {
  for (const p of payload.projects ?? []) {
    const hit = p.diagrams?.find((d) => d.id === oldId);
    if (hit) return hit;
  }
  return payload.unfiledDiagrams?.find((d) => d.id === oldId);
}

/**
 * Rewrite the diagram-id references inside a folder tree object so they
 * point at the restored ids. Unknown ids are dropped (their diagrams weren't
 * in the backup, so the references would dangle).
 */
function remapFolderTree(
  tree: unknown,
  idMap: Map<string, string>,
): unknown {
  if (!tree || typeof tree !== "object") return tree ?? {};
  const t = tree as Record<string, unknown>;

  // diagramFolderMap : { oldDiagramId: folderId }
  const newDiagramFolderMap: Record<string, string> = {};
  const oldDfm = (t.diagramFolderMap as Record<string, string>) ?? {};
  for (const [oldId, folderId] of Object.entries(oldDfm)) {
    const newId = idMap.get(oldId);
    if (newId) newDiagramFolderMap[newId] = folderId;
  }

  // diagramOrder : { folderId: [diagramId, ...] }
  const newDiagramOrder: Record<string, string[]> = {};
  const oldDo = (t.diagramOrder as Record<string, string[]>) ?? {};
  for (const [folderId, ids] of Object.entries(oldDo)) {
    newDiagramOrder[folderId] = ids
      .map((oid) => idMap.get(oid))
      .filter((v): v is string => typeof v === "string");
  }

  return {
    folders: t.folders ?? [],
    diagramFolderMap: newDiagramFolderMap,
    diagramOrder: newDiagramOrder,
    folderOrder: t.folderOrder ?? {},
  };
}
