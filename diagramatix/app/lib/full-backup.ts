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
