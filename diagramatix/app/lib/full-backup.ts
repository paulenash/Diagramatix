/**
 * Admin-only FULL system backup / restore helpers.
 *
 * A full backup is a JSZip-zipped JSON file with extension `.diag-full`
 * containing a single entry `full-backup.json`. Unlike the per-user backup
 * (app/lib/backup.ts) which serialises only one user's owned data, a full
 * backup dumps every row from every table in the database — including
 * password hashes, reset tokens and any OAuth refresh tokens. Treat the
 * file as a credential.
 *
 * Restore modes (planned, this file currently implements only build):
 *
 *   wipe-and-reload (authoritative DR) — TRUNCATE every table in dependency
 *      order, re-insert every row with its original cuid. IDs preserved.
 *      Confirm-gated in the UI. Use for snapshot rollback or
 *      cross-environment migration.
 *
 *   additive-selective — admin picks Org / User / Project / Diagram rows
 *      from a tree view. Cross-references inside each selected subtree are
 *      remapped to fresh cuids on the way in. Top-down inheritance: pick
 *      an org → all its users, projects and diagrams are pre-selected.
 *
 * Build-side concerns:
 *  - Dependency order for restore must mirror the model graph
 *    (Org/User → OrgMember → Project → Diagram → DiagramHistory → templates
 *    / prompts / rules). We document the order in the payload's `tableOrder`
 *    field so a hand-rolled restore can iterate predictably.
 *  - JSON dates are serialised as ISO strings.
 *  - Json columns are emitted verbatim (Prisma already returns parsed JS).
 */

import JSZip from "jszip";
import { prisma } from "./db";
import { SCHEMA_VERSION } from "./diagram/types";

export const FULL_BACKUP_KIND = "diagramatix-full-backup";
const FULL_BACKUP_ENTRY = "full-backup.json";

/** Order in which tables must be inserted on restore (parents before
 *  children). The same order is used by the build path to lay rows out
 *  predictably in the JSON for human inspection. */
// NOTE (audit DATA-02): this list MUST cover every model in the schema.
// `restoreFullBackupWipe` TRUNCATEs the whole database; any model present
// in the schema but missing here would be cascade-deleted on restore and
// never re-inserted — silent data loss. When you add a model to
// schema.prisma, add it here (and to the build/restore/date-field maps
// below) in dependency order. A round-trip test guards this.
//
// The Diagram↔PublishedVersion relation is cyclic (Diagram.
// currentPublishedVersionId → PublishedVersion, PublishedVersion.diagramId
// → Diagram). Diagram is inserted first with a NULL pointer; the pointer
// is re-linked after PublishedVersion rows land (see restoreFullBackupWipe).
export const FULL_BACKUP_TABLE_ORDER = [
  "Org",
  // SubscriptionLevel must restore BEFORE User — User.subscriptionLevelId
  // FKs this table. Free's trialDays + every admin-edited limit lives here.
  "SubscriptionLevel",
  "User",
  // UsageCounter FKs User. Restores immediately after so each user's
  // event-counter history (AI attempts, exports, imports) carries.
  "UsageCounter",
  "OrgMember",
  "Project",
  "ProjectShare",
  "Diagram",
  "DiagramHistory",
  "PublishedVersion",
  "PublicationBundle",
  "PublicationBundleDiagram",
  "PublicationBundleAudience",
  "PendingBundleAudience",
  "DiagramFeedback",
  "DiagramTemplate",
  "Prompt",
  "DiagramRules",
  "Feature",
  "BubbleHelp",
  "Notification",
  "CollaborationGroup",
  "CollaborationGroupMember",
  "DiagramReview",
  "DiagramReviewer",
  "OwnershipTransfer",
] as const;

export interface FullBackupPayload {
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  kind: typeof FULL_BACKUP_KIND;
  /** Email of the admin who exported. Helps the recipient identify the
   *  snapshot's origin without opening the entire payload. */
  exportedBy: string;
  /** Insertion order for restore. Frozen at export time so a restore can
   *  match the database state even if a future schema version reorders. */
  tableOrder: readonly string[];
  /** Row counts per table — quick sanity-check after upload, before any
   *  destructive restore action. */
  counts: Record<string, number>;
  /** Raw row dumps, keyed by Prisma model name. Each value is an array of
   *  the model's full row shape; Date columns are pre-serialised to ISO
   *  strings, Json columns are pass-through objects. */
  tables: {
    Org: unknown[];
    SubscriptionLevel: unknown[];
    User: unknown[];
    UsageCounter: unknown[];
    OrgMember: unknown[];
    Project: unknown[];
    ProjectShare: unknown[];
    Diagram: unknown[];
    DiagramHistory: unknown[];
    PublishedVersion: unknown[];
    PublicationBundle: unknown[];
    PublicationBundleDiagram: unknown[];
    PublicationBundleAudience: unknown[];
    PendingBundleAudience: unknown[];
    DiagramFeedback: unknown[];
    DiagramTemplate: unknown[];
    Prompt: unknown[];
    DiagramRules: unknown[];
    Feature: unknown[];
    BubbleHelp: unknown[];
    Notification: unknown[];
    CollaborationGroup: unknown[];
    CollaborationGroupMember: unknown[];
    DiagramReview: unknown[];
    DiagramReviewer: unknown[];
    OwnershipTransfer: unknown[];
  };
}

/** Build a full system backup. Caller is responsible for authorisation
 *  (superuser only) and for setting an appropriate filename / Content-
 *  Disposition on the response. */
export async function buildFullBackup(
  exportedBy: string,
  appVersion: string,
): Promise<Uint8Array> {
  // Pull every row from every relevant model. We deliberately don't
  // chunk — full backups are an admin disaster-recovery tool, not a hot
  // path, and the dataset size at the pilot scale (<50 users, <500
  // diagrams) easily fits in RAM.
  const [
    orgs, subscriptionLevels, users, usageCounters, orgMembers,
    projects, projectShares, diagrams, history,
    publishedVersions, bundles, bundleDiagrams, bundleAudience, pendingAudience,
    feedback, templates, prompts, rules,
    features, bubbleHelps, notifications,
    collabGroups, collabMembers, reviews, reviewers, transfers,
  ] = await Promise.all([
    prisma.org.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.subscriptionLevel.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.usageCounter.findMany({ orderBy: { updatedAt: "asc" } }),
    prisma.orgMember.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.projectShare.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagram.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagramHistory.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.publishedVersion.findMany({ orderBy: { publishedAt: "asc" } }),
    prisma.publicationBundle.findMany({ orderBy: { publishedAt: "asc" } }),
    prisma.publicationBundleDiagram.findMany({ orderBy: { addedAt: "asc" } }),
    prisma.publicationBundleAudience.findMany({ orderBy: { addedAt: "asc" } }),
    prisma.pendingBundleAudience.findMany({ orderBy: { invitedAt: "asc" } }),
    prisma.diagramFeedback.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagramTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.prompt.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagramRules.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.feature.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.bubbleHelp.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.notification.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.collaborationGroup.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.collaborationGroupMember.findMany({ orderBy: { invitedAt: "asc" } }),
    prisma.diagramReview.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagramReviewer.findMany({ orderBy: { id: "asc" } }),
    prisma.ownershipTransfer.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  // Replace Date objects with ISO strings so the JSON serialiser doesn't
  // need to know about Prisma's runtime types. Json columns are already
  // plain objects/strings via Prisma's deserialisation.
  function toIso(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = v instanceof Date ? v.toISOString() : v;
    }
    return out;
  }
  const serialise = (rows: Record<string, unknown>[]) => rows.map(toIso);

  const payload: FullBackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    kind: FULL_BACKUP_KIND,
    exportedBy,
    tableOrder: FULL_BACKUP_TABLE_ORDER,
    counts: {
      Org: orgs.length,
      SubscriptionLevel: subscriptionLevels.length,
      User: users.length,
      UsageCounter: usageCounters.length,
      OrgMember: orgMembers.length,
      Project: projects.length,
      ProjectShare: projectShares.length,
      Diagram: diagrams.length,
      DiagramHistory: history.length,
      PublishedVersion: publishedVersions.length,
      PublicationBundle: bundles.length,
      PublicationBundleDiagram: bundleDiagrams.length,
      PublicationBundleAudience: bundleAudience.length,
      PendingBundleAudience: pendingAudience.length,
      DiagramFeedback: feedback.length,
      DiagramTemplate: templates.length,
      Prompt: prompts.length,
      DiagramRules: rules.length,
      Feature: features.length,
      BubbleHelp: bubbleHelps.length,
      Notification: notifications.length,
      CollaborationGroup: collabGroups.length,
      CollaborationGroupMember: collabMembers.length,
      DiagramReview: reviews.length,
      DiagramReviewer: reviewers.length,
      OwnershipTransfer: transfers.length,
    },
    tables: {
      Org: serialise(orgs as Record<string, unknown>[]),
      SubscriptionLevel: serialise(subscriptionLevels as Record<string, unknown>[]),
      User: serialise(users as Record<string, unknown>[]),
      UsageCounter: serialise(usageCounters as Record<string, unknown>[]),
      OrgMember: serialise(orgMembers as Record<string, unknown>[]),
      Project: serialise(projects as Record<string, unknown>[]),
      ProjectShare: serialise(projectShares as Record<string, unknown>[]),
      Diagram: serialise(diagrams as Record<string, unknown>[]),
      DiagramHistory: serialise(history as Record<string, unknown>[]),
      PublishedVersion: serialise(publishedVersions as Record<string, unknown>[]),
      PublicationBundle: serialise(bundles as Record<string, unknown>[]),
      PublicationBundleDiagram: serialise(bundleDiagrams as Record<string, unknown>[]),
      PublicationBundleAudience: serialise(bundleAudience as Record<string, unknown>[]),
      PendingBundleAudience: serialise(pendingAudience as Record<string, unknown>[]),
      DiagramFeedback: serialise(feedback as Record<string, unknown>[]),
      DiagramTemplate: serialise(templates as Record<string, unknown>[]),
      Prompt: serialise(prompts as Record<string, unknown>[]),
      DiagramRules: serialise(rules as Record<string, unknown>[]),
      Feature: serialise(features as Record<string, unknown>[]),
      BubbleHelp: serialise(bubbleHelps as Record<string, unknown>[]),
      Notification: serialise(notifications as Record<string, unknown>[]),
      CollaborationGroup: serialise(collabGroups as Record<string, unknown>[]),
      CollaborationGroupMember: serialise(collabMembers as Record<string, unknown>[]),
      DiagramReview: serialise(reviews as Record<string, unknown>[]),
      DiagramReviewer: serialise(reviewers as Record<string, unknown>[]),
      OwnershipTransfer: serialise(transfers as Record<string, unknown>[]),
    },
  };

  const zip = new JSZip();
  zip.file(FULL_BACKUP_ENTRY, JSON.stringify(payload, null, 2));
  return await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/** Parse + sanity-check a full backup uploaded by an admin. Returns the
 *  parsed payload. Throws on malformed input. Does NOT touch the database. */
export async function parseFullBackup(
  bytes: ArrayBuffer | Uint8Array,
): Promise<FullBackupPayload> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file(FULL_BACKUP_ENTRY);
  if (!entry) throw new Error(`Backup is missing ${FULL_BACKUP_ENTRY}`);
  const text = await entry.async("string");
  let payload: FullBackupPayload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("Full backup contains invalid JSON");
  }
  if (payload.kind !== FULL_BACKUP_KIND) {
    throw new Error("File is not a Diagramatix full backup");
  }
  if (!payload.tables || typeof payload.tables !== "object") {
    throw new Error("Full backup is missing the tables block");
  }
  return payload;
}

// ──────────────────────────────────────────────────────────────────────────
// Restore — wipe-and-reload (authoritative)
// ──────────────────────────────────────────────────────────────────────────

export interface FullRestoreResult {
  mode: "wipe" | "additive";
  inserted: Record<string, number>;
  log: string[];
}

/** Per-model list of columns whose JSON value is an ISO date string that
 *  must be converted back to a `Date` before Prisma will accept it. Json
 *  columns are pass-through (Prisma takes plain objects). */
const DATE_FIELDS_BY_MODEL: Record<string, string[]> = {
  Org:               ["createdAt"],
  SubscriptionLevel: ["createdAt", "updatedAt"],
  User:              ["resetTokenExpiry", "createdAt", "lastSeenAt", "subscriptionAssignedAt", "currentPeriodEnd", "subscriptionEndsAt", "compTierExpiresAt", "compTierGrantedAt"],
  UsageCounter:      ["updatedAt"],
  OrgMember:         ["createdAt"],
  Project:           ["createdAt", "updatedAt"],
  ProjectShare:      ["createdAt"],
  // nextReviewDate / lastReviewDueNotifiedAt were previously NOT converted,
  // so a published diagram's restore passed ISO strings to a DateTime
  // column and threw — part of why the wipe restore aborted (audit DATA-03).
  Diagram:           ["createdAt", "updatedAt", "nextReviewDate", "lastReviewDueNotifiedAt"],
  DiagramHistory:    ["createdAt"],
  PublishedVersion:  ["publishedAt", "supersededAt", "nextReviewDateAtPublish"],
  PublicationBundle: ["publishedAt", "nextReviewDate", "lastReviewDueNotifiedAt", "supersededAt"],
  PublicationBundleDiagram:  ["addedAt"],
  PublicationBundleAudience: ["addedAt"],
  PendingBundleAudience:     ["invitedAt"],
  DiagramFeedback:   ["resolvedAt", "createdAt", "updatedAt"],
  DiagramTemplate:   ["createdAt", "updatedAt"],
  Prompt:            ["planUpdatedAt", "createdAt", "updatedAt"],
  DiagramRules:      ["createdAt", "updatedAt"],
  Feature:           ["publishedAt", "createdAt", "updatedAt"],
  BubbleHelp:        ["createdAt", "updatedAt"],
  Notification:      ["readAt", "createdAt"],
  CollaborationGroup:       ["createdAt", "updatedAt"],
  CollaborationGroupMember: ["invitedAt", "joinedAt"],
  DiagramReview:     ["dueDate", "createdAt", "updatedAt"],
  DiagramReviewer:   ["lastActivityAt"],
  OwnershipTransfer: ["createdAt", "resolvedAt"],
};

function convertDates(model: string, row: Record<string, unknown>): Record<string, unknown> {
  const fields = DATE_FIELDS_BY_MODEL[model];
  if (!fields) return row;
  const out: Record<string, unknown> = { ...row };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === "string") out[f] = new Date(v);
    // null / undefined stay as-is (optional date columns).
  }
  return out;
}

/** Wipe-and-reload restore: TRUNCATE every table in reverse dependency
 *  order, then re-insert every row in forward order with its original
 *  cuid. The whole thing runs in one transaction — a failure mid-way
 *  rolls back to the pre-restore state.
 *
 *  Caller is responsible for authorisation (superuser only) and for
 *  warning the admin that this is destructive. The session of the admin
 *  triggering the restore is JWT-based (Auth.js), so the request itself
 *  survives the User-table wipe; however, if the admin's own row is NOT
 *  in the backup, subsequent server-side auth checks will return 401
 *  and they'll need to register / sign in again. */
export async function restoreFullBackupWipe(
  payload: FullBackupPayload,
): Promise<FullRestoreResult> {
  const inserted: Record<string, number> = {};
  const log: string[] = [];
  log.push(`Full backup created ${payload.exportedAt} by ${payload.exportedBy}`);
  log.push(`Schema version ${payload.schemaVersion} (app ${payload.appVersion})`);
  log.push(`Counts in backup: ${JSON.stringify(payload.counts)}`);

  // ── Guard (audit DATA-02) ────────────────────────────────────────────
  // A wipe restore TRUNCATEs the ENTIRE schema (CASCADE). If this backup
  // predates a model that now exists AND that live table holds rows, the
  // cascade would delete those rows with nothing in the payload to
  // re-insert — silent data loss. Refuse rather than destroy. (Current
  // backups carry every model, so this only trips on older/partial files.)
  const payloadModels = new Set(Object.keys(payload.tables ?? {}));
  const missingModels = FULL_BACKUP_TABLE_ORDER.filter((m) => !payloadModels.has(m));
  if (missingModels.length > 0) {
    const liveNonEmpty: string[] = [];
    for (const m of missingModels) {
      // Model names come from our own constant, never user input — safe to
      // interpolate into the identifier.
      const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM "${m}"`,
      );
      if (Number(rows[0]?.c ?? 0) > 0) liveNonEmpty.push(m);
    }
    if (liveNonEmpty.length > 0) {
      throw new Error(
        `Refusing wipe restore: this backup predates ${liveNonEmpty.length} ` +
        `model(s) that currently hold live data (${liveNonEmpty.join(", ")}). ` +
        `A wipe restore would permanently delete those rows with nothing to ` +
        `re-insert. Export a fresh full backup (schema ${SCHEMA_VERSION}) and ` +
        `restore that, or use additive-selective restore instead.`,
      );
    }
    log.push(`Note: backup omits ${missingModels.length} newer model(s); all empty live — safe to proceed.`);
  }

  await prisma.$transaction(async (tx) => {
    // TRUNCATE every table. CASCADE + RESTART IDENTITY; all PKs are cuids
    // so identity restart is harmless. The list is the full model set in
    // reverse dependency order (children before parents) so we never rely
    // solely on cascade. Keep in sync with FULL_BACKUP_TABLE_ORDER.
    await tx.$executeRawUnsafe(
      'TRUNCATE TABLE ' +
      '"OwnershipTransfer", "DiagramReviewer", "DiagramReview", ' +
      '"CollaborationGroupMember", "CollaborationGroup", "Notification", ' +
      '"BubbleHelp", "Feature", "DiagramRules", "Prompt", "DiagramTemplate", ' +
      '"DiagramFeedback", "PendingBundleAudience", "PublicationBundleAudience", ' +
      '"PublicationBundleDiagram", "PublicationBundle", "PublishedVersion", ' +
      '"DiagramHistory", "Diagram", "ProjectShare", "Project", "OrgMember", ' +
      '"UsageCounter", "User", "SubscriptionLevel", "Org" ' +
      'RESTART IDENTITY CASCADE',
    );
    log.push("Truncated all tables");

    // The Diagram↔PublishedVersion FK is cyclic (audit DATA-03): a
    // published Diagram carries currentPublishedVersionId pointing at a
    // PublishedVersion that itself points back at the Diagram. Insert the
    // Diagram with a NULL pointer first; collect the intended pointers and
    // re-link them after PublishedVersion rows have landed.
    const versionPointers: { id: string; versionId: string }[] = [];

    // Re-insert in forward dependency order. Per-model dispatch is
    // verbose but type-safe at runtime (Prisma's createMany rejects
    // unknown fields, which catches schema drift between backup and
    // current code). Date columns are converted from ISO strings;
    // everything else is verbatim.
    for (const model of FULL_BACKUP_TABLE_ORDER) {
      const rows = (payload.tables as Record<string, unknown[]>)[model] ?? [];
      if (rows.length === 0) {
        inserted[model] = 0;
        continue;
      }
      let data = rows.map((r) => convertDates(model, r as Record<string, unknown>));
      if (model === "Diagram") {
        data = data.map((d) => {
          const v = d.currentPublishedVersionId;
          if (v) versionPointers.push({ id: String(d.id), versionId: String(v) });
          return { ...d, currentPublishedVersionId: null };
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyData = data as any[];
      switch (model) {
        case "Org":               await tx.org.createMany({ data: anyData }); break;
        case "SubscriptionLevel": await tx.subscriptionLevel.createMany({ data: anyData }); break;
        case "User":              await tx.user.createMany({ data: anyData }); break;
        case "UsageCounter":      await tx.usageCounter.createMany({ data: anyData }); break;
        case "OrgMember":         await tx.orgMember.createMany({ data: anyData }); break;
        case "Project":           await tx.project.createMany({ data: anyData }); break;
        case "ProjectShare":      await tx.projectShare.createMany({ data: anyData }); break;
        case "Diagram":           await tx.diagram.createMany({ data: anyData }); break;
        case "DiagramHistory":    await tx.diagramHistory.createMany({ data: anyData }); break;
        case "PublishedVersion":  await tx.publishedVersion.createMany({ data: anyData }); break;
        case "PublicationBundle": await tx.publicationBundle.createMany({ data: anyData }); break;
        case "PublicationBundleDiagram":  await tx.publicationBundleDiagram.createMany({ data: anyData }); break;
        case "PublicationBundleAudience": await tx.publicationBundleAudience.createMany({ data: anyData }); break;
        case "PendingBundleAudience":     await tx.pendingBundleAudience.createMany({ data: anyData }); break;
        case "DiagramFeedback":   await tx.diagramFeedback.createMany({ data: anyData }); break;
        case "DiagramTemplate":   await tx.diagramTemplate.createMany({ data: anyData }); break;
        case "Prompt":            await tx.prompt.createMany({ data: anyData }); break;
        case "DiagramRules":      await tx.diagramRules.createMany({ data: anyData }); break;
        case "Feature":           await tx.feature.createMany({ data: anyData }); break;
        case "BubbleHelp":        await tx.bubbleHelp.createMany({ data: anyData }); break;
        case "Notification":      await tx.notification.createMany({ data: anyData }); break;
        case "CollaborationGroup":       await tx.collaborationGroup.createMany({ data: anyData }); break;
        case "CollaborationGroupMember": await tx.collaborationGroupMember.createMany({ data: anyData }); break;
        case "DiagramReview":     await tx.diagramReview.createMany({ data: anyData }); break;
        case "DiagramReviewer":   await tx.diagramReviewer.createMany({ data: anyData }); break;
        case "OwnershipTransfer": await tx.ownershipTransfer.createMany({ data: anyData }); break;
      }
      inserted[model] = rows.length;
      log.push(`  ${model}: ${rows.length} row(s) inserted`);
    }

    // Re-link the cyclic Diagram→PublishedVersion pointer now that the
    // PublishedVersion rows exist (audit DATA-03).
    for (const p of versionPointers) {
      await tx.diagram.update({
        where: { id: p.id },
        data: { currentPublishedVersionId: p.versionId },
      });
    }
    if (versionPointers.length > 0) {
      log.push(`  Diagram: re-linked ${versionPointers.length} currentPublishedVersion pointer(s)`);
    }
  });

  // Pre-1.12 backups won't carry SubscriptionLevel rows. Users restored
  // from those backups have subscriptionLevelId = null (the column itself
  // is also new), so there's no FK violation, but the admin will want to
  // run scripts/seed-subscriptions.ts afterwards to populate the tiers
  // and grandfather everyone. Warn in the log so it's obvious.
  if ((inserted.SubscriptionLevel ?? 0) === 0) {
    log.push("⚠ SubscriptionLevel table is empty after restore (pre-1.12 backup?). Run scripts/seed-subscriptions.ts to populate tiers and grandfather existing users.");
  }

  log.push("✔ Wipe-and-reload restore complete");
  return { mode: "wipe", inserted, log };
}

// ──────────────────────────────────────────────────────────────────────────
// Inspect — read-only tree view of what's in a backup
// ──────────────────────────────────────────────────────────────────────────

export interface InspectTreeDiagram {
  id: string;
  name: string;
}
export interface InspectTreeProject {
  id: string;
  name: string;
  diagrams: InspectTreeDiagram[];
}
export interface InspectTreeTemplate {
  id: string;
  name: string;
  diagramType: string;
  templateType: string;       // "user" | "builtin"
  group: string | null;
}
/** Per (org, user) pair — a user shows up under each org they're a
 *  member of. Selecting a user under one org restores their data in that
 *  org without touching data in others. Templates are user-scoped (not
 *  org-scoped) so the same template list appears under every org-instance
 *  of the same user; per-template checkboxes toggle a GLOBAL template-id
 *  set, so ticking T1 once is enough regardless of which org-occurrence
 *  the admin clicked it from. */
export interface InspectTreeUserInOrg {
  userId: string;
  userEmail: string;
  userName: string | null;
  projects: InspectTreeProject[];
  unfiledDiagrams: InspectTreeDiagram[];
  templates: InspectTreeTemplate[];
  promptCount: number;
}
export interface InspectTreeOrg {
  id: string;
  name: string;
  entityType: string;
  members: InspectTreeUserInOrg[];
}
export interface InspectTree {
  meta: {
    exportedAt: string;
    exportedBy: string;
    schemaVersion: string;
    counts: Record<string, number>;
  };
  orgs: InspectTreeOrg[];
}

/** Build a navigable tree view of a parsed backup. Intended for the
 *  admin's selective-restore UI — every level is independently
 *  selectable. Users appear under each org they belong to (a single
 *  user can be a member of multiple orgs). Templates are user-scoped;
 *  they ride along with the user automatically and aren't separately
 *  selectable. Prompts are user+org-scoped; counted here for visibility. */
export function inspectFullBackup(payload: FullBackupPayload): InspectTree {
  type AnyRow = Record<string, unknown>;
  const orgs = payload.tables.Org as AnyRow[];
  const users = payload.tables.User as AnyRow[];
  const orgMembers = payload.tables.OrgMember as AnyRow[];
  const projects = payload.tables.Project as AnyRow[];
  const diagrams = payload.tables.Diagram as AnyRow[];
  const templates = payload.tables.DiagramTemplate as AnyRow[];
  const prompts = payload.tables.Prompt as AnyRow[];

  const userById = new Map(users.map((u) => [String(u.id), u]));

  // Group rows for quick lookup during tree assembly.
  const projectsByOrgUser = new Map<string, AnyRow[]>();
  for (const p of projects) {
    const k = `${p.orgId}:${p.userId}`;
    const arr = projectsByOrgUser.get(k) ?? [];
    arr.push(p);
    projectsByOrgUser.set(k, arr);
  }
  const diagramsByProject = new Map<string, AnyRow[]>();
  const unfiledByOrgUser = new Map<string, AnyRow[]>();
  for (const d of diagrams) {
    if (d.projectId) {
      const arr = diagramsByProject.get(String(d.projectId)) ?? [];
      arr.push(d);
      diagramsByProject.set(String(d.projectId), arr);
    } else {
      const k = `${d.orgId}:${d.userId}`;
      const arr = unfiledByOrgUser.get(k) ?? [];
      arr.push(d);
      unfiledByOrgUser.set(k, arr);
    }
  }
  const templatesByUser = new Map<string, InspectTreeTemplate[]>();
  for (const t of templates) {
    const k = String(t.userId);
    const arr = templatesByUser.get(k) ?? [];
    arr.push({
      id: String(t.id),
      name: String(t.name),
      diagramType: String(t.diagramType ?? "bpmn"),
      templateType: String(t.templateType ?? "user"),
      group: (t.group as string | null) ?? null,
    });
    templatesByUser.set(k, arr);
  }
  const promptsByOrgUser = new Map<string, number>();
  for (const p of prompts) {
    const k = `${p.orgId}:${p.userId}`;
    promptsByOrgUser.set(k, (promptsByOrgUser.get(k) ?? 0) + 1);
  }
  const membersByOrg = new Map<string, AnyRow[]>();
  for (const m of orgMembers) {
    const arr = membersByOrg.get(String(m.orgId)) ?? [];
    arr.push(m);
    membersByOrg.set(String(m.orgId), arr);
  }

  const treeOrgs: InspectTreeOrg[] = orgs.map((o) => {
    const orgId = String(o.id);
    const memberRows = membersByOrg.get(orgId) ?? [];
    const members: InspectTreeUserInOrg[] = memberRows
      .map((m) => {
        const user = userById.get(String(m.userId));
        if (!user) return null;
        const k = `${orgId}:${user.id}`;
        return {
          userId: String(user.id),
          userEmail: String(user.email ?? ""),
          userName: (user.name as string | null) ?? null,
          projects: (projectsByOrgUser.get(k) ?? []).map((p) => ({
            id: String(p.id),
            name: String(p.name),
            diagrams: (diagramsByProject.get(String(p.id)) ?? []).map((d) => ({
              id: String(d.id),
              name: String(d.name),
            })),
          })),
          unfiledDiagrams: (unfiledByOrgUser.get(k) ?? []).map((d) => ({
            id: String(d.id),
            name: String(d.name),
          })),
          templates: templatesByUser.get(String(user.id)) ?? [],
          promptCount: promptsByOrgUser.get(k) ?? 0,
        } as InspectTreeUserInOrg;
      })
      .filter((x): x is InspectTreeUserInOrg => x !== null);
    return {
      id: orgId,
      name: String(o.name),
      entityType: String(o.entityType ?? "Other"),
      members,
    };
  });

  return {
    meta: {
      exportedAt: payload.exportedAt,
      exportedBy: payload.exportedBy,
      schemaVersion: payload.schemaVersion,
      counts: payload.counts,
    },
    orgs: treeOrgs,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Restore — additive (selective)
// ──────────────────────────────────────────────────────────────────────────

export interface AdditiveSelection {
  orgIds: string[];
  userIds: string[];
  projectIds: string[];
  diagramIds: string[];
  /** Templates are user-scoped; ticked independently so an admin can
   *  pull in a user's data without all their saved templates (or
   *  vice-versa). When omitted (older API callers), no templates are
   *  restored — pass an empty array. */
  templateIds?: string[];
}

function shortCuid(): string {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Selectively restore a subset of the backup, additively. Each selected
 *  row is inserted alongside whatever's live with a fresh cuid; all
 *  cross-references inside the selected subtree are remapped to those
 *  new ids. Top-down inheritance is enforced server-side: a selected
 *  Diagram pulls in its Project (if any), User, and Org regardless of
 *  what was ticked in the UI.
 *
 *  User dedup: a backup User with an email that already exists in the
 *  live database is NOT re-inserted — their old id is mapped to the
 *  existing live user's id and their data is attached to the live row.
 *  This keeps the admin's own session valid across an additive restore
 *  of their backup, and avoids unique-email collisions.
 *
 *  OrgMember pairs (user × org) that already exist are silently skipped
 *  (unique constraint on `[orgId, userId]`). */
export async function restoreFullBackupAdditive(
  payload: FullBackupPayload,
  selection: AdditiveSelection,
): Promise<FullRestoreResult> {
  type AnyRow = Record<string, unknown>;
  const log: string[] = [];
  const inserted: Record<string, number> = {};
  log.push(`Full backup created ${payload.exportedAt} by ${payload.exportedBy}`);
  log.push(`Restore mode: additive`);

  // Step 1 — compute the transitive closure of selected ids. A selected
  // diagram requires its project, user and org. A selected project
  // requires its user and org.
  const orgSet = new Set<string>(selection.orgIds);
  const userSet = new Set<string>(selection.userIds);
  const projectSet = new Set<string>(selection.projectIds);
  const diagramSet = new Set<string>(selection.diagramIds);
  const templateSet = new Set<string>(selection.templateIds ?? []);

  const projectsById = new Map(
    (payload.tables.Project as AnyRow[]).map((p) => [String(p.id), p]),
  );
  const diagramsById = new Map(
    (payload.tables.Diagram as AnyRow[]).map((d) => [String(d.id), d]),
  );

  for (const did of diagramSet) {
    const d = diagramsById.get(did);
    if (!d) continue;
    userSet.add(String(d.userId));
    orgSet.add(String(d.orgId));
    if (d.projectId) projectSet.add(String(d.projectId));
  }
  for (const pid of projectSet) {
    const p = projectsById.get(pid);
    if (!p) continue;
    userSet.add(String(p.userId));
    orgSet.add(String(p.orgId));
  }
  // If a User is selected, all their data goes via existing rules; but
  // we still need their org membership rows to land — only those whose
  // org is also in orgSet.

  // Step 2 — pre-scan emails. Any User whose email already exists in
  // the live DB gets mapped to the existing id (no insert); their data
  // is re-parented onto the live user.
  const selectedUsers = (payload.tables.User as AnyRow[]).filter(
    (u) => userSet.has(String(u.id)),
  );
  const incomingEmails = selectedUsers
    .map((u) => String(u.email ?? ""))
    .filter((e) => e.length > 0);
  const liveExistingByEmail = new Map<string, string>();
  if (incomingEmails.length > 0) {
    const existing = await prisma.user.findMany({
      where: { email: { in: incomingEmails } },
      select: { id: true, email: true },
    });
    for (const u of existing) liveExistingByEmail.set(u.email, u.id);
  }

  // Step 3 — build id remap.
  const orgIdMap = new Map<string, string>();
  const userIdMap = new Map<string, string>();
  const projectIdMap = new Map<string, string>();
  const diagramIdMap = new Map<string, string>();

  for (const id of orgSet) orgIdMap.set(id, shortCuid());
  for (const id of projectSet) projectIdMap.set(id, shortCuid());
  for (const id of diagramSet) diagramIdMap.set(id, shortCuid());
  let usersReused = 0;
  for (const u of selectedUsers) {
    const email = String(u.email ?? "");
    const live = liveExistingByEmail.get(email);
    if (live) {
      userIdMap.set(String(u.id), live);
      usersReused++;
    } else {
      userIdMap.set(String(u.id), shortCuid());
    }
  }
  if (usersReused > 0) log.push(`${usersReused} user(s) matched live emails — re-parenting onto existing rows`);

  // Step 4 — insert in dependency order inside a transaction.
  await prisma.$transaction(async (tx) => {
    // Orgs (always new)
    for (const o of (payload.tables.Org as AnyRow[]).filter((o) => orgSet.has(String(o.id)))) {
      await tx.org.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ...convertDates("Org", o), id: orgIdMap.get(String(o.id))! } as any,
      });
      inserted.Org = (inserted.Org ?? 0) + 1;
    }
    // Users — skip if remapped to existing live user
    for (const u of selectedUsers) {
      const email = String(u.email ?? "");
      if (liveExistingByEmail.has(email)) continue;
      await tx.user.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { ...convertDates("User", u), id: userIdMap.get(String(u.id))! } as any,
      });
      inserted.User = (inserted.User ?? 0) + 1;
    }
    // OrgMembers — only (orgId, userId) pairs where BOTH are in scope.
    // The unique constraint catches re-used users that are already members
    // of the live org; silently skip those.
    for (const m of payload.tables.OrgMember as AnyRow[]) {
      const oId = String(m.orgId);
      const uId = String(m.userId);
      if (!orgSet.has(oId) || !userSet.has(uId)) continue;
      const newOrg = orgIdMap.get(oId)!;
      const newUser = userIdMap.get(uId)!;
      try {
        await tx.orgMember.create({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: {
            ...convertDates("OrgMember", m),
            id: shortCuid(),
            orgId: newOrg,
            userId: newUser,
          } as any,
        });
        inserted.OrgMember = (inserted.OrgMember ?? 0) + 1;
      } catch {
        // unique [orgId, userId] — user is already a member of this org
        // in the live DB. Silent skip.
      }
    }
    // Projects
    for (const p of (payload.tables.Project as AnyRow[]).filter((p) => projectSet.has(String(p.id)))) {
      await tx.project.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...convertDates("Project", p),
          id: projectIdMap.get(String(p.id))!,
          orgId: orgIdMap.get(String(p.orgId))!,
          userId: userIdMap.get(String(p.userId))!,
        } as any,
      });
      inserted.Project = (inserted.Project ?? 0) + 1;
    }
    // Diagrams
    for (const d of (payload.tables.Diagram as AnyRow[]).filter((d) => diagramSet.has(String(d.id)))) {
      const projectId = d.projectId ? projectIdMap.get(String(d.projectId)) ?? null : null;
      await tx.diagram.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...convertDates("Diagram", d),
          id: diagramIdMap.get(String(d.id))!,
          orgId: orgIdMap.get(String(d.orgId))!,
          userId: userIdMap.get(String(d.userId))!,
          projectId,
          // Additive restore does not carry PublishedVersion rows, so a
          // published diagram's pointer would dangle and fail the FK
          // (audit DATA-03). Drop it and the diagramOwner pointer (the
          // owner may not be in the selected subtree); the diagram lands
          // as an editable copy without published lineage.
          currentPublishedVersionId: null,
          diagramOwnerId: null,
        } as any,
      });
      inserted.Diagram = (inserted.Diagram ?? 0) + 1;
    }
    // DiagramHistory — for selected diagrams
    for (const h of (payload.tables.DiagramHistory as AnyRow[]).filter(
      (h) => diagramSet.has(String(h.diagramId)),
    )) {
      const userRemap = h.userId ? userIdMap.get(String(h.userId)) ?? null : null;
      await tx.diagramHistory.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...convertDates("DiagramHistory", h),
          id: shortCuid(),
          diagramId: diagramIdMap.get(String(h.diagramId))!,
          userId: userRemap,
        } as any,
      });
      inserted.DiagramHistory = (inserted.DiagramHistory ?? 0) + 1;
    }
    // Templates — only ticked ids. Their owning user must also be in
    // scope (closure) or the row would have a dangling userId. Skip
    // any whose user wasn't selected.
    for (const t of (payload.tables.DiagramTemplate as AnyRow[]).filter(
      (t) => templateSet.has(String(t.id)),
    )) {
      const ownerId = String(t.userId);
      if (!userSet.has(ownerId)) continue;
      await tx.diagramTemplate.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...convertDates("DiagramTemplate", t),
          id: shortCuid(),
          userId: userIdMap.get(ownerId)!,
        } as any,
      });
      inserted.DiagramTemplate = (inserted.DiagramTemplate ?? 0) + 1;
    }
    // Prompts — for (user × org) pairs both in scope
    for (const p of payload.tables.Prompt as AnyRow[]) {
      const uId = String(p.userId);
      const oId = String(p.orgId);
      if (!userSet.has(uId) || !orgSet.has(oId)) continue;
      await tx.prompt.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...convertDates("Prompt", p),
          id: shortCuid(),
          userId: userIdMap.get(uId)!,
          orgId: orgIdMap.get(oId)!,
        } as any,
      });
      inserted.Prompt = (inserted.Prompt ?? 0) + 1;
    }
    // DiagramRules are system-scoped; not part of selective additive
    // restore. Use the wipe path or seed-rules script to update them.
  });

  for (const [model, count] of Object.entries(inserted)) {
    log.push(`  ${model}: ${count} row(s) inserted`);
  }
  log.push("✔ Additive restore complete");
  return { mode: "additive", inserted, log };
}
