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
export const FULL_BACKUP_TABLE_ORDER = [
  "Org",
  "User",
  "OrgMember",
  "Project",
  "Diagram",
  "DiagramHistory",
  "DiagramTemplate",
  "Prompt",
  "DiagramRules",
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
    User: unknown[];
    OrgMember: unknown[];
    Project: unknown[];
    Diagram: unknown[];
    DiagramHistory: unknown[];
    DiagramTemplate: unknown[];
    Prompt: unknown[];
    DiagramRules: unknown[];
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
    orgs, users, orgMembers, projects, diagrams, history,
    templates, prompts, rules,
  ] = await Promise.all([
    prisma.org.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.orgMember.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.project.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagram.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagramHistory.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagramTemplate.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.prompt.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.diagramRules.findMany({ orderBy: { createdAt: "asc" } }),
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
      User: users.length,
      OrgMember: orgMembers.length,
      Project: projects.length,
      Diagram: diagrams.length,
      DiagramHistory: history.length,
      DiagramTemplate: templates.length,
      Prompt: prompts.length,
      DiagramRules: rules.length,
    },
    tables: {
      Org: serialise(orgs as Record<string, unknown>[]),
      User: serialise(users as Record<string, unknown>[]),
      OrgMember: serialise(orgMembers as Record<string, unknown>[]),
      Project: serialise(projects as Record<string, unknown>[]),
      Diagram: serialise(diagrams as Record<string, unknown>[]),
      DiagramHistory: serialise(history as Record<string, unknown>[]),
      DiagramTemplate: serialise(templates as Record<string, unknown>[]),
      Prompt: serialise(prompts as Record<string, unknown>[]),
      DiagramRules: serialise(rules as Record<string, unknown>[]),
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
  Org:             ["createdAt"],
  User:            ["resetTokenExpiry", "createdAt"],
  OrgMember:       ["createdAt"],
  Project:         ["createdAt", "updatedAt"],
  Diagram:         ["createdAt", "updatedAt"],
  DiagramHistory:  ["createdAt"],
  DiagramTemplate: ["createdAt", "updatedAt"],
  Prompt:          ["planUpdatedAt", "createdAt", "updatedAt"],
  DiagramRules:    ["createdAt", "updatedAt"],
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

  await prisma.$transaction(async (tx) => {
    // TRUNCATE every table in reverse dependency order. CASCADE handles
    // residual references, but the explicit order avoids relying solely
    // on cascades and is easier to reason about if a model is added
    // later. `RESTART IDENTITY` is harmless here (all PKs are cuids).
    await tx.$executeRawUnsafe(
      'TRUNCATE TABLE ' +
      '"DiagramRules", "Prompt", "DiagramTemplate", "DiagramHistory", ' +
      '"Diagram", "Project", "OrgMember", "User", "Org" ' +
      'RESTART IDENTITY CASCADE',
    );
    log.push("Truncated all tables");

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
      const data = rows.map((r) => convertDates(model, r as Record<string, unknown>));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyData = data as any[];
      switch (model) {
        case "Org":             await tx.org.createMany({ data: anyData }); break;
        case "User":            await tx.user.createMany({ data: anyData }); break;
        case "OrgMember":       await tx.orgMember.createMany({ data: anyData }); break;
        case "Project":         await tx.project.createMany({ data: anyData }); break;
        case "Diagram":         await tx.diagram.createMany({ data: anyData }); break;
        case "DiagramHistory":  await tx.diagramHistory.createMany({ data: anyData }); break;
        case "DiagramTemplate": await tx.diagramTemplate.createMany({ data: anyData }); break;
        case "Prompt":          await tx.prompt.createMany({ data: anyData }); break;
        case "DiagramRules":    await tx.diagramRules.createMany({ data: anyData }); break;
      }
      inserted[model] = rows.length;
      log.push(`  ${model}: ${rows.length} row(s) inserted`);
    }
  });

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
/** Per (org, user) pair — a user shows up under each org they're a
 *  member of. Selecting a user under one org restores their data in that
 *  org without touching data in others. */
export interface InspectTreeUserInOrg {
  userId: string;
  userEmail: string;
  userName: string | null;
  projects: InspectTreeProject[];
  unfiledDiagrams: InspectTreeDiagram[];
  promptCount: number;
  templateCount: number;
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
  const templatesByUser = new Map<string, number>();
  for (const t of templates) {
    const k = String(t.userId);
    templatesByUser.set(k, (templatesByUser.get(k) ?? 0) + 1);
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
          promptCount: promptsByOrgUser.get(k) ?? 0,
          templateCount: templatesByUser.get(String(user.id)) ?? 0,
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
    // Templates — for selected users (user-scoped, no org coupling)
    for (const t of (payload.tables.DiagramTemplate as AnyRow[]).filter(
      (t) => userSet.has(String(t.userId)),
    )) {
      await tx.diagramTemplate.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: {
          ...convertDates("DiagramTemplate", t),
          id: shortCuid(),
          userId: userIdMap.get(String(t.userId))!,
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
