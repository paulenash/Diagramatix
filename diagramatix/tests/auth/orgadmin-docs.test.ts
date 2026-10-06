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

describe("T5254 the project-delete tiers follow the rule (reset 2026-10-06: an OrgAdmin may delete a project to the Archive)", () => {
  const ctx = (owner: boolean, su: boolean, oa: boolean, own = false) => ({ isProjectOwner: owner, isSuperuser: su, isOrgAdmin: oa, isOwnProject: own });
  it("a member who is not an OrgAdmin has no project delete at any tier on a project they did NOT create (an implicit or shared 'owner' is not enough); never a hard delete", () => {
    for (const mode of ["unorganise", "archive", "hard"] as const) expect(authorizeProjectDelete(mode, ctx(true, false, false)).allowed).toBe(false);
  });
  it("the person who CREATED a project — an OrgAdmin included — may delete it to the Sandpit or the Archive, never hard (reset 2026-10-06; T5271)", () => {
    for (const oa of [false, true]) {
      expect(authorizeProjectDelete("unorganise", ctx(true, false, oa, true)).allowed).toBe(true);
      expect(authorizeProjectDelete("archive", ctx(true, false, oa, true)).allowed).toBe(true);
      expect(authorizeProjectDelete("hard", ctx(true, false, oa, true)).allowed).toBe(false);
    }
  });
  it("an OrgAdmin may archive a project of their Org (the owner's or anyone's) but not leave its diagrams loose and never hard-delete", () => {
    expect(authorizeProjectDelete("archive", ctx(false, false, true)).allowed).toBe(true);
    expect(authorizeProjectDelete("archive", ctx(true, false, true)).allowed).toBe(true);
    expect(authorizeProjectDelete("unorganise", ctx(true, false, true)).allowed).toBe(false);
    expect(authorizeProjectDelete("hard", ctx(true, false, true)).allowed).toBe(false);
  });
  it("a SuperAdmin has every tier — hard only on a project they own", () => {
    expect(authorizeProjectDelete("unorganise", ctx(false, true, true)).allowed).toBe(true);
    expect(authorizeProjectDelete("archive", ctx(false, true, false)).allowed).toBe(true);
    expect(authorizeProjectDelete("hard", ctx(true, true, true)).allowed).toBe(true);
    expect(authorizeProjectDelete("hard", ctx(false, true, true)).allowed).toBe(false);
  });
  it("the dashboard's right-click menu: x for a SuperAdmin or the creator, x+ for a SuperAdmin, an OrgAdmin or the creator, x++ for a SuperAdmin in SuperAdmin view who owns it", () => {
    const src = readFileSync("app/(dashboard)/dashboard/DashboardClient.tsx", "utf8");
    expect(src).toContain("const asSuper = !readOnly && !!isSu && !superAdminHidden;");
    expect(src).toContain('const asOrgAdmin = !readOnly && (isOrgAdminRole(orgRole) || (!!isSu && adminViewMode === "orgadmin"));');
    expect(src).toContain("const canSee_x      = asSuper || createdByMe;");
    expect(src).toContain("const canSee_xPlus  = asSuper || asOrgAdmin || createdByMe;");
    expect(src).toContain("const canSee_xPlus2 = asSuper && isOwnerOfThis;");
  });
  it("the route lets an OrgAdmin through its first-line guard for the archive tier only", () => {
    const route = readFileSync("app/api/projects/[id]/route.ts", "utf8");
    expect(route).toContain('const archiveOnly = q.get("cascade") === "archive" && q.get("hardDelete") !== "true";');
    expect(route).toContain("orgAdminCannotDelete({ projectId: (await params).id, allowArchive: archiveOnly })");
    expect(readFileSync("app/lib/auth/deleteRules.ts", "utf8")).toContain("?.viaOrgAdmin && !target.allowArchive ? refused() : null");
  });
});
