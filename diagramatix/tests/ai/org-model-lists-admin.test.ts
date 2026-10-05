/**
 * T5256 — AI Model Selection, slice 2 (Paul, 2026-10-05): the SuperAdmin's per-Org list editor on the AI Model tile and its API.
 * SuperAdmin only; read-only impersonation blocked; every change audited; the lists go where orgModels.ts reads them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const h = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  settings: new Map<string, string>(),
  orgs: [{ id: "o1", name: "Acme" }, { id: "o2", name: "GetAI Org" }],
  audits: [] as Record<string, unknown>[],
  readOnly: false,
}));
vi.mock("@/auth", () => ({ auth: async () => h.session }));
vi.mock("@/app/lib/db", () => ({
  prisma: {
    org: {
      findMany: async () => h.orgs,
      findUnique: async ({ where }: { where: { id: string } }) => h.orgs.find((o) => o.id === where.id) ?? null,
    },
    appSetting: {
      findMany: async ({ where }: { where: { key: { startsWith: string } } }) => [...h.settings].filter(([k]) => k.startsWith(where.key.startsWith)).map(([key, value]) => ({ key, value })),
      findUnique: async ({ where }: { where: { key: string } }) => (h.settings.has(where.key) ? { key: where.key, value: h.settings.get(where.key)! } : null),
      upsert: async ({ where, create, update }: { where: { key: string }; create: { value: string }; update: { value: string } }) => { h.settings.set(where.key, h.settings.has(where.key) ? update.value : create.value); },
      deleteMany: async ({ where }: { where: { key: string } }) => { h.settings.delete(where.key); },
    },
  },
}));
vi.mock("@/app/lib/routeGuard", async () => {
  const { NextResponse } = await import("next/server");
  return { blockReadOnlyImpersonation: async () => (h.readOnly ? NextResponse.json({ error: "Read-only" }, { status: 403 }) : null) };
});
vi.mock("@/app/lib/audit", async (orig) => ({
  ...(await orig<typeof import("@/app/lib/audit")>()),
  recordAudit: async (e: Record<string, unknown>) => { h.audits.push(e); },
}));

import { GET, PUT } from "@/app/api/admin/ai-model/orgs/route";
import { defaultOfferedModels } from "@/app/lib/ai/orgModels";

const SA = { user: { id: "sa", email: "paul@diagramatix.com.au" } };
const OA = { user: { id: "oa", email: "orgadmin@customer.test" } };
const put = (body: unknown) => PUT(new Request("http://x/api/admin/ai-model/orgs", { method: "PUT", body: JSON.stringify(body) }));

beforeEach(() => { h.session = SA; h.settings.clear(); h.audits.length = 0; h.readOnly = false; });

describe("T5256 the API", () => {
  it("only a SuperAdmin: an OrgAdmin or nobody gets 403", async () => {
    h.session = OA;
    expect((await GET()).status).toBe(403);
    expect((await put({ orgId: "o1", purpose: "default", ids: [] })).status).toBe(403);
    h.session = null;
    expect((await GET()).status).toBe(403);
  });
  it("GET lists every Org with the default lists, 'customised' false, and no choice", async () => {
    const j = await (await GET()).json();
    expect(j.orgs.map((o: { name: string }) => o.name)).toEqual(["Acme", "GetAI Org"]);
    expect(j.orgs[0].purposes.default).toEqual({ customised: false, offered: defaultOfferedModels("default"), chosen: null });
    expect(j.orgs[0].purposes.vision.offered).toEqual(defaultOfferedModels("vision"));
  });
  it("PUT sets one Org's list for one purpose; GET shows it customised, and the OrgAdmin's choice beside it", async () => {
    expect((await put({ orgId: "o1", purpose: "default", ids: ["claude-opus-5", "claude-sonnet-5-5"] })).status).toBe(200);
    h.settings.set("ai.org.o1.chosen.default", "claude-sonnet-5-5");
    const j = await (await GET()).json();
    expect(j.orgs[0].purposes.default).toEqual({ customised: true, offered: ["claude-opus-5", "claude-sonnet-5-5"], chosen: "claude-sonnet-5-5" });
    expect(j.orgs[1].purposes.default.customised).toBe(false);               // another Org untouched
    expect(j.orgs[0].purposes.vision.customised).toBe(false);                // another purpose untouched
  });
  it("narrowing a list clears an OrgAdmin choice that is no longer offered", async () => {
    await put({ orgId: "o1", purpose: "default", ids: ["claude-opus-5", "claude-sonnet-5-5"] });
    h.settings.set("ai.org.o1.chosen.default", "claude-sonnet-5-5");
    await put({ orgId: "o1", purpose: "default", ids: ["claude-opus-5"] });
    expect(h.settings.has("ai.org.o1.chosen.default")).toBe(false);
  });
  it("reset goes back to the default list; an empty list is allowed (the Org then uses the global setting)", async () => {
    await put({ orgId: "o1", purpose: "command", ids: [] });
    expect((await (await GET()).json()).orgs[0].purposes.command).toMatchObject({ customised: true, offered: [] });
    expect((await put({ orgId: "o1", purpose: "command", reset: true })).status).toBe(200);
    expect((await (await GET()).json()).orgs[0].purposes.command.customised).toBe(false);
  });
  it("refuses an unknown model, an unknown purpose, a missing Org and a bad body", async () => {
    expect((await put({ orgId: "o1", purpose: "default", ids: ["no-such-model"] })).status).toBe(400);
    expect((await put({ orgId: "o1", purpose: "nonsense", ids: [] })).status).toBe(400);
    expect((await put({ orgId: "nope", purpose: "default", ids: [] })).status).toBe(404);
    expect((await put({ orgId: "o1", purpose: "default", ids: "all" })).status).toBe(400);
    expect(h.settings.size).toBe(0);
  });
  it("read-only impersonation is blocked; every change is audited with the Org and purpose", async () => {
    h.readOnly = true;
    expect((await put({ orgId: "o1", purpose: "default", ids: [] })).status).toBe(403);
    expect(h.settings.size).toBe(0);
    h.readOnly = false;
    await put({ orgId: "o2", purpose: "vision", ids: ["claude-opus-5"] });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({ action: "ai.org-models.update", targetType: "org", targetId: "o2", orgId: "o2", meta: { purpose: "vision", reset: false, count: 1 } });
  });
});

describe("T5256 the screen", () => {
  const tile = readFileSync("app/(dashboard)/dashboard/admin/ai-model/AiModelClient.tsx", "utf8");
  const editor = readFileSync("app/(dashboard)/dashboard/admin/ai-model/OrgModelListsEditor.tsx", "utf8");
  it("the AI Model tile carries the Organisations section, below the global settings, fed every model", () => {
    expect(tile).toContain("<OrgModelListsEditor models={models} />");
    expect(tile.indexOf("<OrgModelListsEditor")).toBeGreaterThan(tile.indexOf("Nothing changes until you press Save."));
  });
  it("it edits the three purposes per Org, hides non-vision models from the Vision list, and offers All Anthropic / None / Reset / Save", () => {
    for (const p of ["default", "vision", "command"]) expect(editor).toContain(`key: "${p}"`);
    expect(editor).toContain('key !== "vision" || m.vision !== false');
    for (const b of ["All Anthropic", "None", "Reset", "Save"]) expect(editor).toContain(b);
    expect(editor).toContain("An empty list means the organisation uses the global setting.");
    expect(editor).toContain("Ordinary users never choose a model and never see one.");
  });
  it("the audit verb is a named constant", () => {
    expect(readFileSync("app/lib/audit.ts", "utf8")).toContain('AiOrgModelsUpdate: "ai.org-models.update"');
  });
});
