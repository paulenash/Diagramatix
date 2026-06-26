/**
 * Diagramatix user backup / restore helpers.
 *
 * A backup is a JSZip-zipped JSON file with extension `.diag` containing a
 * single entry `backup.json`. It includes everything a user can recreate of
 * their own data:
 *   - All projects (incl. colorConfig, folderTree)
 *   - All diagrams (incl. data, colorConfig, displayMode)
 *   - User templates (templateType: "user" only — built-ins are shared)
 *   - AI Prompts the user owns (across all orgs they're in)
 *
 * AI Rules (DiagramRules) are deliberately NOT in the backup — they're
 * system-wide and only admins can edit them; per-user customisation isn't
 * a concept in the current model. Restore won't recreate or alter rules.
 *
 * Restore is purely additive: every project / diagram / template / prompt
 * gets a fresh cuid and is created alongside whatever the user already has.
 * Internal cross-references (folder tree → diagram IDs, subprocess
 * linkedDiagramId) are remapped to the new IDs at restore time. Project
 * names are suffixed with " (restored)" so the user can tell them apart.
 * Prompts are deduped by (name + diagramType) within the destination
 * (user, org) to keep "restore over existing data" idempotent.
 *
 * Excluded from backup: password / reset tokens / Microsoft tokens (security),
 * the user's own row, org membership (multi-tenant scope), built-in
 * templates, the system archive project, AI rules.
 */

import JSZip from "jszip";
import { assertZipWithinLimit } from "@/app/lib/uploadLimit";
import { prisma } from "./db";
import { ARCHIVE_PROJECT_NAME } from "./archive";
import { SCHEMA_VERSION } from "./diagram/types";
import { type BackupProgressFn } from "./full-backup";

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

/** A node in a project's Entity List, with its original id preserved as a
 *  temp id so the parent/child tree can be re-linked after restore. */
interface BackupEntityNode {
  tmpId: string;
  parentTmpId: string | null;
  name: string;
  level: string;
  sortOrder: number;
}
interface BackupEntityList {
  name: string;
  kind: string;
  nodes: BackupEntityNode[];
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
  // Per-project Entity Lists (drive pool/lane naming). Optional so older
  // backup files still parse.
  entityLists?: BackupEntityList[];
}

interface BackupTemplate {
  id: string;
  name: string;
  diagramType: string;
  templateType: string;
  group?: string | null;
  data: unknown;
  createdAt: string;
}

interface BackupPrompt {
  id: string;
  name: string;
  text: string;
  diagramType: string;
  // Most-recently-saved 2-phase AI Plan for this prompt, if any. The
  // editor stashes this so the user can resume an in-progress plan.
  planJson: unknown;
  planUpdatedAt: string | null;
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
  // Optional so a pre-1.11 backup payload still parses cleanly. Build
  // always emits this (possibly empty) from 1.11 onwards.
  userPrompts?: BackupPrompt[];
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
  onProgress?: BackupProgressFn,
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
  onProgress?.("Projects", projectsRaw.length);
  const allDiagrams = await prisma.diagram.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  onProgress?.("Diagrams", allDiagrams.length);

  // Per-project Entity Lists + their node trees (one query each, grouped).
  const projectIds = projectsRaw.map((p) => p.id);
  const entityLists = projectIds.length > 0
    ? await prisma.entityList.findMany({ where: { projectId: { in: projectIds } } })
    : [];
  const entityNodes = entityLists.length > 0
    ? await prisma.entityNode.findMany({ where: { listId: { in: entityLists.map((l) => l.id) } }, orderBy: { sortOrder: "asc" } })
    : [];
  onProgress?.("Entity Lists", entityLists.length);
  const nodesByList = new Map<string, typeof entityNodes>();
  for (const n of entityNodes) (nodesByList.get(n.listId) ?? nodesByList.set(n.listId, []).get(n.listId)!).push(n);
  const listsByProject = new Map<string, BackupEntityList[]>();
  for (const l of entityLists) {
    if (!l.projectId) continue;
    const bl: BackupEntityList = {
      name: l.name,
      kind: String(l.kind),
      nodes: (nodesByList.get(l.id) ?? []).map((n) => ({
        tmpId: n.id,
        parentTmpId: n.parentId ?? null,
        name: n.name,
        level: String(n.level),
        sortOrder: n.sortOrder,
      })),
    };
    (listsByProject.get(l.projectId) ?? listsByProject.set(l.projectId, []).get(l.projectId)!).push(bl);
  }

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
    entityLists: listsByProject.get(p.id) ?? [],
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
  onProgress?.("Templates", userTemplates.length);

  // Prompts: scoped per (userId, orgId). We back up every prompt this
  // user owns, across every org they're a member of, so the data is
  // preserved even if they later switch orgs. Restore re-attaches them
  // to the user's CURRENT org (mirrors how project restore works).
  const userPromptsRaw = await prisma.prompt.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  onProgress?.("Prompts", userPromptsRaw.length);

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
      group: t.group ?? null,
      data: t.data,
      createdAt: t.createdAt.toISOString(),
    })),
    userPrompts: userPromptsRaw.map((p) => ({
      id: p.id,
      name: p.name,
      text: p.text,
      diagramType: p.diagramType,
      planJson: p.planJson,
      planUpdatedAt: p.planUpdatedAt ? p.planUpdatedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
    })),
  };

  onProgress?.("Compressing", 0);
  const zip = new JSZip();
  zip.file(BACKUP_ENTRY, JSON.stringify(payload, null, 2));
  return await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/** A unique-enough id for pre-allocating EntityNode ids so a node tree's
 *  parentId references can be re-linked within a single createMany. */
function cuidish(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
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
  promptsRestored: number;
  promptsSkipped: number;
  entityListsRestored: number;
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
  assertZipWithinLimit(zip); // IO-01: refuse zip bombs before decompressing entries
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
  let unfiledDiagramsRestored = 0;
  let templatesRestored = 0;
  let promptsRestored = 0;
  let promptsSkipped = 0;
  let entityListsRestored = 0;

  // The whole additive restore runs in ONE interactive transaction so a
  // mid-way failure rolls back to the pre-restore state instead of leaving
  // a half-restored set (audit DATA-06). Every write below MUST go through
  // `tx`, never the module `prisma` client, or it would escape the rollback.
  // Timeout/maxWait are raised because a large backup is many writes.
  await prisma.$transaction(async (tx) => {
  // ── Projects ────────────────────────────────────────────────────────────
  for (const proj of payload.projects ?? []) {
    log.push(`Importing project: ${proj.name}`);
    const newProj = await tx.project.create({
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
      const newDiag = await tx.diagram.create({
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

    // Per-project Entity Lists — recreate with fresh ids; re-link each node
    // tree via its temp ids (one createMany resolves the self-references).
    for (const el of proj.entityLists ?? []) {
      const newList = await tx.entityList.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { name: el.name, kind: el.kind as any, projectId: newProj.id },
      });
      if (el.nodes && el.nodes.length > 0) {
        const nodeIdMap = new Map<string, string>();
        for (const n of el.nodes) nodeIdMap.set(n.tmpId, cuidish());
        await tx.entityNode.createMany({
          data: el.nodes.map((n) => ({
            id: nodeIdMap.get(n.tmpId)!,
            listId: newList.id,
            parentId: n.parentTmpId ? nodeIdMap.get(n.parentTmpId) ?? null : null,
            name: n.name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            level: n.level as any,
            sortOrder: n.sortOrder,
          })),
        });
      }
      entityListsRestored++;
    }
  }

  // ── Unfiled diagrams ───────────────────────────────────────────────────
  for (const diag of payload.unfiledDiagrams ?? []) {
    const newDiag = await tx.diagram.create({
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
  for (const tpl of payload.userTemplates ?? []) {
    // Preserve the template's group on restore. Older backups (pre-1.11)
    // omit the field; treat that as ungrouped (null).
    const incomingGroup = typeof tpl.group === "string" ? tpl.group.trim() : "";
    const groupValue: string | null = incomingGroup.length > 0 ? incomingGroup : null;
    await tx.diagramTemplate.create({
      data: {
        name: tpl.name,
        diagramType: tpl.diagramType ?? "bpmn",
        templateType: "user", // never restore as built-in
        group: groupValue,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: (tpl.data ?? {}) as any,
        userId,
      },
    });
    templatesRestored++;
  }

  // ── AI Prompts ─────────────────────────────────────────────────────────
  // Restored into the user's CURRENT org. Dedup by (name + diagramType) in
  // that org so re-running a restore doesn't pile up "Foo (1)", "Foo (2)".
  if (Array.isArray(payload.userPrompts) && payload.userPrompts.length > 0) {
    const existing = await tx.prompt.findMany({
      where: { userId, orgId },
      select: { name: true, diagramType: true },
    });
    const existingKeys = new Set(existing.map((p) => `${p.name}|${p.diagramType}`));
    for (const pr of payload.userPrompts) {
      const key = `${pr.name}|${pr.diagramType ?? "bpmn"}`;
      if (existingKeys.has(key)) { promptsSkipped++; continue; }
      await tx.prompt.create({
        data: {
          name: pr.name,
          text: pr.text,
          diagramType: pr.diagramType ?? "bpmn",
          userId,
          orgId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          planJson: (pr.planJson ?? undefined) as any,
          planUpdatedAt: pr.planUpdatedAt ? new Date(pr.planUpdatedAt) : null,
        },
      });
      existingKeys.add(key);
      promptsRestored++;
    }
  }

  // AI Rules are system-wide and admin-only — not in backup, nothing to
  // restore. Older backup files that briefly carried a `userDiagramRules`
  // array are silently ignored.

  // ── Phase 2: rewrite cross-references using the id maps ────────────────
  // 2a. Project folder trees + colorConfig (raw SQL because Prisma 7 doesn't
  //     write JSON columns through model.update for nested structures)
  for (const proj of payload.projects ?? []) {
    const newProjId = oldToNewProjectId.get(proj.id);
    if (!newProjId) continue;
    const remappedTree = remapFolderTree(proj.folderTree, oldToNewDiagramId);
    await tx.$executeRawUnsafe(
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
      await tx.$executeRawUnsafe(
        'UPDATE "Diagram" SET "data" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
        JSON.stringify(data),
        newDiagId,
      );
    }
  }
  }, { timeout: 120_000, maxWait: 15_000 });

  log.push(
    `✔ Restore complete: ${projectsRestored} project(s), ${diagramsRestored} diagram(s) ` +
      `in projects, ${unfiledDiagramsRestored} unfiled diagram(s), ${templatesRestored} template(s), ` +
      `${promptsRestored} prompt(s)` +
      (promptsSkipped > 0 ? ` (${promptsSkipped} skipped as duplicates)` : "") +
      (entityListsRestored > 0 ? `, ${entityListsRestored} entity list(s)` : ""),
  );

  return {
    projectsRestored,
    diagramsRestored,
    unfiledDiagramsRestored,
    templatesRestored,
    promptsRestored,
    promptsSkipped,
    entityListsRestored,
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
