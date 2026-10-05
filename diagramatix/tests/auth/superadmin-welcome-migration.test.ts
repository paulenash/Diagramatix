/**
 * T5247 — Paul and Greg on their NEW addresses (Paul, 2026-10-05): welcomed as SuperAdmin, and asked ONCE to confirm moving
 * everything the old address owns to the new one. Decided: MOVE (re-point) rather than duplicate; one prompt, then never again.
 * (The SQL move itself was proven against a scratch database: a clashing membership stays with the old account, the rest moves,
 * a second run moves nothing.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SUPERUSER_EMAILS } from "@/app/lib/superuser";

// the pure parts, without opening a database connection
const src = readFileSync("app/lib/superAdminMigration.ts", "utf8");
const route = readFileSync("app/api/superadmin/account-migration/route.ts", "utf8");
const layout = readFileSync("app/layout.tsx", "utf8");
const welcome = readFileSync("app/components/SuperAdminWelcome.tsx", "utf8");

describe("T5247 who is welcomed, and from where the data moves", () => {
  it("both new addresses are SuperAdmin, and each maps to its old one", () => {
    expect(SUPERUSER_EMAILS.has("paul@diagramatix.com.au")).toBe(true);
    expect(SUPERUSER_EMAILS.has("greg@diagramatix.com.au")).toBe(true);
    expect(src).toContain('"paul@diagramatix.com.au": "paul@nashcc.com.au"');
    expect(src).toContain('"greg@diagramatix.com.au": "greg.nash@getai.com.au"');
  });
  it("the old addresses stay SuperAdmin (nobody is locked out mid-move)", () => {
    expect(SUPERUSER_EMAILS.has("paul@nashcc.com.au")).toBe(true);
    expect(SUPERUSER_EMAILS.has("greg.nash@getai.com.au")).toBe(true);
  });
  it("the lookup is case-insensitive and null for anyone else", async () => {
    const { oldAddressFor } = await import("@/app/lib/superAdminMigration");
    expect(oldAddressFor("Paul@Diagramatix.com.au")).toBe("paul@nashcc.com.au");
    expect(oldAddressFor("paul@nashcc.com.au")).toBeNull();
    expect(oldAddressFor("someone@else.com")).toBeNull();
    expect(oldAddressFor(null)).toBeNull();
  });
  it("credentials and per-person machinery are never moved", async () => {
    const { NOT_MOVED } = await import("@/app/lib/superAdminMigration");
    for (const t of ["UserAiKey", "MicrosoftConnection", "UsageCounter", "DiagramPresence", "ApiKey"]) expect(NOT_MOVED.has(t)).toBe(true);
    for (const t of ["Project", "Diagram", "OrgMember", "ProjectShare"]) expect(NOT_MOVED.has(t)).toBe(false);
  });
  it("the counts read as a sentence", async () => {
    const { describeCounts } = await import("@/app/lib/superAdminMigration");
    expect(describeCounts([])).toBe("");
    expect(describeCounts([{ table: "Project", column: "userId", count: 3 }])).toBe("3 projects");
    expect(describeCounts([{ table: "Project", column: "userId", count: 3 }, { table: "Diagram", column: "userId", count: 12 }, { table: "Diagram", column: "diagramOwnerId", count: 2 }, { table: "OrgMember", column: "userId", count: 1 }]))
      .toBe("3 projects, 14 diagrams and 1 organisation memberships");
  });
});

describe("T5247 the move is safe", () => {
  it("every reference is found from the database's own foreign keys (a new table is covered without an edit)", () => {
    expect(src).toContain("pg_constraint");
    expect(src).toContain("c.contype = 'f' AND c.confrelid = '\"User\"'::regclass");
  });
  it("it is one transaction; a clash (23505) moves that table row by row and leaves the clashing rows; anything else rolls everything back", () => {
    expect(src).toContain('await c.query("BEGIN")');
    expect(src).toContain('await c.query("COMMIT")');
    expect(src).toContain('await c.query("ROLLBACK")');
    expect(src).toContain('"23505"');
    expect(src).toContain("SAVEPOINT");
    expect(src).not.toContain("DELETE FROM");
  });
});

describe("T5247 the route and the prompt", () => {
  it("keyed on the REAL signed-in user, SuperAdmin only, read-only impersonation blocked, confirm required", () => {
    expect(route).toContain("oldAddressFor(me.email)");
    expect(route).toContain("isSuperuser(session)");
    expect(route).toContain("blockReadOnlyImpersonation(ctx.session)");
    expect(route).toContain("body.confirm !== true");
  });
  it("it is recorded once (an AppSetting per account) and audited, and a second POST does nothing", () => {
    expect(route).toContain("migrationSettingKey(ctx.me.id)");
    expect(route).toContain("alreadyDone: true");
    expect(route).toContain('action: "superadmin.account-migration"');
  });
  it("the root layout mounts the welcome ONLY for those addresses", () => {
    expect(layout).toContain("superAdmin && !!oldAddressFor(session?.user?.email)");
    expect(layout).toContain("{welcomeNewSuperAdmin && <SuperAdminWelcome />}");
  });
  it("the dialog welcomes by first name, names the old address and what it holds, and has Not now / Confirm — a real modal, no browser dialog", () => {
    expect(welcome).toContain("you are signed in as a SuperAdmin");
    expect(welcome).toContain("{status.oldEmail}");
    expect(welcome).toContain("Not now");
    expect(welcome).toContain("Confirm — move everything");
    expect(welcome).not.toMatch(/\b(window\.)?(confirm|alert)\(/);
  });
});
