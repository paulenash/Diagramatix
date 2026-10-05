/**
 * T5253 — OrgAdmins delete nothing (Paul, 2026-10-05: "OrgAdmins should not be able to delete anything! ONLY SuperAdmins can destructively
 * restore or delete anything" — administration only: ordinary users still delete their OWN work, which goes to the archive).
 *   • Org-level things an OrgAdmin used to delete (libraries, structures, teams): SuperAdmin only;
 *   • a project / diagram: the owner still deletes it; a caller who reaches it ONLY as an OrgAdmin (implicit owner) cannot;
 *   • the additive Org-backup restore stays available to an OrgAdmin; the wipe restore stays SuperAdmin-only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  project: null as null | { viaOrgAdmin?: boolean },
  diagram: null as null | { viaOrgAdmin?: boolean },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/app/lib/auth/orgContext", () => ({
  getProjectAccess: async () => state.project,
  getDiagramAccess: async () => state.diagram,
}));

import { orgAdminCannotDelete, superAdminOnlyDelete, ORGADMIN_DELETE_MESSAGE } from "@/app/lib/auth/deleteRules";

const SA = { user: { id: "sa", email: "paul@diagramatix.com.au" } };
const ORGADMIN = { user: { id: "oa", email: "orgadmin@customer.test" } };

beforeEach(() => { state.session = null; state.project = null; state.diagram = null; });

describe("T5253 the guards", () => {
  it("Org-level delete: a SuperAdmin is let through; an OrgAdmin gets the refusal with the notice; nobody signed in gets 401", async () => {
    state.session = SA;
    expect(await superAdminOnlyDelete()).toBeNull();
    state.session = ORGADMIN;
    const r = await superAdminOnlyDelete();
    expect(r?.status).toBe(403);
    const body = await r!.json();
    expect(body.error).toBe(ORGADMIN_DELETE_MESSAGE);
    expect(body.notice).toMatchObject({ kind: "policy", title: "Only a SuperAdmin can delete this" });
    state.session = null;
    expect((await superAdminOnlyDelete())?.status).toBe(401);
  });
  it("Project delete: the owner may; an OrgAdmin who is an implicit owner may not; a SuperAdmin always may", async () => {
    state.session = ORGADMIN;
    state.project = { viaOrgAdmin: false };           // the real owner
    expect(await orgAdminCannotDelete({ projectId: "p" })).toBeNull();
    state.project = { viaOrgAdmin: true };            // an OrgAdmin of the Org, not the owner
    expect((await orgAdminCannotDelete({ projectId: "p" }))?.status).toBe(403);
    state.session = SA;
    expect(await orgAdminCannotDelete({ projectId: "p" })).toBeNull();
  });
  it("Diagram delete: the same, through the diagram's access", async () => {
    state.session = ORGADMIN;
    state.diagram = { viaOrgAdmin: true };
    expect((await orgAdminCannotDelete({ diagramId: "d" }))?.status).toBe(403);
    state.diagram = { viaOrgAdmin: false };
    expect(await orgAdminCannotDelete({ diagramId: "d" })).toBeNull();
  });
  it("not signed in: left to the route's own guard (which answers 401)", async () => {
    expect(await orgAdminCannotDelete({ projectId: "p" })).toBeNull();
  });
});

describe("T5253 every OrgAdmin-reachable DELETE handler is guarded (a ratchet)", () => {
  function routes(dir: string, prefix = ""): string[] {
    const out: string[] = [];
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? prefix + "/" + e.name : e.name;
      if (e.isDirectory()) out.push(...routes(join(dir, e.name), rel));
      else if (e.name === "route.ts") out.push(rel);
    }
    return out;
  }
  const API = join(process.cwd(), "app", "api");
  /** The DELETE handler's own text. */
  function deleteHandler(src: string): string | null {
    const m = src.match(/export\s+async\s+function\s+DELETE\b/);
    if (!m) return null;
    const rest = src.slice(m.index!);
    const next = rest.slice(10).search(/\nexport\s+(async\s+)?function\s/);
    return next < 0 ? rest : rest.slice(0, next + 10);
  }
  /** Reviewed: managing who administers is administration, not data deletion (Paul, 2026-10-05, Q2). */
  const EXEMPT: Record<string, string> = {
    "orgs/[id]/admins/[userId]/route.ts": "demotes an OrgAdmin to Normal — destroys nothing; the last-admin guard stays",
  };
  it("every DELETE under orgs/** and projects/** calls a delete guard, or is SuperAdmin-only itself, or is on the reviewed list", () => {
    const bad: string[] = [];
    for (const r of routes(API).filter((x) => x.startsWith("orgs/") || x.startsWith("projects/")).sort()) {
      const h = deleteHandler(readFileSync(join(API, r), "utf8"));
      if (!h || EXEMPT[r]) continue;
      if (!/superAdminOnlyDelete\(|orgAdminCannotDelete\(|isSuperuser\(/.test(h)) bad.push(r);
    }
    expect(bad).toEqual([]);
  });
  it("the other routes an OrgAdmin used to delete through are guarded too: diagrams, SOPs, SOP templates, diff runs", () => {
    const read = (p: string) => readFileSync(join(API, p), "utf8");
    expect(deleteHandler(read("diagrams/[id]/route.ts"))).toContain("orgAdminCannotDelete({ diagramId");
    expect(deleteHandler(read("sop/[id]/route.ts"))).toContain("orgAdminCannotDelete({ projectId: pid })");
    expect(deleteHandler(read("sop-templates/[id]/route.ts"))).toContain("superAdminOnlyDelete()");
    const diff = deleteHandler(read("diagrams/diff/runs/[runId]/route.ts"))!;
    expect(diff).not.toContain("requireOrgAdminFor");
    expect(diff).toContain("run.createdById === session.user.id || isSuperuser(session)");
  });
  it("the exempt list is exactly the one reviewed route, and it exists", () => {
    expect(Object.keys(EXEMPT)).toEqual(["orgs/[id]/admins/[userId]/route.ts"]);
    expect(routes(API)).toContain("orgs/[id]/admins/[userId]/route.ts");
  });
});

describe("T5253 what stays", () => {
  it("the additive Org-backup restore is still OrgAdmin's, with no wipe mode; the wipe restore is SuperAdmin-only", () => {
    const org = readFileSync("app/api/org-admin/backup/route.ts", "utf8");
    expect(org).toContain("restoreOrgBackupAdditive");
    expect(org).not.toMatch(/mode === "wipe"/);
    expect(readFileSync("app/api/admin/full-backup/route.ts", "utf8")).toContain("isSuperuser");
  });
  it("OrgAdmin elevation is told apart from SuperAdmin elevation (the delete guards depend on it)", () => {
    const ctx = readFileSync("app/lib/auth/orgContext.ts", "utf8");
    expect(ctx).toContain('Promise<"superadmin" | "orgadmin" | null>');
    expect(ctx).toContain('viaOrgAdmin: elevation === "orgadmin"');
  });
  it("the pages tell the person who can delete, rather than a button that does nothing", () => {
    for (const f of ["admin/pcf/PcfBuilder.tsx", "admin/pcf/PcfClient.tsx", "admin/risk-controls/RiskControlsClient.tsx", "admin/entity-lists/EntityListsClient.tsx"]) {
      expect(readFileSync("app/(dashboard)/dashboard/" + f, "utf8"), f).toContain("showGateNotice(");
    }
  });
});
