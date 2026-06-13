/**
 * OrgAdmin-scoped backup / restore.
 *
 * Mirrors the SuperAdmin full backup (app/lib/full-backup.ts) but confined
 * to a single Org: only that Org's row, its members, and their Org-scoped
 * data (projects, diagrams, history, templates, prompts, rules). The file
 * is the same `.diag-full` JSON shape (FullBackupPayload) so the existing
 * `inspectFullBackup` tree view works unchanged.
 *
 * The restore is ADDITIVE and SELECTIVE, and — unlike the SuperAdmin
 * additive restore which always creates a NEW org — it restores INTO the
 * caller's existing Org. Backup users are matched to live users by email
 * (re-parenting onto the live row); a backup user with no live match is
 * created and added as an Org member. This lets an OrgAdmin restore, say,
 * a single deleted diagram back to the member who owned it.
 */

import JSZip from "jszip";
import { prisma } from "./db";
import { SCHEMA_VERSION } from "./diagram/types";
import {
  FULL_BACKUP_KIND,
  FULL_BACKUP_TABLE_ORDER,
  type FullBackupPayload,
  type FullRestoreResult,
  type AdditiveSelection,
  type BackupProgressFn,
} from "./full-backup";

const FULL_BACKUP_ENTRY = "full-backup.json";

// Date columns per model that must round-trip ISO-string → Date on restore.
// Mirrors DATE_FIELDS_BY_MODEL in full-backup.ts (kept local to avoid
// widening that module's export surface).
const DATE_FIELDS_BY_MODEL: Record<string, string[]> = {
  Org:               ["createdAt"],
  User:              ["resetTokenExpiry", "createdAt", "lastSeenAt", "subscriptionAssignedAt"],
  UsageCounter:      ["updatedAt"],
  OrgMember:         ["createdAt"],
  Project:           ["createdAt", "updatedAt"],
  Diagram:           ["createdAt", "updatedAt"],
  DiagramHistory:    ["createdAt"],
  DiagramTemplate:   ["createdAt", "updatedAt"],
  Prompt:            ["planUpdatedAt", "createdAt", "updatedAt"],
  DiagramRules:      ["createdAt", "updatedAt"],
};

function convertDates(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const fields = DATE_FIELDS_BY_MODEL[model];
  if (!fields) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === "string") out[f] = new Date(v);
  }
  return out;
}

function shortCuid(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Build an Org-scoped backup zip for one Org. The payload shape matches
 *  FullBackupPayload (so inspectFullBackup works); only this Org's rows
 *  are included. */
export interface OrgBackupOptions {
  /** Restrict to a subset of the Org's members. Empty/undefined = all. */
  userIds?: string[];
  /** Include system-wide config tables (SubscriptionLevel / Feature /
   *  BubbleHelp / DiagramTypeStyle) so the file restores standalone. Used
   *  by the SuperAdmin scoped backup; false for OrgAdmin backups. */
  includeSystemConfig?: boolean;
}

export async function buildOrgBackup(
  orgId: string,
  exportedBy: string,
  appVersion: string,
  onProgress?: BackupProgressFn,
  opts?: OrgBackupOptions,
): Promise<Uint8Array> {
  const org = await prisma.org.findUnique({ where: { id: orgId } });
  if (!org) throw new Error("Org not found");
  onProgress?.("Org", 1);

  // Members — optionally narrowed to a selected subset of users. Sequential
  // (not Promise.all) so onProgress can report each section as it lands.
  const allMembers = await prisma.orgMember.findMany({ where: { orgId } });
  const selected = opts?.userIds && opts.userIds.length > 0 ? new Set(opts.userIds) : null;
  const orgMembers = selected ? allMembers.filter(m => selected.has(m.userId)) : allMembers;
  onProgress?.("OrgMember", orgMembers.length);
  const memberUserIds = Array.from(new Set(orgMembers.map(m => m.userId)));

  const users = await prisma.user.findMany({ where: { id: { in: memberUserIds } }, orderBy: { createdAt: "asc" } });
  onProgress?.("User", users.length);
  const usageCounters = await prisma.usageCounter.findMany({ where: { userId: { in: memberUserIds } } });
  onProgress?.("UsageCounter", usageCounters.length);
  const projects = await prisma.project.findMany({ where: { orgId, userId: { in: memberUserIds } }, orderBy: { createdAt: "asc" } });
  onProgress?.("Project", projects.length);
  const diagrams = await prisma.diagram.findMany({ where: { orgId, userId: { in: memberUserIds } }, orderBy: { createdAt: "asc" } });
  onProgress?.("Diagram", diagrams.length);
  const diagramIds = diagrams.map(d => d.id);
  const history = await prisma.diagramHistory.findMany({ where: { diagramId: { in: diagramIds } } });
  onProgress?.("DiagramHistory", history.length);
  const templates = await prisma.diagramTemplate.findMany({ where: { userId: { in: memberUserIds } } });
  onProgress?.("DiagramTemplate", templates.length);
  const prompts = await prisma.prompt.findMany({ where: { orgId, userId: { in: memberUserIds } } });
  onProgress?.("Prompt", prompts.length);
  const rules = await prisma.diagramRules.findMany({ where: { userId: { in: memberUserIds } } });
  onProgress?.("DiagramRules", rules.length);

  // System config — only when a SuperAdmin requests a self-contained scoped
  // backup. OrgAdmin backups leave these empty (they restore into a system
  // that already has its tiers/config).
  const cfg = opts?.includeSystemConfig === true;
  const subscriptionLevels = cfg ? await prisma.subscriptionLevel.findMany({ orderBy: { sortOrder: "asc" } }) : [];
  if (cfg) onProgress?.("SubscriptionLevel", subscriptionLevels.length);
  const features = cfg ? await prisma.feature.findMany({ orderBy: { createdAt: "asc" } }) : [];
  if (cfg) onProgress?.("Feature", features.length);
  const bubbleHelps = cfg ? await prisma.bubbleHelp.findMany({ orderBy: { createdAt: "asc" } }) : [];
  if (cfg) onProgress?.("BubbleHelp", bubbleHelps.length);
  const diagramTypeStyles = cfg ? await prisma.diagramTypeStyle.findMany({ orderBy: { sortOrder: "asc" } }) : [];
  if (cfg) onProgress?.("DiagramTypeStyle", diagramTypeStyles.length);

  const toIso = (row: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
    return out;
  };
  const serialise = (rows: Record<string, unknown>[]) => rows.map(toIso);

  const payload: FullBackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    kind: FULL_BACKUP_KIND,
    exportedBy,
    tableOrder: FULL_BACKUP_TABLE_ORDER,
    // Org backups are a SUBSET of a full backup and are restored only via
    // the additive path (never wipe), so the publish/bundle/review/etc.
    // tables are intentionally empty here. They must still be present as
    // empty arrays to satisfy the shared FullBackupPayload shape.
    counts: {
      Org: 1,
      SubscriptionLevel: subscriptionLevels.length,
      User: users.length,
      UsageCounter: usageCounters.length,
      OrgMember: orgMembers.length,
      Project: projects.length,
      ProjectShare: 0,
      Diagram: diagrams.length,
      DiagramHistory: history.length,
      PublishedVersion: 0,
      PublicationBundle: 0,
      PublicationBundleDiagram: 0,
      PublicationBundleAudience: 0,
      PendingBundleAudience: 0,
      DiagramFeedback: 0,
      DiagramTemplate: templates.length,
      Prompt: prompts.length,
      DiagramRules: rules.length,
      Feature: features.length,
      BubbleHelp: bubbleHelps.length,
      DiagramTypeStyle: diagramTypeStyles.length,
      Notification: 0,
      CollaborationGroup: 0,
      CollaborationGroupMember: 0,
      DiagramReview: 0,
      DiagramReviewer: 0,
      OwnershipTransfer: 0,
    },
    tables: {
      Org: serialise([org] as Record<string, unknown>[]),
      SubscriptionLevel: serialise(subscriptionLevels as Record<string, unknown>[]),
      User: serialise(users as Record<string, unknown>[]),
      UsageCounter: serialise(usageCounters as Record<string, unknown>[]),
      OrgMember: serialise(orgMembers as Record<string, unknown>[]),
      Project: serialise(projects as Record<string, unknown>[]),
      ProjectShare: [],
      Diagram: serialise(diagrams as Record<string, unknown>[]),
      DiagramHistory: serialise(history as Record<string, unknown>[]),
      PublishedVersion: [],
      PublicationBundle: [],
      PublicationBundleDiagram: [],
      PublicationBundleAudience: [],
      PendingBundleAudience: [],
      DiagramFeedback: [],
      DiagramTemplate: serialise(templates as Record<string, unknown>[]),
      Prompt: serialise(prompts as Record<string, unknown>[]),
      DiagramRules: serialise(rules as Record<string, unknown>[]),
      Feature: serialise(features as Record<string, unknown>[]),
      BubbleHelp: serialise(bubbleHelps as Record<string, unknown>[]),
      DiagramTypeStyle: serialise(diagramTypeStyles as Record<string, unknown>[]),
      Notification: [],
      CollaborationGroup: [],
      CollaborationGroupMember: [],
      DiagramReview: [],
      DiagramReviewer: [],
      OwnershipTransfer: [],
    },
  };

  onProgress?.("Compressing", 0);
  const zip = new JSZip();
  zip.file(FULL_BACKUP_ENTRY, JSON.stringify(payload, null, 2));
  return await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

/** Filter a (possibly multi-Org) backup payload down to a single Org's
 *  rows, so an OrgAdmin can only ever inspect / restore their own Org's
 *  data even if they upload a wider backup. */
export function scopePayloadToOrg(payload: FullBackupPayload, orgId: string): FullBackupPayload {
  type AnyRow = Record<string, unknown>;
  const memberUserIds = new Set(
    (payload.tables.OrgMember as AnyRow[]).filter(m => String(m.orgId) === orgId).map(m => String(m.userId)),
  );
  const projects = (payload.tables.Project as AnyRow[]).filter(p => String(p.orgId) === orgId);
  const projectIds = new Set(projects.map(p => String(p.id)));
  const diagrams = (payload.tables.Diagram as AnyRow[]).filter(d => String(d.orgId) === orgId);
  const diagramIds = new Set(diagrams.map(d => String(d.id)));
  return {
    ...payload,
    tables: {
      Org: (payload.tables.Org as AnyRow[]).filter(o => String(o.id) === orgId),
      SubscriptionLevel: [],
      User: (payload.tables.User as AnyRow[]).filter(u => memberUserIds.has(String(u.id))),
      UsageCounter: (payload.tables.UsageCounter as AnyRow[]).filter(c => memberUserIds.has(String(c.userId))),
      OrgMember: (payload.tables.OrgMember as AnyRow[]).filter(m => String(m.orgId) === orgId),
      Project: projects,
      Diagram: diagrams,
      ProjectShare: [],
      DiagramHistory: (payload.tables.DiagramHistory as AnyRow[]).filter(h => diagramIds.has(String(h.diagramId))),
      PublishedVersion: [],
      PublicationBundle: [],
      PublicationBundleDiagram: [],
      PublicationBundleAudience: [],
      PendingBundleAudience: [],
      DiagramFeedback: [],
      DiagramTemplate: (payload.tables.DiagramTemplate as AnyRow[]).filter(t => memberUserIds.has(String(t.userId))),
      Prompt: (payload.tables.Prompt as AnyRow[]).filter(p => String(p.orgId) === orgId),
      DiagramRules: (payload.tables.DiagramRules as AnyRow[]).filter(r => memberUserIds.has(String(r.userId))),
      Feature: [],
      BubbleHelp: [],
      DiagramTypeStyle: [],
      Notification: [],
      CollaborationGroup: [],
      CollaborationGroupMember: [],
      DiagramReview: [],
      DiagramReviewer: [],
      OwnershipTransfer: [],
    },
    // unused fields below kept from the original
    counts: {
      ...payload.counts,
      Project: projects.length,
      Diagram: diagrams.length,
    },
  };
}

/** Additive, selective restore INTO an existing Org. Maps the backup's
 *  org to `targetOrgId` (never creates a new org), matches users by email
 *  to live users (creating + adding as members any that don't exist), and
 *  inserts the selected projects / diagrams / templates / prompts with
 *  fresh cuids. Transitive closure: a selected diagram pulls in its
 *  project + owner.
 *
 *  Caller MUST have already verified the caller is an OrgAdmin of
 *  `targetOrgId` and scoped the payload to that org (scopePayloadToOrg). */
export async function restoreOrgBackupAdditive(
  payload: FullBackupPayload,
  selection: AdditiveSelection,
  targetOrgId: string,
): Promise<FullRestoreResult> {
  type AnyRow = Record<string, unknown>;
  const log: string[] = [];
  const inserted: Record<string, number> = {};
  log.push(`Org backup created ${payload.exportedAt} by ${payload.exportedBy}`);
  log.push("Restore mode: additive (into existing Org)");

  const projectSet = new Set<string>(selection.projectIds);
  const diagramSet = new Set<string>(selection.diagramIds);
  const templateSet = new Set<string>(selection.templateIds ?? []);
  const userSet = new Set<string>(selection.userIds);

  const projectsById = new Map((payload.tables.Project as AnyRow[]).map(p => [String(p.id), p]));
  const diagramsById = new Map((payload.tables.Diagram as AnyRow[]).map(d => [String(d.id), d]));

  // Transitive closure.
  for (const did of diagramSet) {
    const d = diagramsById.get(did);
    if (!d) continue;
    userSet.add(String(d.userId));
    if (d.projectId) projectSet.add(String(d.projectId));
  }
  for (const pid of projectSet) {
    const p = projectsById.get(pid);
    if (p) userSet.add(String(p.userId));
  }

  // Map backup users → live users by email (create if absent).
  const selectedUsers = (payload.tables.User as AnyRow[]).filter(u => userSet.has(String(u.id)));
  const emails = selectedUsers.map(u => String(u.email ?? "")).filter(e => e.length > 0);
  const liveByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const existing = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true, email: true } });
    for (const u of existing) liveByEmail.set(u.email, u.id);
  }

  const userIdMap = new Map<string, string>();
  const projectIdMap = new Map<string, string>();
  const diagramIdMap = new Map<string, string>();
  for (const id of projectSet) projectIdMap.set(id, shortCuid());
  for (const id of diagramSet) diagramIdMap.set(id, shortCuid());

  try {
    await prisma.$transaction(async (tx) => {
      // Users: reuse live by email, else create + add as Org member.
      for (const u of selectedUsers) {
        const email = String(u.email ?? "");
        const live = liveByEmail.get(email);
        if (live) {
          userIdMap.set(String(u.id), live);
          continue;
        }
        const newId = shortCuid();
        userIdMap.set(String(u.id), newId);
        await tx.user.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { ...convertDates("User", u), id: newId } as any,
        });
        inserted.User = (inserted.User ?? 0) + 1;
      }
      // Ensure every involved user is a member of the target Org.
      for (const [, liveUserId] of userIdMap) {
        const exists = await tx.orgMember.findFirst({ where: { orgId: targetOrgId, userId: liveUserId }, select: { id: true } });
        if (!exists) {
          await tx.orgMember.create({ data: { id: shortCuid(), orgId: targetOrgId, userId: liveUserId, role: "Viewer" } });
          inserted.OrgMember = (inserted.OrgMember ?? 0) + 1;
        }
      }
      // Projects → target org, remapped owner.
      for (const p of (payload.tables.Project as AnyRow[]).filter(p => projectSet.has(String(p.id)))) {
        await tx.project.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: {
            ...convertDates("Project", p),
            id: projectIdMap.get(String(p.id))!,
            orgId: targetOrgId,
            userId: userIdMap.get(String(p.userId))!,
            name: `${String(p.name)} (restored)`,
          } as any,
        });
        inserted.Project = (inserted.Project ?? 0) + 1;
      }
      // Diagrams → target org, remapped owner + project.
      for (const d of (payload.tables.Diagram as AnyRow[]).filter(d => diagramSet.has(String(d.id)))) {
        const projectId = d.projectId ? projectIdMap.get(String(d.projectId)) ?? null : null;
        await tx.diagram.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: {
            ...convertDates("Diagram", d),
            id: diagramIdMap.get(String(d.id))!,
            orgId: targetOrgId,
            userId: userIdMap.get(String(d.userId))!,
            projectId,
            // diagramOwnerId may reference a user not in scope; null it so
            // there's no dangling FK. The owner can reassign after restore.
            diagramOwnerId: null,
            // Lifecycle / publish pointers don't survive a selective restore.
            currentPublishedVersionId: null,
            lifecycle: "DRAFT",
          } as any,
        });
        inserted.Diagram = (inserted.Diagram ?? 0) + 1;
      }
      // History for restored diagrams.
      for (const h of (payload.tables.DiagramHistory as AnyRow[]).filter(h => diagramSet.has(String(h.diagramId)))) {
        const userRemap = h.userId ? userIdMap.get(String(h.userId)) ?? null : null;
        await tx.diagramHistory.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { ...convertDates("DiagramHistory", h), id: shortCuid(), diagramId: diagramIdMap.get(String(h.diagramId))!, userId: userRemap } as any,
        });
        inserted.DiagramHistory = (inserted.DiagramHistory ?? 0) + 1;
      }
      // Templates (ticked, owner in scope).
      for (const t of (payload.tables.DiagramTemplate as AnyRow[]).filter(t => templateSet.has(String(t.id)))) {
        const ownerId = String(t.userId);
        if (!userSet.has(ownerId)) continue;
        await tx.diagramTemplate.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { ...convertDates("DiagramTemplate", t), id: shortCuid(), userId: userIdMap.get(ownerId)! } as any,
        });
        inserted.DiagramTemplate = (inserted.DiagramTemplate ?? 0) + 1;
      }
    });
  } catch (err) {
    log.push(`✘ Restore failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  for (const [model, count] of Object.entries(inserted)) log.push(`  ${model}: ${count} row(s) inserted`);
  log.push("✔ Org additive restore complete");
  return { mode: "additive", inserted, log };
}

export { FULL_BACKUP_KIND };
