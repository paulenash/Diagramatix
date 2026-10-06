// Server-only. The one-time move of everything a SuperAdmin owns from their OLD address's account to their NEW one
// (Paul, 2026-10-05: "When Paul or Greg log in welcome them as SuperAdmin users … get them to confirm copying all
// existing projects, memberships and any reference from their old SuperAdmin address to their new SuperAdmin
// addresses."). Decided with Paul: MOVE ownership (re-point every reference), prompted once after login, never again.
import type { PoolClient } from "pg";
import { pgPool } from "@/app/lib/db";

/** New SuperAdmin address → the old one whose data moves to it. Lowercase. */
export const SUPERADMIN_MIGRATIONS: Readonly<Record<string, string>> = {
  "paul@diagramatix.com.au": "paul@nashcc.com.au",
  "greg@diagramatix.com.au": "greg.nash@getai.com.au",
};

/** The old address for a new SuperAdmin address, or null when this address is not one of the new ones. */
export function oldAddressFor(email: string | null | undefined): string | null {
  return (email && SUPERADMIN_MIGRATIONS[email.toLowerCase()]) || null;
}

/**
 * References that are NOT moved. Credentials and per-person machinery stay with the account they belong to — an AI key, a
 * Microsoft connection, a usage counter, live presence — and an API key's service user is a machine's.
 */
export const NOT_MOVED: ReadonlySet<string> = new Set(["MicrosoftConnection", "UserAiKey", "UsageCounter", "DiagramPresence", "ApiKey"]);

/** Where "this has been done" is recorded (an AppSetting, one per new account). The audit trail is never re-attributed. */
export const MIGRATION_SETTING_PREFIX = "superadmin.migrated.";
export const migrationSettingKey = (newUserId: string) => MIGRATION_SETTING_PREFIX + newUserId;
/** Where "the welcome has been shown (and dismissed)" is recorded, once per account, so it is never shown again. */
export const welcomedSettingKey = (newUserId: string) => "superadmin.welcomed." + newUserId;

const LABELS: Record<string, string> = {
  Project: "projects",
  Diagram: "diagrams",
  DiagramTemplate: "templates",
  Prompt: "prompts",
  DiagramRules: "diagram rule sets",
  OrgMember: "organisation memberships",
  OrgMemberTeam: "team memberships",
  ProjectShare: "project shares",
  Notification: "notifications",
  CollaborationGroup: "collaboration groups",
  CollaborationGroupMember: "collaboration group memberships",
  DiagramReview: "review requests",
  DiagramReviewer: "reviews assigned",
  DiagramFeedback: "feedback notes",
  PublishedVersion: "published versions",
  PublicationBundle: "publication bundles",
  PublicationBundleAudience: "bundle audience entries",
  SimulationStudy: "simulation studies",
  SimulationExample: "simulation examples",
  MiningExample: "mining examples",
  ProcessDiffRun: "process comparisons",
  OwnershipTransfer: "ownership transfers",
};
export const labelFor = (table: string) => LABELS[table] ?? table;

export interface RefCount { table: string; column: string; count: number }

/** Every column that points at a User, read from the database's own foreign keys — so a new table is covered with no edit here. */
async function userReferences(c: PoolClient): Promise<{ table: string; column: string }[]> {
  const r = await c.query<{ t: string; col: string }>(
    `SELECT c.conrelid::regclass::text AS t, a.attname AS col
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND c.confrelid = '"User"'::regclass AND c.conrelid <> '"User"'::regclass
      ORDER BY 1, 2`,
  );
  return r.rows
    .map((x) => ({ table: x.t.replace(/^"|"$/g, ""), column: x.col }))
    .filter((x) => !NOT_MOVED.has(x.table));
}
const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

/** What an account owns, by table and column (zero counts left out). */
export async function countReferences(userId: string): Promise<RefCount[]> {
  const c = await pgPool.connect();
  try {
    const out: RefCount[] = [];
    for (const ref of await userReferences(c)) {
      const r = await c.query<{ n: string }>(`SELECT count(*) AS n FROM ${q(ref.table)} WHERE ${q(ref.column)} = $1`, [userId]);
      const count = Number(r.rows[0].n);
      if (count > 0) out.push({ ...ref, count });
    }
    return out;
  } finally {
    c.release();
  }
}

export interface MoveResult { moved: RefCount[]; skipped: RefCount[] }

/**
 * Re-point every reference from `oldId` to `newId`, in ONE transaction. A table where the new account already holds an
 * equivalent row (a membership both have, say) cannot take the whole move at once, so it is moved row by row and the rows that
 * clash are left with the old account and reported — nothing is overwritten and nothing is deleted.
 */
export async function moveReferences(oldId: string, newId: string): Promise<MoveResult> {
  const c = await pgPool.connect();
  const moved: RefCount[] = [], skipped: RefCount[] = [];
  try {
    await c.query("BEGIN");
    for (const ref of await userReferences(c)) {
      const t = q(ref.table), col = q(ref.column);
      await c.query("SAVEPOINT s");
      try {
        const r = await c.query(`UPDATE ${t} SET ${col} = $2 WHERE ${col} = $1`, [oldId, newId]);
        await c.query("RELEASE SAVEPOINT s");
        if (r.rowCount) moved.push({ ...ref, count: r.rowCount });
      } catch (e) {
        await c.query("ROLLBACK TO SAVEPOINT s");
        if ((e as { code?: string }).code !== "23505") throw e;     // only a clash is tolerated; anything else undoes the lot
        const rows = await c.query<{ id: string }>(`SELECT ctid::text AS id FROM ${t} WHERE ${col} = $1`, [oldId]);
        let ok = 0, clash = 0;
        for (const row of rows.rows) {
          await c.query("SAVEPOINT r");
          try { await c.query(`UPDATE ${t} SET ${col} = $2 WHERE ctid = $1::tid`, [row.id, newId]); await c.query("RELEASE SAVEPOINT r"); ok++; }
          catch (e2) {
            await c.query("ROLLBACK TO SAVEPOINT r");
            if ((e2 as { code?: string }).code !== "23505") throw e2;
            clash++;
          }
        }
        if (ok) moved.push({ ...ref, count: ok });
        if (clash) skipped.push({ ...ref, count: clash });
      }
    }
    await c.query("COMMIT");
    return { moved, skipped };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** "3 projects, 12 diagrams and 2 organisation memberships" — the same table can appear twice (two columns), so merge by table. */
export function describeCounts(refs: RefCount[]): string {
  const by = new Map<string, number>();
  for (const r of refs) by.set(r.table, (by.get(r.table) ?? 0) + r.count);
  const parts = [...by.entries()].map(([t, n]) => `${n} ${labelFor(t)}`);
  return parts.length <= 1 ? parts.join("") : parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}
