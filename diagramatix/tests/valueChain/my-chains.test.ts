/**
 * T5302 — managing the value chains users create (Create a New Value Chain, slices 4–5; Paul, 2026-10-10): the owner's route
 * (/api/repository/my-chains) and the SuperAdmin's per-Org route. Who sees what, who may act on which chain, who may delete, who may hand over.
 * The session, the database and the shared maintenance handlers are faked; the route logic is real.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

type ChainRow = { id: string; orgId: string; code: string; createdByUserId: string | null };
let session: { user: { id: string; name: string }; __super?: boolean } | null;
let role = "ProcessOwner";
let readOnly = false;
let chains: ChainRow[] = [];
let updated: unknown[] = [];
let members: { userId: string; name: string }[] = [];

vi.mock("@/auth", () => ({ auth: async () => session }));
vi.mock("next/headers", () => ({ cookies: async () => ({}) }));
vi.mock("@/app/lib/superuser", () => ({ isSuperuser: (s: { __super?: boolean }) => !!s?.__super, isReadOnlyImpersonation: () => readOnly }));
vi.mock("@/app/lib/auth/orgPolicy", () => ({ gateOrgPolicy: async () => null }));
vi.mock("@/app/lib/auth/orgContext", () => ({
  WRITE_ROLES: ["ProcessOwner"], READ_ONLY_ROLES: ["Viewer"],
  OrgContextError: class extends Error { status = 403; },
  requireRole: async () => ({ orgId: "orgA", userId: session!.user.id, role }),
}));
vi.mock("@/app/lib/valueChain/libraryAdmin", () => ({
  libraryGet: async (_r: Request, org: string, filter: unknown) => NextResponse.json({ org, filter }),
  libraryPost: async (req: Request, _s: unknown, org: string) => NextResponse.json({ forwarded: await req.json(), org }),
}));
vi.mock("@/app/lib/valueChain/newChain", () => ({
  listOrgMembers: async () => members,
  reassignChainOwner: async (chain: { id: string }, to: string) => {
    if (!members.some((m) => m.userId === to)) return { ok: false, error: "That person is not a member of this organisation." };
    updated.push([chain.id, to]); return { ok: true };
  },
}));
vi.mock("@/app/lib/db", () => ({
  prisma: {
    valueChainLibrary: {
      findUnique: async ({ where }: { where: { id: string } }) => chains.find((c) => c.id === where.id) ?? null,
      findFirst: async ({ where }: { where: { orgId: string; code: string } }) => chains.find((c) => c.orgId === where.orgId && c.code === where.code) ?? null,
    },
    org: { findUnique: async ({ where }: { where: { id: string } }) => (where.id === "orgA" || where.id === "orgB" ? { id: where.id } : null) },
  },
}));

const post = (body: unknown) => new Request("http://x/api/repository/my-chains", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (q = "") => new Request(`http://x/api/repository/my-chains${q}`);
const sign = (id: string, extra: Partial<NonNullable<typeof session>> = {}) => { session = { user: { id, name: id }, ...extra }; };

beforeEach(() => {
  session = null; role = "ProcessOwner"; readOnly = false; updated = [];
  members = [{ userId: "u1", name: "Una" }, { userId: "u2", name: "Bo" }];
  chains = [
    { id: "mine", orgId: "orgA", code: "C01", createdByUserId: "u1" },
    { id: "theirs", orgId: "orgA", code: "C02", createdByUserId: "u2" },
    { id: "adopted", orgId: "orgA", code: "V05", createdByUserId: null },
    { id: "foreign", orgId: "orgB", code: "C01", createdByUserId: "u1" },
    { id: "master", orgId: "", code: "V01", createdByUserId: null },
  ];
});

describe("T5302 what the owner's route lists", () => {
  it("an ordinary member sees only their own chains; an OrgAdmin sees every user-created chain in the Org", async () => {
    const { GET } = await import("@/app/api/repository/my-chains/route");
    sign("u1");
    expect((await (await GET(get())).json()).filter).toEqual({ ownedBy: "u1" });
    sign("u9"); role = "Admin";
    expect((await (await GET(get())).json()).filter).toEqual({ userChains: true });
  });
  it("the member list for handing over is for OrgAdmins and SuperAdmins only", async () => {
    const { GET } = await import("@/app/api/repository/my-chains/route");
    sign("u1");
    expect((await GET(get("?members=1"))).status).toBe(403);
    sign("u9"); role = "Admin";
    expect((await (await GET(get("?members=1"))).json()).members).toHaveLength(2);
  });
  it("a signed-out caller is refused", async () => {
    const { GET } = await import("@/app/api/repository/my-chains/route");
    expect((await GET(get())).status).toBe(401);
  });
});

describe("T5302 acting on a chain", () => {
  it("the owner may edit and publish their own; the request is handed on to the shared handlers for their Org", async () => {
    const { POST } = await import("@/app/api/repository/my-chains/route");
    sign("u1");
    const r = await POST(post({ action: "save-chain", id: "mine", title: "New" }));
    expect(r.status).toBe(200);
    expect((await r.json())).toMatchObject({ org: "orgA", forwarded: { action: "save-chain", id: "mine" } });
    const p = await POST(post({ action: "publish", code: "C01" }));
    expect((await p.json()).forwarded).toMatchObject({ action: "publish", code: "C01", id: "mine" });
  });
  it("another member's chain, another Org's chain, an adopted chain and the master's are all 'not found' — even to an OrgAdmin where they are not user chains", async () => {
    const { POST } = await import("@/app/api/repository/my-chains/route");
    sign("u1");
    expect((await POST(post({ action: "save-chain", id: "theirs" }))).status).toBe(404);
    expect((await POST(post({ action: "save-chain", id: "foreign" }))).status).toBe(404);
    sign("u9"); role = "Admin";
    expect((await POST(post({ action: "save-chain", id: "theirs" }))).status).toBe(200);        // an OrgAdmin manages any user chain in their Org
    expect((await POST(post({ action: "save-chain", id: "foreign" }))).status).toBe(404);
    expect((await POST(post({ action: "save-chain", id: "adopted" }))).status).toBe(404);       // adopted: the OrgAdmin's tile, not this route
    expect((await POST(post({ action: "save-chain", id: "master" }))).status).toBe(404);
  });
  it("only the actions that make sense for a user's chain are allowed; publish must name a chain", async () => {
    const { POST } = await import("@/app/api/repository/my-chains/route");
    sign("u1");
    for (const bad of ["import", "adopt", "sync", "create-chain", "set-model"]) expect((await POST(post({ action: bad, id: "mine" }))).status, bad).toBe(400);
    expect((await POST(post({ action: "publish" }))).status).toBe(400);                           // would otherwise publish every chain in the Org
  });
  it("read-only impersonation cannot write", async () => {
    const { POST } = await import("@/app/api/repository/my-chains/route");
    sign("u1"); readOnly = true;
    expect((await POST(post({ action: "save-chain", id: "mine" }))).status).toBe(403);
  });
});

describe("T5302 delete and hand-over", () => {
  it("the owner and a SuperAdmin may delete; an OrgAdmin may not (they can withdraw it instead)", async () => {
    const { POST } = await import("@/app/api/repository/my-chains/route");
    sign("u2"); role = "ProcessOwner";
    expect((await POST(post({ action: "delete-chain", id: "theirs" }))).status).toBe(200);        // the owner
    sign("u9"); role = "Admin";
    const r = await POST(post({ action: "delete-chain", id: "theirs" }));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toMatch(/owner.*SuperAdmin/);
    expect((await POST(post({ action: "unpublish", code: "C02" }))).status).toBe(200);            // withdrawing is allowed
    sign("su", { __super: true }); role = "ProcessOwner";
    expect((await POST(post({ action: "delete-chain", id: "mine" }))).status).toBe(200);          // a SuperAdmin may delete any
  });
  it("hand-over is for an OrgAdmin or SuperAdmin, to a member of the Org", async () => {
    const { POST } = await import("@/app/api/repository/my-chains/route");
    sign("u1"); role = "ProcessOwner";
    expect((await POST(post({ action: "reassign-owner", id: "mine", userId: "u2" }))).status).toBe(403);   // not even the owner
    sign("u9"); role = "Admin";
    expect((await POST(post({ action: "reassign-owner", id: "mine", userId: "u2" }))).status).toBe(200);
    expect(updated).toEqual([["mine", "u2"]]);
    expect((await POST(post({ action: "reassign-owner", id: "mine", userId: "stranger" }))).status).toBe(400);
  });
});

describe("T5302 the SuperAdmin's per-Org route", () => {
  it("is SuperAdmin only, knows its Org, hands over, and blocks read-only impersonation on writes", async () => {
    const { GET, POST } = await import("@/app/api/admin/org-value-chain-library/[orgId]/route");
    const ctx = (orgId: string) => ({ params: Promise.resolve({ orgId }) });
    sign("u1");
    expect((await GET(get(), ctx("orgA"))).status).toBe(403);
    sign("su", { __super: true });
    expect((await (await GET(get(), ctx("orgB"))).json()).org).toBe("orgB");
    expect((await GET(get(), ctx("nowhere"))).status).toBe(404);
    expect((await (await GET(get("?members=1"), ctx("orgA"))).json()).members).toHaveLength(2);
    expect((await POST(post({ action: "reassign-owner", id: "foreign", userId: "u2" }), ctx("orgB"))).status).toBe(200);
    expect((await POST(post({ action: "reassign-owner", id: "mine", userId: "u2" }), ctx("orgB"))).status).toBe(404);   // that chain is in orgA, not orgB
    readOnly = true;
    expect((await POST(post({ action: "save-chain", id: "mine" }), ctx("orgA"))).status).toBe(403);
  });
});

describe("T5302 the screens", () => {
  const client = readFileSync("app/(dashboard)/dashboard/admin/value-chain-library/ValueChainLibraryClient.tsx", "utf8");
  const wizard = readFileSync("app/components/repository/NewValueChainWizard.tsx", "utf8");
  it("one editor serves the master, an Org's OrgAdmin tile, My Value Chains and the SuperAdmin's Org picker", () => {
    expect(client).toContain('scope?: "master" | "org" | "mine"');
    expect(client).toContain("/api/repository/my-chains");
    expect(client).toContain("/api/admin/org-value-chain-library/");
    expect(client).toContain("Created by");
    expect(readFileSync("app/(dashboard)/dashboard/my-value-chains/page.tsx", "utf8")).toContain('scope="mine"');
  });
  it("the wizard has the six steps and uses the shared bounds and plan, not copies", () => {
    for (const s of ["The value chain", "The processes", "What to create", "Check the narrative", "A few questions", "Create"]) expect(wizard).toContain(`"${s}"`);
    expect(wizard).toContain("MIN_PROCESSES");
    expect(wizard).toContain("plannedPromptCount(");
    expect(wizard).not.toMatch(/window\.(confirm|alert|prompt)\(/);                  // never a browser dialog
  });
  it("it is offered only where the server says so: the dashboard button and the Project menu item both wait for newChainAccess", () => {
    for (const f of ["app/(dashboard)/dashboard/DashboardClient.tsx", "app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toContain("useNewChainAccess()");
      expect(src, f).toMatch(/newChainAccess\.allowed && \([\s\S]{0,900}Create a New Value Chain/);
    }
  });
  it("the files the browser bundles import nothing from the server side", () => {
    for (const f of ["app/lib/valueChain/chainNarrative.ts", "app/lib/valueChain/newChainPlan.ts", "app/lib/valueChain/chainCodes.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/from "@\/app\/lib\/db"|from "node:|from "next\/headers"|prisma/);
    }
    expect(readFileSync("app/lib/valueChain/chainNarrative.ts", "utf8")).not.toContain('from "./promptTemplates"\n');
  });
});
