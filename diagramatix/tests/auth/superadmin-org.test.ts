/**
 * T5248 — the organisations of the new-address SuperAdmins (Paul, 2026-10-05): paul@diagramatix.com.au's organisation is
 * "Diagramatix" and he administers it; Greg's stays "GetAI Org" and he administers that. Made true on sign-in, idempotently.
 * (Proven against a scratch database: Paul's personal org renamed once and left alone after; Greg added as Admin, a Viewer
 * raised to Admin, an Owner / Admin kept; any other address untouched.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { orgSpecFor, SUPERADMIN_ORGS } from "@/app/lib/superAdminOrg";

const lib = readFileSync("app/lib/superAdminOrg.ts", "utf8");
const route = readFileSync("app/api/superadmin/account-migration/route.ts", "utf8");
const welcome = readFileSync("app/components/SuperAdminWelcome.tsx", "utf8");

describe("T5248 which organisation, for whom", () => {
  it("Paul's is Diagramatix (his own personal org is adopted and renamed), Greg's is GetAI Org (never created over an existing one)", () => {
    expect(SUPERADMIN_ORGS["paul@diagramatix.com.au"]).toEqual({ orgName: "Diagramatix", adoptPersonalOrg: true, createIfMissing: true });
    expect(SUPERADMIN_ORGS["greg@diagramatix.com.au"]).toEqual({ orgName: "GetAI Org", adoptPersonalOrg: false, createIfMissing: false });
  });
  it("nobody else has a spec, and the lookup ignores case", () => {
    expect(orgSpecFor("Paul@Diagramatix.com.au")?.orgName).toBe("Diagramatix");
    expect(orgSpecFor("paul@nashcc.com.au")).toBeNull();
    expect(orgSpecFor(null)).toBeNull();
  });
});

describe("T5248 how it is made true", () => {
  it("one transaction; a role that already administers (Owner / Admin) is kept, anything lower is raised to Admin; a new org's creator is Owner", () => {
    expect(lib).toContain("prisma.$transaction");
    expect(lib).toContain('new Set(["Owner", "Admin"])');
    expect(lib).toContain('"Admin"');
    expect(lib).toContain('? "Owner" : "Admin"');
    expect(lib).not.toMatch(/\.delete(Many)?\(/);
  });
  it("it only adopts an org the person OWNS and that is named like a personal org (\"…'s Org\")", () => {
    expect(lib).toContain('role: "Owner", org: { name: { endsWith: "\'s Org" } }');
  });
});

describe("T5248 the route and the dialog", () => {
  it("the ensure-org action is on the guarded route (real user, SuperAdmin only, read-only impersonation blocked) and audited", () => {
    expect(route).toContain('body.action === "ensure-org"');
    expect(route.indexOf("blockReadOnlyImpersonation")).toBeLessThan(route.indexOf('body.action === "ensure-org"'));
    expect(route).toContain('action: "superadmin.org-setup"');
  });
  it("the dialog runs it on sign-in and says which organisation, and that they administer it", () => {
    expect(welcome).toContain('JSON.stringify({ action: "ensure-org" })');
    expect(welcome).toContain("Your organisation is");
    expect(welcome).toContain("administrator");
  });
});
