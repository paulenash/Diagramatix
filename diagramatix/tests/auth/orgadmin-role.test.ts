/**
 * T5252 — ONE Org administration role, OrgAdmin (Paul, 2026-10-05: "I don't believe we need both an Owner and an Admin for Orgs.
 * Lets just call the new single role OrgAdmin"). Stored as `Admin`, shown as "OrgAdmin"; nothing writes `Owner`; every "is this an
 * Org administrator?" check goes through one helper; a stray `Owner` row still works until the one-off SQL converts it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isOrgAdminRole, ORG_ADMIN_ROLE, ORG_ADMIN_ROLES } from "@/app/lib/auth/orgAdminRole";
import { displayOrgRole } from "@/app/lib/auth/orgRoleLabels";

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "generated") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (f: string) => f.split("\\").join("/");

describe("T5252 the helper", () => {
  it("Admin is the one role; a stray Owner still counts; nobody else does", () => {
    expect(ORG_ADMIN_ROLE).toBe("Admin");
    expect([...ORG_ADMIN_ROLES].sort()).toEqual(["Admin", "Owner"]);
    expect(isOrgAdminRole("Admin")).toBe(true);
    expect(isOrgAdminRole("Owner")).toBe(true);
    for (const r of ["Viewer", "RiskOwner", "ProcessOwner", "ControlOwner", "InternalAudit", "BoardObserver", "", null, undefined]) expect(isOrgAdminRole(r)).toBe(false);
  });
  it("both stored values are shown as OrgAdmin", () => {
    expect(displayOrgRole("Admin")).toBe("OrgAdmin");
    expect(displayOrgRole("Owner")).toBe("OrgAdmin");
  });
});

describe("T5252 the code asks one place", () => {
  const allowed = new Set([
    "app/lib/auth/orgAdminRole.ts", "app/lib/auth/orgRoleType.ts", "app/lib/auth/orgRoleLabels.ts", "app/lib/diagram/ddlGenerate.ts",
    "app/api/admin/users/[id]/org-role/route.ts",   // a comment saying Owner is no longer assignable
  ]);
  it("no file compares a role with \"Owner\", lists it in a query, or writes it", () => {
    const bad: string[] = [];
    for (const f of files("app")) {
      const r = rel(f);
      if (allowed.has(r)) continue;
      readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;                                  // a comment
        if (/role\s*[!=]==?\s*"Owner"|role:\s*"Owner"|"Owner"\s*,\s*"Admin"|"Admin"\s*,\s*"Owner"|\bin:\s*\["Owner"/.test(l)) bad.push(`${r}:${i + 1}: ${l.trim().slice(0, 110)}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it("new Orgs, domain auto-join and the SuperAdmin Org set-up create the one role", () => {
    expect(readFileSync("app/api/orgs/route.ts", "utf8")).toContain("role: ORG_ADMIN_ROLE,");
    expect(readFileSync("app/lib/auth/domainOrg.ts", "utf8")).toContain("role: ORG_ADMIN_ROLE }");
    expect(readFileSync("app/lib/superAdminOrg.ts", "utf8")).toContain("role = ORG_ADMIN_ROLE;");
  });
  it("Owner can no longer be assigned from the SuperAdmin user table", () => {
    const src = readFileSync("app/api/admin/users/[id]/org-role/route.ts", "utf8");
    const set = src.slice(src.indexOf("const VALID_ROLES"), src.indexOf("]);", src.indexOf("const VALID_ROLES")));
    expect(set).not.toContain('"Owner"');
    expect(set).toContain('"Admin"');
  });
});

describe("T5252 the conversion SQL", () => {
  const sql = readFileSync("scripts/sql/patch-orgrole-owner-to-admin.sql", "utf8");
  it("turns Owner rows into Admin, in a transaction, deleting nothing, and reports after the commit", () => {
    expect(sql).toContain(`UPDATE "OrgMember" SET role = 'Admin' WHERE role = 'Owner';`);
    expect(sql).toContain("BEGIN;");
    expect(sql.indexOf("COMMIT;")).toBeLessThan(sql.indexOf("SELECT CASE"));
    expect(sql).not.toContain("DELETE FROM");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).not.toMatch(/\bDROP\b|ALTER TYPE|\bDELETE\b|\bTRUNCATE\b/i);
  });
  it("the schema says Owner is retired and Admin is the one role", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toContain("Owner // RETIRED (2026-10-05)");
    expect(schema).toContain('Admin // the ONE Org administration role, shown as "OrgAdmin"');
  });
});
