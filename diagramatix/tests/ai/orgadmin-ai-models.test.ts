/**
 * T5257 — AI Model Selection, slice 3 (Paul, 2026-10-05): the OrgAdmin's AI Models tile. An OrgAdmin chooses the model their Org runs on,
 * per purpose, from the lists SuperAdmin offered the Org; nobody else sees a model name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  isOrgAdmin: true,
  settings: new Map<string, string>(),
  audits: [] as Record<string, unknown>[],
}));
vi.mock("@/auth", () => ({ auth: async () => h.session }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/app/lib/auth/orgContext", () => {
  class OrgContextError extends Error { status = 403; }
  return { OrgContextError, getCurrentOrgId: async () => "org1" };
});
vi.mock("@/app/lib/routeGuard", async () => {
  const { NextResponse } = await import("next/server");
  return {
    guardOrgRoute: async (_orgId: string, o: { mutate: boolean }) =>
      h.isOrgAdmin ? { error: null, ctx: { session: h.session, userId: "u", isSuperAdmin: false, mutate: o.mutate } } : { error: NextResponse.json({ error: "Not an OrgAdmin for this org" }, { status: 403 }), ctx: null },
  };
});
vi.mock("@/app/lib/db", () => ({
  prisma: {
    org: { findUnique: async () => ({ name: "Acme" }) },
    appSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (h.settings.has(where.key) ? { key: where.key, value: h.settings.get(where.key)! } : null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => { h.settings.set(where.key, h.settings.has(where.key) ? update.value : create.value); },
      deleteMany: async ({ where }: { where: { key: string } }) => { h.settings.delete(where.key); },
    },
  },
}));
vi.mock("@/app/lib/audit", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/audit")>()),
  recordAudit: async (e: Record<string, unknown>) => { h.audits.push(e); },
}));

import { GET, PUT } from "@/app/api/org-admin/ai-models/route";

const OPUS = "claude-opus-5", SONNET = "claude-sonnet-5-5", HAIKU = "claude-haiku-4-5-20251001";
const put = (body: unknown) => PUT(new Request("http://x/api/org-admin/ai-models", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => {
  h.session = { user: { id: "u", email: "orgadmin@customer.test" } };
  h.isOrgAdmin = true; h.settings.clear(); h.audits.length = 0;
  process.env.ANTHROPIC_API_KEY = "sk-test";
});

describe("T5257 the API", () => {
  it("not signed in: 401; not an OrgAdmin of the Org: 403 — and no model name leaks", async () => {
    h.session = null;
    expect((await GET()).status).toBe(401);
    h.session = { user: { id: "u", email: "member@customer.test" } };
    h.isOrgAdmin = false;
    const r = await GET();
    expect(r.status).toBe(403);
    expect(JSON.stringify(await r.json())).not.toMatch(/claude|opus|sonnet|haiku/i);
    expect((await put({ purpose: "default", id: OPUS })).status).toBe(403);
  });
  it("GET: for each purpose the Org's offered models (with labels), the choice, and the model in force", async () => {
    h.settings.set("ai.org.org1.offered.default", JSON.stringify([OPUS, SONNET]));
    h.settings.set("ai.org.org1.chosen.default", SONNET);
    const j = await (await GET()).json();
    expect(j.org).toEqual({ id: "org1", name: "Acme" });
    expect(j.purposes.default.offered.map((m: { id: string }) => m.id)).toEqual([OPUS, SONNET]);
    expect(j.purposes.default.offered[0].label).toBe("Opus 5");
    expect(j.purposes.default.chosen).toBe(SONNET);
    expect(j.purposes.default.inForce).toEqual({ id: SONNET, label: "Sonnet 5.5" });
    expect(Object.keys(j.purposes).sort()).toEqual(["command", "default", "vision"]);
    expect(j.purposes.vision.chosen).toBeNull();
  });
  it("PUT chooses from the offered list, audits it, and reports the model now in force", async () => {
    h.settings.set("ai.org.org1.offered.default", JSON.stringify([OPUS, SONNET]));
    const r = await put({ purpose: "default", id: SONNET });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, chosen: SONNET, inForce: SONNET });
    expect(h.settings.get("ai.org.org1.chosen.default")).toBe(SONNET);
    expect(h.audits[0]).toMatchObject({ action: "ai.org-models.choose", targetType: "org", targetId: "org1", meta: { purpose: "default", model: SONNET } });
  });
  it("refuses a model that is not offered to this Org, and a bad purpose; nothing is stored", async () => {
    h.settings.set("ai.org.org1.offered.default", JSON.stringify([OPUS]));
    expect((await put({ purpose: "default", id: HAIKU })).status).toBe(400);
    expect((await put({ purpose: "nonsense", id: OPUS })).status).toBe(400);
    expect(h.settings.has("ai.org.org1.chosen.default")).toBe(false);
  });
  it("a blank id clears the choice, so the Org follows the platform default again", async () => {
    h.settings.set("ai.org.org1.offered.default", JSON.stringify([OPUS, SONNET]));
    h.settings.set("ai.org.org1.chosen.default", SONNET);
    expect((await put({ purpose: "default", id: "" })).status).toBe(200);
    expect(h.settings.has("ai.org.org1.chosen.default")).toBe(false);
  });
  it("a choice SuperAdmin has since taken off the list is not reported as chosen", async () => {
    h.settings.set("ai.org.org1.offered.default", JSON.stringify([OPUS]));
    h.settings.set("ai.org.org1.chosen.default", SONNET);
    expect((await (await GET()).json()).purposes.default.chosen).toBeNull();
  });
});

describe("T5257 the screen", () => {
  const client = readFileSync("app/(dashboard)/dashboard/org-admin/ai-models/AiModelsClient.tsx", "utf8");
  const page = readFileSync("app/(dashboard)/dashboard/org-admin/ai-models/page.tsx", "utf8");
  const menu = readFileSync("app/(dashboard)/dashboard/org-admin/OrgAdminClient.tsx", "utf8");
  it("an AI Models card is on the OrgAdmin screen", () => {
    expect(menu).toContain('href: "/dashboard/org-admin/ai-models?from=/dashboard/org-admin"');
    expect(menu).toContain('title: "AI Models"');
  });
  it("the page is OrgAdmin-only (anyone else is sent to the dashboard) and the client offers only the Org's list", () => {
    expect(page).toContain("requireOrgAdminFor(session, cookieStore, orgId)");
    expect(page).toContain('redirect("/dashboard")');
    for (const p of ["default", "vision", "command"]) expect(client).toContain(`key: "${p}"`);
    expect(client).toContain("info.offered.map");
    expect(client).toContain("Follow the platform default");
    expect(client).toContain("never see which one is in use");
  });
});
