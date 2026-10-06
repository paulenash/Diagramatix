/**
 * T5266 — an OrgAdmin MAY delete a project, to the Archive; a member who is not an OrgAdmin may not delete one at all; hard delete is the
 * SuperAdmin's alone and is not shown when a SuperAdmin presents as an OrgAdmin (Paul, 2026-10-06). The code is T5254's; this is the help-text
 * correction as an idempotent SQL patch (proven locally after the earlier docs patch, run twice: four updates, then none).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const sql = readFileSync("scripts/sql/patch-orgadmin-project-delete-docs-2026-10-06.sql", "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const dash = readFileSync("app/(dashboard)/dashboard/DashboardClient.tsx", "utf8");

describe("T5266 the correction patch", () => {
  it("is four guarded REPLACEs: no inserts, nothing deleted, report after the commit", () => {
    expect((code.match(/^\s*UPDATE "HelpSection"/gm) ?? []).length).toBe(4);
    expect(code).not.toMatch(/^\s*(INSERT|DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);
    expect(code.indexOf("COMMIT;")).toBeLessThan(code.indexOf("SELECT\n  (SELECT"));
  });
  it("puts the exception where the help said OrgAdmins delete nothing, and replaces the old tier wording", () => {
    expect(sql).toContain("The one exception is a **project**");
    expect(sql).toContain("an OrgAdmin (any project in their Org) or a SuperAdmin");
    expect(sql).toContain("`x` SuperAdmin only; `x+` SuperAdmin or an OrgAdmin of the project's Org");
    expect(sql).toContain("A hard delete is for a SuperAdmin alone.");
    expect(sql).toContain("A member who is not an OrgAdmin has no project delete at all");
  });
  it("the earlier docs patch is what it corrects (the wording it replaces is really there)", () => {
    const before = readFileSync("scripts/sql/patch-orgadmin-docs-2026-10-05.sql", "utf8");
    expect(before).toContain("`x` owner or SuperAdmin; `x+` SuperAdmin or the owner who is an OrgAdmin; `x++` SuperAdmin who owns it.");
    expect(before).toContain("are all for a **SuperAdmin**. If something needs to go,");
  });
});

describe("T5266 the rule in the menu", () => {
  it("hard delete is never offered to an OrgAdmin, nor to a SuperAdmin presenting as one or as a customer", () => {
    expect(dash).toContain("const asSuper = !readOnly && !!isSu && !superAdminHidden;");
    expect(dash).toContain("const canSee_xPlus2 = asSuper && isOwnerOfThis;");
    expect(dash).toContain('(!!isSu && adminViewMode === "orgadmin")');            // in OrgAdmin mode: only the OrgAdmin's one option
  });
  it("a member sees a project-delete option only on a project they created (or as an OrgAdmin / SuperAdmin): the flags depend on who made it", () => {
    expect(dash).toContain("const createdByMe = !readOnly && (p.user?.id ? p.user.id === currentUserId : isOwnerOfThis);");
    expect(dash).toContain("const canSee_x      = asSuper || createdByMe;");
    expect(dash).toContain("const canSee_xPlus  = asSuper || asOrgAdmin || createdByMe;");
    expect(dash).toContain("{(canSee_x || canSee_xPlus || canSee_xPlus2) && (");
  });
  it("the Archive option says where the diagrams go", () => {
    expect(dash).toContain("Its diagrams move to the system Archive, under their Org and owner");
  });
});
