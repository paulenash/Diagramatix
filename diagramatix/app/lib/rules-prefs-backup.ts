/**
 * AI Rules + Prompts export/import bundle.
 *
 * Targets the two tables that hold AI-related configuration:
 *   • `DiagramRules` — admin-managed prompt-engineering rules per
 *     diagram category (general/bpmn/state-machine/etc.). May be
 *     system-wide (`isDefault=true`, `userId`/`orgId` null) or scoped
 *     to a specific user+org pair.
 *   • `Prompt` — user-saved AI prompts (with an optional cached
 *     2-phase plan in `planJson`).
 *
 * Designed for the "migrate local-dev DB to prod web DB" use case:
 *   1. Admin clicks Export on local → downloads `<timestamp>.diag-rules`
 *   2. Admin uploads same file on prod → existing rows with matching
 *      `id` are UPDATED, missing rows are INSERTED. Rows that exist
 *      only on the target are left untouched (additive merge, never
 *      delete). User and Org foreign keys are validated; rows
 *      referencing a non-existent user/org are skipped with a warning.
 *
 * Format: a flat JSON object the API serialises directly. No streaming;
 * payloads are tiny (a few hundred rows max).
 */
import { prisma } from "@/app/lib/db";
import { type BackupProgressFn } from "@/app/lib/full-backup";

export interface RulesPrefsBundle {
  schemaVersion: "1.0";
  exportedAt: string;
  exportedBy: string;             // user email of the exporting admin
  counts: {
    rules: number;
    prompts: number;
  };
  rules: Array<{
    id: string;
    category: string;
    rules: string;
    isDefault: boolean;
    userId: string | null;
    orgId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  prompts: Array<{
    id: string;
    name: string;
    text: string;
    diagramType: string;
    userId: string;
    orgId: string;
    planJson: unknown | null;
    planUpdatedAt: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export async function buildRulesPrefsBundle(
  exportedByEmail: string,
  onProgress?: BackupProgressFn,
): Promise<RulesPrefsBundle> {
  // Sequential so the streaming export can report each section live.
  const rules = await prisma.diagramRules.findMany();
  onProgress?.("Rules", rules.length);
  const prompts = await prisma.prompt.findMany();
  onProgress?.("Prompts", prompts.length);
  return {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    exportedBy: exportedByEmail,
    counts: { rules: rules.length, prompts: prompts.length },
    rules: rules.map((r) => ({
      id: r.id,
      category: r.category,
      rules: r.rules,
      isDefault: r.isDefault,
      userId: r.userId,
      orgId: r.orgId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    prompts: prompts.map((p) => ({
      id: p.id,
      name: p.name,
      text: p.text,
      diagramType: p.diagramType,
      userId: p.userId,
      orgId: p.orgId,
      planJson: p.planJson as unknown,
      planUpdatedAt: p.planUpdatedAt ? p.planUpdatedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  };
}

export interface RulesPrefsRestoreResult {
  rules: { inserted: number; updated: number; skipped: number; skippedReasons: string[] };
  prompts: { inserted: number; updated: number; skipped: number; skippedReasons: string[] };
}

/**
 * Additive merge: upsert each row by `id`. Existing rows with that id
 * are updated; new rows are inserted. Prompts referencing a user or
 * org that doesn't exist on the target DB are skipped (with the row
 * id added to skippedReasons) rather than failing the whole import,
 * so a partial migration still works.
 */
export async function restoreRulesPrefsBundle(
  bundle: RulesPrefsBundle,
): Promise<RulesPrefsRestoreResult> {
  if (bundle.schemaVersion !== "1.0") {
    throw new Error(`Unsupported schemaVersion: ${bundle.schemaVersion}`);
  }

  const result: RulesPrefsRestoreResult = {
    rules: { inserted: 0, updated: 0, skipped: 0, skippedReasons: [] },
    prompts: { inserted: 0, updated: 0, skipped: 0, skippedReasons: [] },
  };

  // Validate FK targets up front: load the set of existing user IDs and
  // org IDs once so we can skip-with-warning rather than fail-the-batch
  // on a missing reference.
  const [existingUsers, existingOrgs] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.org.findMany({ select: { id: true } }),
  ]);
  const userIds = new Set(existingUsers.map((u) => u.id));
  const orgIds = new Set(existingOrgs.map((o) => o.id));

  // ── DiagramRules ────────────────────────────────────────────────────────
  for (const r of bundle.rules) {
    // FK check: userId/orgId may be null (system-wide rule); if set,
    // both must exist on target.
    if (r.userId !== null && !userIds.has(r.userId)) {
      result.rules.skipped++;
      result.rules.skippedReasons.push(`rule ${r.id} (${r.category}): user ${r.userId} not found`);
      continue;
    }
    if (r.orgId !== null && !orgIds.has(r.orgId)) {
      result.rules.skipped++;
      result.rules.skippedReasons.push(`rule ${r.id} (${r.category}): org ${r.orgId} not found`);
      continue;
    }
    const existing = await prisma.diagramRules.findUnique({ where: { id: r.id } });
    if (existing) {
      await prisma.diagramRules.update({
        where: { id: r.id },
        data: {
          category: r.category,
          rules: r.rules,
          isDefault: r.isDefault,
          userId: r.userId,
          orgId: r.orgId,
        },
      });
      result.rules.updated++;
    } else {
      await prisma.diagramRules.create({
        data: {
          id: r.id,
          category: r.category,
          rules: r.rules,
          isDefault: r.isDefault,
          userId: r.userId,
          orgId: r.orgId,
        },
      });
      result.rules.inserted++;
    }
  }

  // ── Prompts ─────────────────────────────────────────────────────────────
  for (const p of bundle.prompts) {
    if (!userIds.has(p.userId)) {
      result.prompts.skipped++;
      result.prompts.skippedReasons.push(`prompt ${p.id} (${p.name}): user ${p.userId} not found`);
      continue;
    }
    if (!orgIds.has(p.orgId)) {
      result.prompts.skipped++;
      result.prompts.skippedReasons.push(`prompt ${p.id} (${p.name}): org ${p.orgId} not found`);
      continue;
    }
    const existing = await prisma.prompt.findUnique({ where: { id: p.id } });
    // Prisma 7's typed update doesn't include JSON fields in the schema
    // graph — JSON has to be cast (project convention). `planJson` may
    // legitimately be null; both casts handle that.
    const planJsonCast = p.planJson as never;
    if (existing) {
      await prisma.prompt.update({
        where: { id: p.id },
        data: {
          name: p.name,
          text: p.text,
          diagramType: p.diagramType,
          userId: p.userId,
          orgId: p.orgId,
          planJson: planJsonCast,
          planUpdatedAt: p.planUpdatedAt ? new Date(p.planUpdatedAt) : null,
        },
      });
      result.prompts.updated++;
    } else {
      await prisma.prompt.create({
        data: {
          id: p.id,
          name: p.name,
          text: p.text,
          diagramType: p.diagramType,
          userId: p.userId,
          orgId: p.orgId,
          planJson: planJsonCast,
          planUpdatedAt: p.planUpdatedAt ? new Date(p.planUpdatedAt) : null,
        },
      });
      result.prompts.inserted++;
    }
  }

  return result;
}
