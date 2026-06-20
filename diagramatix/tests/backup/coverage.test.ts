/**
 * Backup coverage guard.
 *
 * The full backup is now catalog-driven, so it enumerates every table
 * automatically — but these tests PROVE it: every catalog table must have a
 * working Prisma delegate, the insert order must cover all tables and break
 * the one FK cycle, and the previously-missed Entity tables must be present.
 *
 * The third test is the real safety net for the SCOPED (org / user) backups:
 * every catalog table must be either covered by a scoped backup or listed in
 * SCOPED_OMITTED. Add a new model to the schema and this fails until you make
 * a CONSCIOUS choice — which is exactly what was missing when EntityList /
 * EntityNode / ScannerRule slipped through the hand-maintained lists.
 */
import { describe, it, expect } from "vitest";
import { prisma } from "@/app/lib/db";
import { getBackupSchema, delegateName } from "@/app/lib/backupSchema";

type Delegate = { findMany?: unknown };
const delegateFor = (table: string): Delegate =>
  (prisma as unknown as Record<string, Delegate>)[delegateName(table)];

// Tables the org backup carries (scoped to one org). The user backup carries
// a narrower subset of these — both are accounted for here.
const SCOPED_COVERED = new Set<string>([
  "Org", "User", "UsageCounter", "OrgMember", "Project", "Diagram",
  "DiagramHistory", "DiagramTemplate", "Prompt", "DiagramRules",
  "EntityList", "EntityNode",
]);

// Tables the scoped backups deliberately DON'T carry — publish lineage,
// review workflow, cross-tenant config, notifications. Only the SuperAdmin
// full backup carries these. A new table lands here only as a conscious
// decision.
const SCOPED_OMITTED = new Set<string>([
  "ProjectShare", "PublishedVersion", "PublicationBundle", "PublicationBundleDiagram",
  "PublicationBundleAudience", "PendingBundleAudience", "DiagramFeedback", "Notification",
  "CollaborationGroup", "CollaborationGroupMember", "DiagramReview", "DiagramReviewer",
  "OwnershipTransfer", "ScannerRule", "SubscriptionLevel", "Feature", "BubbleHelp",
  "DiagramTypeStyle",
  // Simulator: project/org-scoped teams + project-scoped studies/scenarios/
  // runs. The full SuperAdmin backup carries these (catalog-driven); wiring
  // them into the SCOPED org/user backups so a project backup round-trips a
  // whole simulation is a deliberate follow-up.
  "SimulationTeam", "SimulationStudy", "SimulationStudyRoot",
  "SimulationScenario", "SimulationRun",
]);

describe("backup coverage", () => {
  it("the full backup enumerates every catalog table with a working delegate", async () => {
    const schema = await getBackupSchema();
    expect(schema.tables.length).toBeGreaterThan(0);
    for (const t of schema.tables) {
      expect(typeof delegateFor(t)?.findMany, `no Prisma delegate for table ${t}`).toBe("function");
    }
    // The three tables that were silently missing before the catalog rewrite.
    for (const t of ["EntityList", "EntityNode", "ScannerRule"]) {
      expect(schema.tables, `${t} must be in the full backup`).toContain(t);
    }
  });

  it("orders all tables and defers the Diagram↔PublishedVersion cycle", async () => {
    const schema = await getBackupSchema();
    expect(schema.insertOrder.length).toBe(schema.tables.length);
    expect(
      schema.deferred.some((d) => d.child === "Diagram" && d.parent === "PublishedVersion"),
    ).toBe(true);
  });

  it("scoped backups account for every catalog table (covered or consciously omitted)", async () => {
    const schema = await getBackupSchema();
    const unaccounted = schema.tables.filter(
      (t) => !SCOPED_COVERED.has(t) && !SCOPED_OMITTED.has(t),
    );
    expect(
      unaccounted,
      `New table(s) not wired into the org/user backup — cover them or add to SCOPED_OMITTED: ${unaccounted.join(", ")}`,
    ).toEqual([]);
  });
});
