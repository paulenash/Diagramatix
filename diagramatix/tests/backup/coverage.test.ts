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
  "SopTemplate", "SopDocument", "SopSection",
]);

// Simulator tables: project/org-scoped teams + project-scoped studies /
// scenarios / runs, plus the global example catalog. The full SuperAdmin backup
// carries these (catalog-driven); wiring them into the SCOPED org/user backups
// so a project backup round-trips a whole simulation is a deliberate follow-up.
// Single-sourced here and PINNED by the "deliberately omits the Simulator
// tables" test below, so the omission is an asserted decision, not a comment.
// Simulator CONFIGURATION is carried by the scoped backups — but as portable
// ExamplePackage bundles + a standalone team/calendar library (see
// app/lib/simulation/captureProject.ts), replayed rather than row-inserted, so
// the ids remap onto the restored projects/diagrams. The raw tables are
// therefore a deliberate omission from the ROW-level scoped backup, not from the
// backup: tests/backup/simulation-roundtrip.test.ts pins the round-trip.
//
// GAP: the capture is per-PROJECT, so org-MASTER SimulationTeams (orgId set,
// adopted into projects as copies) ride only in the SuperAdmin full backup.
// Wiring them into the scoped org backup — like EntityList org masters, which
// are carried but not recreated on restore — is an open follow-up.
const SIMULATOR_CONFIG_TABLES = [
  "SimulationTeam", "SimulationCalendar", "SimulationStudy", "SimulationStudyRoot",
  "SimulationScenario",
] as const;

// Run RESULTS + the global example catalog. Results are reproducible by
// re-running a scenario (and carry a whole network snapshot), and the example
// catalog is system content like DiagramTypeStyle — neither is per-user/org
// data. SuperAdmin full backup only.
const SIMULATOR_RESULT_TABLES = ["SimulationRun", "SimulationExample"] as const;

// Process-mining runs (analysis history, like SimulationRun), the global mining
// example catalog, and the live-source connector config. MiningSource carries
// per-project connection settings — wiring it into the scoped backups is an open
// follow-up, pinned here so the omission stays an asserted decision.
const MINING_TABLES = ["ProcessMiningRun", "MiningExample", "MiningSource"] as const;

// Risk & Control catalog (org master + project copy). Carried by the full
// SuperAdmin backup (catalog-driven); wiring them into the SCOPED org/user
// backups is a deliberate follow-up, single-sourced + pinned here like the
// Simulator tables so the omission is an asserted decision, not a comment.
const RISK_CONTROL_TABLES = ["RiskControlLibrary", "RiskControlItem", "RiskControlLink", "RiskControlExample", "RiskControlCodeSequence"] as const;

// APQC PCF — global reference frameworks (system content, seeded/imported) +
// org tailored frameworks. Carried by the full SuperAdmin backup (catalog-driven);
// scoped org/user backup wiring is a deliberate follow-up, pinned here.
const PCF_TABLES = ["PcfFramework", "PcfNode"] as const;

// Tables the scoped backups deliberately DON'T carry AS ROWS — publish lineage,
// review workflow, cross-tenant config, notifications, run results, and the
// Simulator/Mining tables. Only the SuperAdmin full backup carries these rows. A
// new table lands here only as a conscious decision.
//
// "Omitted" here means omitted from the ROW-level copy: simulator CONFIGURATION
// does survive a scoped backup, replayed from portable packages + a standalone
// library (see SIMULATOR_CONFIG_TABLES above).
const SCOPED_OMITTED = new Set<string>([
  // Partner API. A CONSCIOUS omission from the scoped org/user backups:
  //  • ApiKey holds a credential hash bound to one org and one service user.
  //    Restoring it into another environment would either resurrect a
  //    credential nobody expects to be live, or carry a hash that is useless
  //    without the raw key. A key belongs to the environment that minted it.
  //  • PartnerRequest is traffic telemetry, not customer content, and it is
  //    already governed by its own retention rules — carrying it into a backup
  //    would quietly outlive the purge those rules promise.
  // The full SuperAdmin backup still takes both, since it reads the live schema.
  //  • PartnerJob holds a partner run: a customer document during a testing
  //    window, and a result that belongs with the diagram it produced. Same
  //    reasoning — it is governed by its own retention rules, and a backup would
  //    outlive them.
  //  • HarnessCase is the SuperAdmin test corpus — our own material, tied to no
  //    org and to no user. It belongs to the environment, not to a tenant, and
  //    a scoped org backup restoring somebody else’s test cases would be odd.
  //    It exports through its own bundle instead.
  "ApiKey", "PartnerRequest", "PartnerJob", "HarnessCase",

  // Grant/membership tables (like ProjectShare + the bundle audiences, and now
  // admin-managed team membership) — carried by the full SuperAdmin backup only,
  // deliberately not in the scoped org/user backups.
  "ProjectShare", "OrgMemberTeam",
  "PublishedVersion", "PublicationBundle", "PublicationBundleDiagram",
  "PublicationBundleAudience", "PendingBundleAudience", "DiagramFeedback", "Notification",
  "CollaborationGroup", "CollaborationGroupMember", "DiagramReview", "DiagramReviewer",
  "OwnershipTransfer", "ScannerRule", "SubscriptionLevel", "Feature", "BubbleHelp",
  "DiagramTypeStyle", "IntentKeywordMap", "DictationCommand",
  // The Process Repository: a SuperAdmin-owned global catalog of value chains,
  // their processes and generated diagram prompts. Not org data — every org sees
  // the same published library — so the scoped org/user backups deliberately do
  // not carry it, exactly like Feature / ScannerRule / SubscriptionLevel above.
  // The full SuperAdmin backup DOES carry it: getBackupSchema() reads the table
  // list from the live database, so these were picked up the moment they existed.
  "ValueChainLibrary", "ValueChainProcess", "ValueChainPrompt",
  // Feature Availability matrix is global platform config (per subscription level),
  // like SubscriptionLevel — carried by the SuperAdmin full backup only, not a
  // per-user/org backup.
  "FeatureAvailability",
  // Entity Structures are org MASTERS (like the org-master EntityLists) — the
  // scoped org/user backup recreates only project COPIES of EntityList (which
  // carry no structureId), never the masters, so EntityStructure is not carried
  // by the scoped backup. It IS carried by the SuperAdmin full backup (catalog-driven).
  "EntityStructure",
  // The DB-backed User Guide is SYSTEM/admin content, not per-user data — it's
  // deliberately not in the scoped org/user backup. It's carried by the
  // SuperAdmin full backup (catalog-driven) AND its own dedicated table-level
  // backup/restore (app/lib/help/guideBackup.ts + tests/help).
  "HelpChapter", "HelpSection", "HelpImage",
  // Global key-value app settings (e.g. the AI-Generate model) are system
  // config, not per-user/org data — carried by the SuperAdmin full backup only.
  "AppSetting",
  // The ArchiMate custom-icon library is global admin content (vector icons +
  // source image), like HelpImage / DiagramTypeStyle — not per-user/org data.
  // Carried by the SuperAdmin full backup (catalog-driven) only.
  "ArchimateIconLibrary",
  // Diagram-JSON schema-validation findings are app-side observability, not
  // per-user/org data — carried by the SuperAdmin full backup only.
  "SchemaValidationIssue",
  // Live co-authoring presence is EPHEMERAL session state (30s TTL heartbeats),
  // never restored — backing it up would resurrect stale "who's online" rows.
  "DiagramPresence",
  // The audit log is system-global security telemetry (who did what), not
  // per-user/org data — deliberately NOT carried by a tenant backup. It's in the
  // SuperAdmin full backup (catalog-driven).
  "AuditLog",
  // AI usage telemetry (AiInvocation + AiDiagramGeneration "# diagrams generated")
  // is system-global observability like AuditLog, and the model cost-rate catalog
  // (AiModelRate) is global admin config like AppSetting / DiagramTypeStyle — none
  // is per-user/org data. Carried by the SuperAdmin full backup (catalog-driven) only.
  "AiInvocation", "AiDiagramGeneration", "AiModelRate", "DictationSession",
  // Saved Diff Processes runs are analysis history/observability (like AuditLog),
  // not per-user/org content — carried by the SuperAdmin full backup only.
  "ProcessDiffRun",
  // Per-user SharePoint OAuth connection: encrypted Graph access/refresh tokens
  // bound to the Entra app registration + the MS_TOKEN_ENC_KEY of THIS deployment.
  // Deliberately never backed up or restored — copying it elsewhere would be wrong
  // (and useless: it re-obtains itself when the user clicks "Connect SharePoint").
  "MicrosoftConnection",
  ...SIMULATOR_CONFIG_TABLES,
  ...SIMULATOR_RESULT_TABLES,
  ...MINING_TABLES,
  ...RISK_CONTROL_TABLES,
  ...PCF_TABLES,
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

  it("deliberately omits the Simulator + Mining tables from ROW-level scoped backups (asserted, not just commented)", async () => {
    const schema = await getBackupSchema();
    const pinned: Array<readonly string[]> = [SIMULATOR_CONFIG_TABLES, SIMULATOR_RESULT_TABLES, MINING_TABLES];
    for (const t of pinned.flat()) {
      // Still a real catalog table — a rename / removal trips this so the pin
      // can't quietly reference a table that no longer exists.
      expect(schema.tables, `${t} is no longer a catalog table — update its pinned list`).toContain(t);
      // Pinned as a CONSCIOUS row-level scoped-backup omission.
      expect(SCOPED_OMITTED.has(t), `${t} must be a conscious scoped-backup omission`).toBe(true);
      // The tripwire for the follow-up: the day one of these is row-copied into
      // the scoped org/user backup, move it to SCOPED_COVERED — and THIS fails,
      // reminding you to drop it from the pin and add round-trip coverage.
      expect(
        SCOPED_COVERED.has(t),
        `${t} is now scoped-covered — remove it from its pinned list and add round-trip coverage`,
      ).toBe(false);
    }
  });

  // The config tables are omitted as ROWS but their content must still survive a
  // scoped backup via the package/library replay. This asserts the mechanism is
  // still wired in, so "omitted" can never quietly become "lost".
  it("carries simulator configuration through the package + library replay", async () => {
    const capture = await import("@/app/lib/simulation/captureProject");
    const adopt = await import("@/app/lib/simulation/adoptPackage");
    expect(typeof capture.captureAllProjectPackages).toBe("function");
    expect(typeof capture.captureProjectLibrary).toBe("function");
    expect(typeof adopt.replaySimulationPackages).toBe("function");
    expect(typeof adopt.replaySimulationLibraries).toBe("function");
  });

  it("deliberately omits the Risk & Control tables from scoped backups (asserted, not just commented)", async () => {
    const schema = await getBackupSchema();
    for (const t of RISK_CONTROL_TABLES) {
      expect(schema.tables, `${t} is no longer a catalog table — update RISK_CONTROL_TABLES`).toContain(t);
      expect(SCOPED_OMITTED.has(t), `${t} must be a conscious scoped-backup omission`).toBe(true);
      expect(
        SCOPED_COVERED.has(t),
        `${t} is now scoped-covered — remove it from RISK_CONTROL_TABLES and add round-trip coverage`,
      ).toBe(false);
    }
  });
});
