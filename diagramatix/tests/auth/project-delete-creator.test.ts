/**
 * T5271 — the person who CREATED a project may delete it, to the Sandpit or the Archive (Paul, 2026-10-06: "Normal and OrgAdmin users need
 * to be able to delete projects … they create, and any example projects or renamed example projects"). An OrgAdmin still may not delete
 * someone ELSE's project to the Sandpit; hard delete stays the SuperAdmin's.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { authorizeProjectDelete } from "@/app/lib/projects/deleteProject";

const ctx = (o: { su?: boolean; oa?: boolean; own?: boolean; owner?: boolean }) =>
  ({ isProjectOwner: o.owner ?? true, isSuperuser: !!o.su, isOrgAdmin: !!o.oa, isOwnProject: !!o.own });

describe("T5271 who may delete which tier", () => {
  it("a member deletes the project they created — Sandpit or Archive, never hard", () => {
    expect(authorizeProjectDelete("unorganise", ctx({ own: true })).allowed).toBe(true);
    expect(authorizeProjectDelete("archive", ctx({ own: true })).allowed).toBe(true);
    expect(authorizeProjectDelete("hard", ctx({ own: true })).allowed).toBe(false);
  });
  it("an OrgAdmin does the same on their own project, and archives anyone's — but cannot Sandpit-delete someone else's", () => {
    expect(authorizeProjectDelete("unorganise", ctx({ oa: true, own: true })).allowed).toBe(true);
    expect(authorizeProjectDelete("archive", ctx({ oa: true, own: false })).allowed).toBe(true);
    expect(authorizeProjectDelete("unorganise", ctx({ oa: true, own: false })).allowed).toBe(false);
    expect(authorizeProjectDelete("hard", ctx({ oa: true, own: true })).allowed).toBe(false);
  });
  it("a member with only an implicit / shared 'owner' role, on a project they did not create, may delete nothing", () => {
    for (const mode of ["unorganise", "archive", "hard"] as const) expect(authorizeProjectDelete(mode, ctx({ own: false })).allowed).toBe(false);
  });
  it("a SuperAdmin keeps every tier (hard only when they own it)", () => {
    expect(authorizeProjectDelete("unorganise", ctx({ su: true })).allowed).toBe(true);
    expect(authorizeProjectDelete("archive", ctx({ su: true })).allowed).toBe(true);
    expect(authorizeProjectDelete("hard", ctx({ su: true, owner: true })).allowed).toBe(true);
    expect(authorizeProjectDelete("hard", ctx({ su: true, owner: false })).allowed).toBe(false);
  });
});

describe("T5271 the route and the menu", () => {
  it("the route reads who CREATED the project (Project.userId), not the implicit owner role", () => {
    const route = readFileSync("app/api/projects/[id]/route.ts", "utf8");
    expect(route).toContain("const isOwnProject = existing.userId === session.user.id;");
    expect(route).toContain("{ isProjectOwner, isSuperuser: su, isOrgAdmin, isOwnProject }");
    expect(route.indexOf("const isOwnProject")).toBeLessThan(route.indexOf("authorizeProjectDelete(\n"));
  });
  it("the right-click menu offers x and x+ to the creator, and decides creation by the project's user, not by 'no shares'", () => {
    const dash = readFileSync("app/(dashboard)/dashboard/DashboardClient.tsx", "utf8");
    expect(dash).toContain("const createdByMe = !readOnly && (p.user?.id ? p.user.id === currentUserId : isOwnerOfThis);");
    expect(dash).toContain("const canSee_x      = asSuper || createdByMe;");
    expect(dash).toContain("const canSee_xPlus  = asSuper || asOrgAdmin || createdByMe;");
    expect(dash).toContain("const canSee_xPlus2 = asSuper && isOwnerOfThis;");   // hard delete unchanged
  });
});

describe("T5271 the help-text patch", () => {
  const sql = readFileSync("scripts/sql/patch-project-delete-creator-docs-2026-10-06.sql", "utf8");
  const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  it("is four guarded REPLACEs: no inserts, nothing deleted, report after the commit", () => {
    expect((code.match(/^\s*UPDATE "HelpSection"/gm) ?? []).length).toBe(4);
    expect(code).not.toMatch(/^\s*(INSERT|DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);
    expect(code.indexOf("COMMIT;")).toBeLessThan(code.indexOf("SELECT\n  (SELECT"));
  });
  it("states the new rule, and replaces wording the 2026-10-06 delete patch writes", () => {
    expect(sql).toContain("and the projects they created — to the Archive or the Sandpit");
    expect(sql).toContain("That includes an example project, renamed or not.");
    expect(sql).toContain("`x` SuperAdmin or the project's creator (the diagrams go to the Sandpit)");
    const before = readFileSync("scripts/sql/patch-orgadmin-project-delete-docs-2026-10-06.sql", "utf8");
    expect(before).toContain("visible to a SuperAdmin only. Diagrams survive");
    expect(before).toContain("`x` SuperAdmin only; `x+` SuperAdmin or an OrgAdmin of the project's Org (the diagrams go to the Archive, under their Org and owner)");
  });
});
