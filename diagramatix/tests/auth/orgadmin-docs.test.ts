/**
 * T5254 — documentation and the last loose ends of "OrgAdmins delete nothing" (slice 4): the DB-held User Guide and Technical Notes text,
 * as an idempotent SQL patch for the in-app Database tile, and the project-delete tiers brought into line with the rule.
 * (The SQL was proven against the local database in a rolled-back transaction, run twice: UPDATE 1 x4 + INSERT x2, then all zero.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { authorizeProjectDelete } from "@/app/lib/projects/deleteProject";

const sql = readFileSync("scripts/sql/patch-orgadmin-docs-2026-10-05.sql", "utf8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("T5254 the documentation patch", () => {
  it("adds one User Guide section (OrgAdmin chapter) and one Technical Notes section (Identity, Multi-tenancy & Access), each only when its heading is not there", () => {
    expect(sql).toContain("'What an OrgAdmin can and cannot do'");
    expect(sql).toContain("ch.collection = 'user-guide' AND ch.slug = 'org-admin'");
    expect(sql).toContain("'One Org administration role, and who may delete'");
    expect(sql).toContain("ch.collection = 'tech-design' AND ch.slug = 'identity-access'");
    expect(sql.match(/AND NOT EXISTS \(SELECT 1 FROM "HelpSection" s WHERE s\."chapterId" = ch\.id AND s\.heading = /g)?.length).toBe(2);
  });
  it("corrects the old wording with guarded REPLACEs (the intro, the right-click menu, Roles & elevation, the three delete tiers)", () => {
    for (const old of ["(Org Owner or Org Admin role)", "visible to the project Owner or an OrgAdmin", "(Owner/Admin within an org, orange accent)", "owner/OrgAdmin/SuperAdmin"]) {
      expect(sql).toContain(`LIKE '%${old}%'`);
    }
  });
  it("is safe on the live database: a transaction, deletes nothing, reports after the commit", () => {
    expect(code).toContain("BEGIN;");
    expect(code.indexOf("COMMIT;")).toBeLessThan(code.indexOf("SELECT\n"));
    expect(code).not.toMatch(/^\s*(DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);       // statements — the help text itself says "delete"
  });
  it("what it says matches the rules: OrgAdmin cannot delete, restore only adds, a user's own delete goes to the archive", () => {
    expect(sql).toContain("An OrgAdmin cannot delete.");
    expect(sql).toContain("A restore only ever **adds**");
    expect(sql).toContain("A deleted diagram goes to the **archive**");
    expect(sql).toContain("`superAdminOnlyDelete()`");
    expect(sql).toContain("`orgAdminCannotDelete({ projectId | diagramId })`");
  });
});

describe("T5254 the project-delete tiers follow the rule", () => {
  const ctx = (owner: boolean, su: boolean, oa: boolean) => ({ isProjectOwner: owner, isSuperuser: su, isOrgAdmin: oa });
  it("an OrgAdmin who is not the owner deletes nothing, at any tier", () => {
    for (const mode of ["unorganise", "archive", "hard"] as const) expect(authorizeProjectDelete(mode, ctx(false, false, true)).allowed).toBe(false);
  });
  it("the owner may unorganise; the owner who is an OrgAdmin may archive; only a SuperAdmin who owns it may hard-delete", () => {
    expect(authorizeProjectDelete("unorganise", ctx(true, false, false)).allowed).toBe(true);
    expect(authorizeProjectDelete("archive", ctx(true, false, true)).allowed).toBe(true);
    expect(authorizeProjectDelete("archive", ctx(true, false, false)).allowed).toBe(false);
    expect(authorizeProjectDelete("hard", ctx(true, true, true)).allowed).toBe(true);
    expect(authorizeProjectDelete("hard", ctx(true, false, true)).allowed).toBe(false);
  });
  it("the dashboard's right-click menu offers x to the owner or a SuperAdmin, never to an OrgAdmin alone", () => {
    const src = readFileSync("app/(dashboard)/dashboard/DashboardClient.tsx", "utf8");
    expect(src).toContain("const canSee_x      = isOwnerOfThis || !!isSu;");
    expect(src).toContain("const canSee_xPlus  = !!isSu || (isOrgAdmin && isOwnerOfThis);");
  });
});
