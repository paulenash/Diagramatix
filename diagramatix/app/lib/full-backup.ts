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
import { assertZipWithinLimit } from "@/app/lib/uploadLimit";
import { prisma } from "./db";
import { SCHEMA_VERSION } from "./diagram/types";
import { getBackupSchema, reviveDates, delegateName } from "./backupSchema";

export const FULL_BACKUP_KIND = "diagramatix-full-backup";
const FULL_BACKUP_ENTRY = "full-backup.json";

// The model list, insert/truncate order, the Date-column map and the cyclic
// Diagram↔PublishedVersion deferral are ALL derived from the live Postgres
// catalog (see backupSchema.ts) — so a new table is backed up + restored
// automatically and can never be silently dropped or cascade-deleted.

export interface FullBackupPayload {
  schemaVersion: string;
  appVersion: string;
  exportedAt: string;
  kind: typeof FULL_BACKUP_KIND;
  /** Email of the admin who exported. Helps the recipient identify the
   *  snapshot's origin without opening the entire payload. */
  exportedBy: string;
  /** Insertion order (catalog-derived) frozen at export time, for human
   *  inspection. Restore recomputes its own order from the live catalog. */
  tableOrder: readonly string[];
  /** Row counts per table — quick sanity-check after upload, before any
   *  destructive restore action. */
  counts: Record<string, number>;
  /** Raw row dumps, keyed by table (= Prisma model) name. Each value is an
   *  array of the table's full row shape; Date columns are pre-serialised to
   *  ISO strings, Json columns are pass-through objects. Keyed dynamically so
   *  a new table flows through without a type change here. Known keys
   *  (Org/User/Project/Diagram/…) are still accessed directly by the
   *  inspect + additive-restore paths. */
  tables: Record<string, unknown[]>;
}

/** Per-section progress callback for the streaming backup endpoints. Fired
 *  once per table as it's fetched (and once for the final compression step
 *  with count 0). */
export type BackupProgressFn = (label: string, count: number) => void;

/** Build a full system backup. Caller is responsible for authorisation
 *  (superuser only) and for setting an appropriate filename / Content-
 *  Disposition on the response. `onProgress` (optional) is fired per table
 *  so the request can stream live progress — tables are therefore fetched
 *  sequentially in dependency order rather than in parallel. */
export async function buildFullBackup(
  exportedBy: string,
  appVersion: string,
  onProgress?: BackupProgressFn,
): Promise<Uint8Array> {
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

  // Every table, in catalog-derived dependency order. Fetched sequentially so
  // onProgress can report each table as it lands (dataset is small at pilot
  // scale). A new table is picked up automatically — no edits here.
  const schema = await getBackupSchema();
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const counts: Record<string, number> = {};
  const tables: Record<string, unknown[]> = {};
  for (const table of schema.insertOrder) {
    const delegate = (prisma as any)[delegateName(table)];
    if (!delegate?.findMany) continue; // table with no client delegate — skip
    const rows = (await delegate.findMany()) as Record<string, unknown>[];
    counts[table] = rows.length;
    tables[table] = serialise(rows);
    onProgress?.(table, rows.length);
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const payload: FullBackupPayload = {
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    kind: FULL_BACKUP_KIND,
    exportedBy,
    tableOrder: schema.insertOrder,
    counts,
    tables,
  };

  onProgress?.("Compressing", 0);
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
  assertZipWithinLimit(zip); // IO-01: refuse zip bombs before decompressing entries
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
  mode: "wipe" | "additive" | "tables";
  inserted: Record<string, number>;
  log: string[];
}

// The timestamp columns to revive (ISO string → Date) are derived from the
// live catalog (backupSchema). A module-level cache lets every existing
// convertDates(model, row) call site stay unchanged; each restore primes it
// from getBackupSchema() before inserting.
let _timestampColumns: Record<string, string[]> = {};
function convertDates(model: string, row: Record<string, unknown>): Record<string, unknown> {
  return reviveDates(model, row, _timestampColumns);
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

  // Catalog-derived plan: model list, insert order, timestamp columns, the
  // cyclic-FK deferral, and primary keys all come from the live database.
  const schema = await getBackupSchema();
  _timestampColumns = schema.timestampColumns;

  // ── Guard (audit DATA-02) ────────────────────────────────────────────
  // A wipe restore TRUNCATEs the ENTIRE schema (CASCADE). If this backup
  // predates a table that now exists AND that live table holds rows, the
  // cascade would delete those rows with nothing in the payload to
  // re-insert — silent data loss. Refuse rather than destroy.
  const payloadTables = new Set(Object.keys(payload.tables ?? {}));
  const missingTables = schema.tables.filter((t) => !payloadTables.has(t));
  if (missingTables.length > 0) {
    const liveNonEmpty: string[] = [];
    for (const t of missingTables) {
      // Table names come from the catalog, never user input — safe to interpolate.
      const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM "${t}"`,
      );
      if (Number(rows[0]?.c ?? 0) > 0) liveNonEmpty.push(t);
    }
    if (liveNonEmpty.length > 0) {
      throw new Error(
        `Refusing wipe restore: this backup predates ${liveNonEmpty.length} ` +
        `table(s) that currently hold live data (${liveNonEmpty.join(", ")}). ` +
        `A wipe restore would permanently delete those rows with nothing to ` +
        `re-insert. Export a fresh full backup (schema ${SCHEMA_VERSION}) and ` +
        `restore that, or use additive-selective restore instead.`,
      );
    }
    log.push(`Note: backup omits ${missingTables.length} newer table(s); all empty live — safe to proceed.`);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  await prisma.$transaction(async (tx) => {
    // TRUNCATE every table. CASCADE + RESTART IDENTITY; all PKs are cuids so
    // identity restart is harmless. CASCADE handles FK order, so a simple
    // catalog-derived list (any order) is safe.
    const quoted = schema.tables.map((t) => `"${t}"`).join(", ");
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);
    log.push(`Truncated ${schema.tables.length} tables`);

    // Cyclic nullable FK edges (e.g. Diagram.currentPublishedVersionId →
    // PublishedVersion) are deferred: insert the child with those columns
    // NULL, then re-link after the parent table lands. Derived generically.
    const deferByChild = new Map<string, Set<string>>();
    for (const d of schema.deferred) {
      const set = deferByChild.get(d.child) ?? new Set<string>();
      d.columns.forEach((c) => set.add(c));
      deferByChild.set(d.child, set);
    }
    const relinks: Array<{ table: string; where: Record<string, unknown>; data: Record<string, unknown> }> = [];

    // Re-insert in forward dependency order. Delegate dispatch via the
    // camelCased table name; createMany rejects unknown fields at runtime,
    // which still catches schema drift between backup and current code.
    for (const table of schema.insertOrder) {
      const rows = (payload.tables[table] ?? []) as Record<string, unknown>[];
      if (rows.length === 0) { inserted[table] = 0; continue; }
      const deferCols = deferByChild.get(table);
      const pkCols = schema.primaryKey[table] ?? ["id"];
      const data = rows.map((r) => {
        const row = convertDates(table, r);
        if (deferCols && deferCols.size > 0) {
          const captured: Record<string, unknown> = {};
          let hasVal = false;
          for (const c of deferCols) {
            if (row[c] != null) { captured[c] = row[c]; hasVal = true; }
          }
          if (hasVal) {
            if (pkCols.length !== 1) {
              throw new Error(`Cannot re-link deferred FK on "${table}": composite primary key unsupported`);
            }
            relinks.push({ table, where: { [pkCols[0]]: row[pkCols[0]] }, data: captured });
          }
          const nulled = { ...row };
          for (const c of deferCols) nulled[c] = null;
          return nulled;
        }
        return row;
      });
      const delegate = (tx as any)[delegateName(table)];
      if (!delegate?.createMany) continue;
      await delegate.createMany({ data: data as any[] });
      inserted[table] = rows.length;
      log.push(`  ${table}: ${rows.length} row(s) inserted`);
    }

    // Re-link deferred FK pointers now that every parent row exists.
    for (const r of relinks) {
      await (tx as any)[delegateName(r.table)].update({ where: r.where, data: r.data });
    }
    if (relinks.length > 0) {
      log.push(`  Re-linked ${relinks.length} deferred FK pointer(s)`);
    }
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

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
// Restore — per-table (additive upsert of a chosen subset of tables)
// ──────────────────────────────────────────────────────────────────────────

/** Restore ONLY the named tables, additively: every row is upserted by its
 *  primary key (existing rows updated, missing rows inserted). NOTHING is
 *  truncated or deleted, so rows not present in the backup are left untouched.
 *  Tables are processed in dependency order; rows whose foreign keys can't be
 *  satisfied (e.g. a referenced row that was neither selected nor already live)
 *  are skipped-with-warning rather than aborting the batch. Deferred cyclic FK
 *  pointers are re-linked at the end, best-effort.
 *
 *  Power-user / recovery tool — the caller MUST gate on superuser and warn.
 *  Selecting a parent table without its children (or vice-versa) is allowed;
 *  the per-row skip log shows anything that couldn't land. */
export async function restoreFullBackupTables(
  payload: FullBackupPayload,
  selectedTables: string[],
): Promise<FullRestoreResult> {
  const schema = await getBackupSchema();
  _timestampColumns = schema.timestampColumns;
  const valid = new Set(schema.tables);
  const wanted = new Set(selectedTables.filter((t) => valid.has(t)));
  const inserted: Record<string, number> = {};
  const log: string[] = [];
  log.push(`Full backup created ${payload.exportedAt} by ${payload.exportedBy}`);
  log.push(`Per-table additive restore of ${wanted.size} table(s): ${[...wanted].join(", ") || "(none)"}`);

  // Deferred cyclic-FK columns by child table (insert/upsert with them NULL,
  // re-link after every selected table has landed).
  const deferByChild = new Map<string, Set<string>>();
  for (const d of schema.deferred) {
    const set = deferByChild.get(d.child) ?? new Set<string>();
    d.columns.forEach((c) => set.add(c));
    deferByChild.set(d.child, set);
  }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const relinks: Array<{ table: string; where: any; data: Record<string, unknown> }> = [];

  // DATA-26: run the WHOLE per-table restore (upserts + the deferred-FK re-link
  // pass) inside ONE interactive transaction, so a mid-batch crash rolls back to
  // the pre-restore state instead of leaving a half-merged DB — matching the
  // wipe/additive paths and restoreRulesPrefsBundle. Per-row SAVEPOINTs preserve
  // the "skip a bad row and continue" behaviour: in Postgres a failed statement
  // otherwise aborts the entire transaction, so the previous bare try/catch could
  // not have survived inside a transaction.
  let relinked = 0;
  await prisma.$transaction(async (tx) => {
    // Forward dependency order so a selected parent lands before a selected child.
    for (const table of schema.insertOrder) {
      if (!wanted.has(table)) continue;
      const rows = (payload.tables[table] ?? []) as Record<string, unknown>[];
      const delegate = (tx as any)[delegateName(table)];
      if (!delegate?.upsert) { log.push(`  ${table}: no client delegate — skipped`); continue; }
      const pkCols = schema.primaryKey[table] ?? ["id"];
      const deferCols = deferByChild.get(table);
      const uniqueSets = schema.uniqueKeys[table] ?? [];          // DATA-27
      const nullableFks = schema.nullableFkColumns[table] ?? [];  // DATA-28
      let ins = 0, upd = 0, skp = 0;

      for (const raw of rows) {
        const row = convertDates(table, raw);
        // Null any deferred FK columns on write; capture them for the re-link pass.
        let writeRow: Record<string, unknown> = row;
        if (deferCols && deferCols.size > 0) {
          const captured: Record<string, unknown> = {};
          let hasVal = false;
          for (const c of deferCols) if (row[c] != null) { captured[c] = row[c]; hasVal = true; }
          writeRow = { ...row };
          for (const c of deferCols) writeRow[c] = null;
          if (hasVal && pkCols.length === 1) {
            relinks.push({ table, where: { [pkCols[0]]: row[pkCols[0]] }, data: captured });
          }
        }
        // PK-based where: single column, or Prisma's compound-key input (a_b).
        const where = pkCols.length === 1
          ? { [pkCols[0]]: writeRow[pkCols[0]] }
          : { [pkCols.join("_")]: Object.fromEntries(pkCols.map((c) => [c, writeRow[c]])) };
        // Update payload excludes the PK columns (identity stays put).
        const updateData = { ...writeRow };
        for (const c of pkCols) delete updateData[c];
        // DATA-25: do NOT overwrite an EXISTING live row's deferred cyclic-FK
        // columns with NULL — that would strip a live published diagram's
        // currentPublishedVersionId when PublishedVersion isn't co-selected.
        // Omit them from the UPDATE payload (so the live pointer is preserved);
        // the re-link pass re-applies the backup's value when its target exists.
        if (deferCols) for (const c of deferCols) delete updateData[c];

        const idWhereOf = (r2: Record<string, unknown>) => pkCols.length === 1
          ? { [pkCols[0]]: r2[pkCols[0]] }
          : { [pkCols.join("_")]: Object.fromEntries(pkCols.map((c) => [c, r2[c]])) };
        // Resolve an existing row by PK, then (DATA-27) by any secondary unique
        // key — so a row with a fresh PK that collides on e.g. User.email or
        // DiagramRules(category,userId,orgId) UPDATES the live row instead of
        // throwing a unique-violation and being silently skipped.
        const findExisting = async (): Promise<Record<string, unknown> | null> => {
          const byPk = await delegate.findUnique({ where });
          if (byPk) return byPk;
          for (const cols of uniqueSets) {
            if (cols.some((c) => writeRow[c] == null)) continue;
            const m = await delegate.findFirst({ where: Object.fromEntries(cols.map((c) => [c, writeRow[c]])) });
            if (m) return m;
          }
          return null;
        };
        // One write attempt. nullFks=true nulls every nullable cross-table FK
        // first (DATA-28) so a row whose optional FK points at an absent target
        // still lands (empty slot) rather than being dropped.
        const attempt = async (nullFks: boolean): Promise<"ins" | "upd"> => {
          const cr: Record<string, unknown> = nullFks ? { ...writeRow } : writeRow;
          const up: Record<string, unknown> = nullFks ? { ...updateData } : updateData;
          if (nullFks) for (const c of nullableFks) { cr[c] = null; up[c] = null; }
          const existing = await findExisting();
          if (existing) { await delegate.update({ where: idWhereOf(existing), data: up as any }); return "upd"; }
          await delegate.create({ data: cr as any });
          return "ins";
        };

        await tx.$executeRawUnsafe("SAVEPOINT dgx_row");
        try {
          const r = await attempt(false);
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT dgx_row");
          if (r === "upd") upd++; else ins++;
        } catch (e) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT dgx_row");
          let recovered = false;
          if (nullableFks.length > 0) {
            try {
              const r = await attempt(true);
              await tx.$executeRawUnsafe("RELEASE SAVEPOINT dgx_row");
              if (r === "upd") upd++; else ins++;
              recovered = true;
              log.push(`    ${table} ${JSON.stringify(where)}: nulled absent FK(s) [${nullableFks.join(",")}] and restored`);
            } catch {
              await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT dgx_row");
              await tx.$executeRawUnsafe("RELEASE SAVEPOINT dgx_row");
            }
          } else {
            await tx.$executeRawUnsafe("RELEASE SAVEPOINT dgx_row");
          }
          if (!recovered) {
            skp++;
            const msg = e instanceof Error ? e.message.split("\n").slice(-1)[0].trim() : String(e);
            log.push(`    skipped ${table} ${JSON.stringify(where)}: ${msg}`);
          }
        }
      }
      inserted[table] = ins;
      log.push(`  ${table}: ${ins} inserted, ${upd} updated${skp ? `, ${skp} skipped` : ""}`);
    }

    // Re-link deferred FK pointers now the selected parents exist (best-effort;
    // a pointer to a non-restored, non-live target simply stays NULL).
    for (const r of relinks) {
      await tx.$executeRawUnsafe("SAVEPOINT dgx_relink");
      try {
        await (tx as any)[delegateName(r.table)].update({ where: r.where, data: r.data });
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT dgx_relink");
        relinked++;
      } catch {
        await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT dgx_relink");
        await tx.$executeRawUnsafe("RELEASE SAVEPOINT dgx_relink");
        /* target absent — leave the column NULL */
      }
    }
  }, { timeout: 120_000, maxWait: 15_000 });
  if (relinks.length > 0) log.push(`  Re-linked ${relinked}/${relinks.length} deferred FK pointer(s)`);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  log.push("✔ Per-table restore complete");
  return { mode: "tables", inserted, log };
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
  // Prime the catalog-derived timestamp map so convertDates() revives the
  // right columns for each model.
  _timestampColumns = (await getBackupSchema()).timestampColumns;

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
    // DATA-12: only follow a projectId that resolves to a real backup row.
    if (d.projectId && projectsById.has(String(d.projectId))) projectSet.add(String(d.projectId));
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
  // DATA-12: only allocate a remapped id for project ids that resolve to a real
  // backup row. Otherwise the diagram's `projectId ? map.get() ?? null` below
  // would receive a freshly-minted cuid that never gets inserted → dangling FK.
  for (const id of projectSet) if (projectsById.has(id)) projectIdMap.set(id, shortCuid());
  for (const id of diagramSet) diagramIdMap.set(id, shortCuid());
  let usersReused = 0;
  for (const u of selectedUsers) {
    const email = String(u.email ?? "");
    const live = liveExistingByEmail.get(email);
    if (live) {
      userIdMap.set(String(u.id), live);
      usersReused++;
      // DATA-11: additive restore identifies users by EMAIL ALONE (a global-
      // identity assumption) and re-parents the backup user's data onto the
      // matched live row. Audit every reuse so an admin can catch data attached
      // to an unintended account in another context.
      log.push(`  reused live user for ${email} → ${live} (data re-parented onto existing row)`);
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
