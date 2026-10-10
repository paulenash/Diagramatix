/**
 * T5301 — "Create a New Value Chain", slice 3 (Paul, 2026-10-10): creating the chain and writing its prompts. The database, the model and
 * the allowance are faked; what is under test is the plan, the code allocation, the metering and halting, resume, and who may do what.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { latestChainNarrativeVersion, NARRATIVE_LABELS, type BriefInput } from "@/app/lib/valueChain/chainNarrative";
import { canDeleteChain, canManageChain, isUserChain, type ChainActor } from "@/app/lib/valueChain/chainPermissions";

// ── fakes ───────────────────────────────────────────────────────────────────────────────
type Chain = { id: string; orgId: string; code: string; sortOrder: number };
let chains: Chain[] = [];
let prompts: { chainId: string; type: string; processCode: string }[] = [];
let createCalls: unknown[] = [];
let briefInserts: unknown[][] = [];
let failCreateOnce = false;
let published: string[] = [];

vi.mock("@/app/lib/db", () => ({
  prisma: {
    valueChainLibrary: {
      findMany: async ({ where }: { where: { orgId: string } }) => chains.filter((c) => c.orgId === where.orgId),
      create: async (args: { data: Record<string, unknown> }) => {
        createCalls.push(args.data);
        if (failCreateOnce) { failCreateOnce = false; chains.push({ id: "raced", orgId: String(args.data.orgId), code: String(args.data.code), sortOrder: 99 }); throw Object.assign(new Error("unique"), { code: "P2002" }); }
        const c = { id: `id_${chains.length + 1}`, orgId: String(args.data.orgId), code: String(args.data.code), sortOrder: Number(args.data.sortOrder) };
        chains.push(c);
        return { id: c.id };
      },
    },
    valueChainPrompt: { findMany: async ({ where }: { where: { chainId: string } }) => prompts.filter((p) => p.chainId === where.chainId) },
    appSetting: { findUnique: async () => null },
  },
  pgPool: { query: async (_sql: string, params: unknown[]) => { briefInserts.push(params); return { rows: [] }; } },
}));
vi.mock("@/app/lib/subscription", () => ({ getUsageSnapshot: async () => null }));

const brief = (n = 6): BriefInput => ({
  title: "Customer Onboarding", generalNarrative: "Sales captures a new customer, checks identity and credit, sets up accounts and welcomes them.",
  processes: Array.from({ length: n }, (_, i) => ({ title: `Process Number ${i + 1}`, details: `Details ${i + 1}` })),
});
function narrative(code: string, b: BriefInput): string {
  return [
    `## ${code} — ${b.title}`, "", ...NARRATIVE_LABELS.flatMap((l) => [l, "x", ""]),
    "| Process | External Actors | Teams (key role) | IT Systems |", "| --- | --- | --- | --- |", "",
    ...b.processes.flatMap((p, i) => [`### ${code}.${String(i + 1).padStart(2, "0")} — ${p.title}`, "Does it.", ""]),
  ].join("\n");
}

beforeEach(() => { chains = []; prompts = []; createCalls = []; briefInserts = []; failCreateOnce = false; published = []; });

describe("T5301 the plan", () => {
  it("writes Value Chain and Context always, the optional two when chosen, then one BPMN prompt per process", async () => {
    const { planTargets, plannedPromptCount, chainPromptTypes } = await import("@/app/lib/valueChain/newChain");
    const subs = [{ code: "C01.01", title: "A" }, { code: "C01.02", title: "B" }, { code: "C01.03", title: "C" }, { code: "C01.04", title: "D" }, { code: "C01.05", title: "E" }];
    const key = (o: { processContext: boolean; archimate: boolean }) => planTargets("C01", "T", subs, o).map((t) => (t.type === "bpmn" ? t.code : t.type));
    expect(key({ processContext: false, archimate: false })).toEqual(["value-chain", "context", "C01.01", "C01.02", "C01.03", "C01.04", "C01.05"]);
    expect(key({ processContext: true, archimate: true })).toEqual(["value-chain", "context", "process-context", "archimate", "C01.01", "C01.02", "C01.03", "C01.04", "C01.05"]);
    expect(chainPromptTypes({ processContext: false, archimate: true })).toEqual(["value-chain", "context", "archimate", "bpmn"]);
    expect(plannedPromptCount({ processContext: false, archimate: false }, 5)).toBe(7);          // the minimum Paul's rule allows
    expect(plannedPromptCount({ processContext: true, archimate: true }, 12)).toBe(16);         // and the maximum
  });
  it("only a literal true switches an option on", async () => {
    const { normaliseOptions } = await import("@/app/lib/valueChain/newChain");
    expect(normaliseOptions({ processContext: "yes", archimate: 1 })).toEqual({ processContext: false, archimate: false });
    expect(normaliseOptions(undefined)).toEqual({ processContext: false, archimate: false });
    expect(normaliseOptions({ processContext: true })).toEqual({ processContext: true, archimate: false });
  });
  it("a resume writes only what is missing", async () => {
    const { planTargets, missingTargets } = await import("@/app/lib/valueChain/newChain");
    const subs = [{ code: "C01.01", title: "A" }, { code: "C01.02", title: "B" }];
    const all = planTargets("C01", "T", subs, { processContext: false, archimate: false });
    prompts = [{ chainId: "x", type: "value-chain", processCode: "" }, { chainId: "x", type: "bpmn", processCode: "C01.01" }, { chainId: "other", type: "context", processCode: "" }];
    expect((await missingTargets("x", all)).map((t) => (t.type === "bpmn" ? t.code : t.type))).toEqual(["context", "C01.02"]);
  });
});

describe("T5301 creating the chain", () => {
  const args = (b: BriefInput, over: Record<string, unknown> = {}) => ({
    orgId: "orgA", userId: "u1", userName: "Una User", brief: b, narrative: narrative("C01", b), provisionalCode: "C01",
    options: { processContext: true, archimate: false }, answers: [{ label: "Task detail", answer: "Detailed" }],
    narrativeTemplateVersion: latestChainNarrativeVersion().version, narrativeModel: "m", ...over,
  });
  it("takes the Org's next C number, ignoring V chains and other Orgs, and records the owner", async () => {
    chains = [{ id: "1", orgId: "orgA", code: "V01", sortOrder: 1 }, { id: "2", orgId: "orgA", code: "C01", sortOrder: 2 }, { id: "3", orgId: "orgB", code: "C07", sortOrder: 1 }];
    const { createUserChain } = await import("@/app/lib/valueChain/newChain");
    const r = await createUserChain(args(brief()));
    expect(r.ok && r.code).toBe("C02");
    const data = createCalls[0] as Record<string, unknown>;
    expect(data).toMatchObject({ orgId: "orgA", code: "C02", title: "Customer Onboarding", createdByUserId: "u1", createdByName: "Una User" });
    expect(data.publishedAt).toBeUndefined();                                      // a draft until every prompt exists
  });
  it("creates the processes as C02.01.. with the author's details, and re-issues the narrative under the real code", async () => {
    chains = [{ id: "2", orgId: "orgA", code: "C01", sortOrder: 2 }];
    const { createUserChain } = await import("@/app/lib/valueChain/newChain");
    const r = await createUserChain(args(brief(5), { narrative: narrative("C01", brief(5)) }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const data = createCalls[0] as { narrative: string; processes: { create: { code: string; title: string; details: string; sortOrder: number }[] } };
    expect(data.processes.create.map((p) => [p.code, p.title, p.details, p.sortOrder])).toEqual(
      [["C02.01", "Process Number 1", "Details 1", 0], ["C02.02", "Process Number 2", "Details 2", 1], ["C02.03", "Process Number 3", "Details 3", 2],
       ["C02.04", "Process Number 4", "Details 4", 3], ["C02.05", "Process Number 5", "Details 5", 4]]);
    expect(data.narrative.startsWith("## C02 — Customer Onboarding")).toBe(true);
    expect(data.narrative).not.toMatch(/\bC01\b/);
    expect(r.narrative).toBe(data.narrative);
  });
  it("keeps the author's own words in a brief row (options and answers as JSON, the template version, the model)", async () => {
    const { createUserChain } = await import("@/app/lib/valueChain/newChain");
    await createUserChain(args(brief()));
    const p = briefInserts[0];
    expect(p[2]).toBe(brief().generalNarrative);
    expect(JSON.parse(String(p[3]))).toEqual({ processContext: true, archimate: false });
    expect(JSON.parse(String(p[4]))).toEqual([{ label: "Task detail", answer: "Detailed" }]);
    expect(p[5]).toBe(latestChainNarrativeVersion().version);
    expect(p[6]).toBe("m");
  });
  it("settles a lost race on the unique code by trying the next number", async () => {
    failCreateOnce = true;
    const { createUserChain } = await import("@/app/lib/valueChain/newChain");
    const r = await createUserChain(args(brief()));
    expect(r.ok && r.code).toBe("C02");                  // C01 was taken by the other writer between the read and the insert
    expect(createCalls).toHaveLength(2);
  });
  it("refuses a narrative that no longer matches the process list (the author edited a heading away)", async () => {
    const { createUserChain } = await import("@/app/lib/valueChain/newChain");
    const broken = narrative("C01", brief()).replace("— Process Number 3", "— Something Else");
    const r = await createUserChain(args(brief(), { narrative: broken }));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(422); expect(r.error).toMatch(/no longer fits/); }
    expect(createCalls).toHaveLength(0);                 // nothing was created
  });
});

// ── the streamed run ────────────────────────────────────────────────────────────────────
describe("T5301 the run: metering, halting, resume, publish", () => {
  const events: Record<string, unknown>[] = [];
  let storeResults: Array<{ status: "done" } | { status: "error"; message: string } | { status: "refused"; message: string }> = [];
  let allow = Infinity;
  let usage = 0;
  let stored: string[] = [];

  async function run(over: { isSuper?: boolean; targetsOnly?: number } = {}) {
    vi.resetModules();
    vi.doMock("@/app/lib/valueChain/storePrompt", () => ({
      loadPromptBriefing: async () => ({ briefing: "B", additions: "" }),
      generateAndStorePrompt: async (a: { target: { type: string; code: string } }) => {
        const r = storeResults.shift() ?? { status: "done" as const };
        if (r.status === "done") { stored.push(a.target.type === "bpmn" ? a.target.code : a.target.type); prompts.push({ chainId: "c1", type: a.target.type, processCode: a.target.type === "bpmn" ? a.target.code : "" }); return { status: "done", chars: 100, roundTrips: true, dataObjects: 0, standardLoops: 0 }; }
        return r;
      },
    }));
    vi.doMock("@/app/lib/subscription-route", () => ({
      gateLimit: async () => (usage >= allow ? { json: async () => ({ message: "Limit reached." }) } : null),
      recordUsage: async () => { usage++; },
    }));
    vi.doMock("@/app/lib/valueChain/publishChain", () => ({ publishChainById: async (id: string) => { published.push(id); } }));
    vi.doMock("@/app/lib/valueChain/entityNames", () => ({ loadEntityNames: async () => "" }));
    const { planTargets } = await import("@/app/lib/valueChain/newChain");
    const { streamChainRun } = await import("@/app/lib/valueChain/newChainRun");
    const subs = [{ code: "C01.01", title: "A" }, { code: "C01.02", title: "B" }, { code: "C01.03", title: "C" }, { code: "C01.04", title: "D" }, { code: "C01.05", title: "E" }];
    const all = planTargets("C01", "T", subs, { processContext: false, archimate: false });
    const todo = over.targetsOnly ? all.slice(-over.targetsOnly) : all;
    const res = streamChainRun({
      userId: "u1", orgId: "orgA", isSuper: !!over.isSuper, chain: { id: "c1", code: "C01", title: "T", narrative: "N" }, subs,
      allTargets: all, targets: todo, answers: [], model: "m", apiKey: "k", first: { t: "chain", chainId: "c1" },
    });
    events.length = 0;
    const text = await res.text();
    for (const l of text.split("\n").filter(Boolean)) events.push(JSON.parse(l));
    return events;
  }
  beforeEach(() => { storeResults = []; allow = Infinity; usage = 0; stored = []; });
  const last = () => events[events.length - 1];

  it("writes every planned prompt, charges one attempt each, and publishes the finished chain", async () => {
    await run();
    expect(stored).toEqual(["value-chain", "context", "C01.01", "C01.02", "C01.03", "C01.04", "C01.05"]);
    expect(usage).toBe(7);
    expect(last()).toMatchObject({ t: "done", written: 7, failed: 0, complete: true, published: true });
    expect(published).toEqual(["c1"]);
    expect(events[0]).toEqual({ t: "chain", chainId: "c1" });
  });
  it("a SuperAdmin is not charged", async () => {
    await run({ isSuper: true });
    expect(usage).toBe(0);
    expect(last()).toMatchObject({ complete: true });
  });
  it("stops cleanly at the allowance with what it has written, leaves the chain a draft, and says how to carry on", async () => {
    allow = 3;
    await run();
    expect(stored).toHaveLength(3);
    const halted = events.find((e) => e.t === "halted")!;
    expect(halted).toMatchObject({ reason: "limit", written: 3, remaining: 4 });
    expect(String(halted.message)).toMatch(/carry on later/);
    expect(last()).toMatchObject({ t: "done", written: 3, complete: false, published: false });
    expect(published).toEqual([]);
  });
  it("a resume writes the rest and then publishes", async () => {
    allow = 3;
    await run();
    allow = Infinity; usage = 0; stored = []; events.length = 0;
    // prompts now hold the first three; ask for the remaining four only
    await run({ targetsOnly: 4 });
    expect(stored).toEqual(["C01.02", "C01.03", "C01.04", "C01.05"].slice(0, 4));
    expect(usage).toBe(4);                                   // charged for the four written, never for the three already there
    expect(last()).toMatchObject({ complete: true, published: true });
  });
  it("a failed or refused prompt is not charged, the run continues, and the chain is NOT published", async () => {
    storeResults = [{ status: "done" }, { status: "error", message: "The model returned an empty prompt" }, { status: "refused", message: "asks for a loop-back — not stored" }];
    await run();
    expect(usage).toBe(5);                                   // 7 attempted, 2 not stored
    expect(last()).toMatchObject({ written: 5, failed: 1, refused: 1, complete: false, published: false });
    expect(published).toEqual([]);
  });
  it("a spend cap halts the run instead of failing every remaining prompt", async () => {
    storeResults = [{ status: "done" }, { status: "error", message: "Your credit balance is too low to access the Anthropic API" }];
    await run();
    expect(events.some((e) => e.t === "halted" && e.reason === "quota")).toBe(true);
    expect(stored).toHaveLength(1);                          // nothing after the cap was attempted
    expect(last()).toMatchObject({ complete: false, published: false });
  });
});

// ── who may do what ─────────────────────────────────────────────────────────────────────
describe("T5301 permissions", () => {
  const chain = { orgId: "orgA", createdByUserId: "owner" };
  const actor = (over: Partial<ChainActor>): ChainActor => ({ userId: "x", orgId: "orgA", isSuper: false, isOrgAdmin: false, ...over });
  it("manage: the owner, an OrgAdmin of the same Org, and a SuperAdmin — nobody else", () => {
    expect(canManageChain(actor({ userId: "owner" }), chain)).toBe(true);
    expect(canManageChain(actor({ isOrgAdmin: true }), chain)).toBe(true);
    expect(canManageChain(actor({ isSuper: true, orgId: "elsewhere" }), chain)).toBe(true);
    expect(canManageChain(actor({}), chain)).toBe(false);                                       // another member
    expect(canManageChain(actor({ userId: "owner", orgId: "orgB" }), chain)).toBe(false);       // the owner, but in another Org's context
    expect(canManageChain(actor({ isOrgAdmin: true, orgId: "orgB" }), chain)).toBe(false);      // another Org's admin
  });
  it("delete: the owner and a SuperAdmin only — an OrgAdmin never deletes", () => {
    expect(canDeleteChain(actor({ userId: "owner" }), chain)).toBe(true);
    expect(canDeleteChain(actor({ isSuper: true }), chain)).toBe(true);
    expect(canDeleteChain(actor({ isOrgAdmin: true }), chain)).toBe(false);
  });
  it("the master repository and adopted chains are nobody's to manage by ownership", () => {
    expect(canManageChain(actor({ isOrgAdmin: true }), { orgId: "", createdByUserId: null })).toBe(false);
    expect(canManageChain(actor({ userId: "owner" }), { orgId: "orgA", createdByUserId: null })).toBe(false);
    expect(isUserChain({ orgId: "orgA", createdByUserId: "u" })).toBe(true);
    expect(isUserChain({ orgId: "orgA", createdByUserId: null })).toBe(false);
    expect(isUserChain({ orgId: "", createdByUserId: "u" })).toBe(false);
  });
});

// ── the routes ──────────────────────────────────────────────────────────────────────────
describe("T5301 the routes", () => {
  const dir = "app/api/repository/new-chain";
  const routes = readdirSync(dir).map((d) => ({ name: d, src: readFileSync(join(dir, d, "route.ts"), "utf8") }));
  it("there are exactly the six routes, and every one starts by requiring access (feature, level, policy, role)", () => {
    expect(routes.map((r) => r.name).sort()).toEqual(["access", "build-narrative", "create", "questions", "resume", "suggest-processes"]);
    for (const r of routes) {
      expect(r.src, r.name).toContain("requireNewChainAccess(session)");
      if (r.src.includes("req.json()")) expect(r.src.indexOf("requireNewChainAccess"), r.name).toBeLessThan(r.src.indexOf("req.json()"));    // before it reads anything
    }
  });
  it("the access helper blocks read-only impersonation itself (the mutating-route guard relies on it)", () => {
    expect(readFileSync("app/lib/valueChain/newChainAccess.ts", "utf8")).toContain("isReadOnlyImpersonation(session, jar)");
  });
  it("create checks the allowance and the Org's chain limit BEFORE it creates anything", () => {
    const src = routes.find((r) => r.name === "create")!.src;
    expect(src.indexOf("attemptsRemaining(")).toBeGreaterThan(0);
    expect(src.indexOf("attemptsRemaining(")).toBeLessThan(src.indexOf("createUserChain("));
    expect(src.indexOf("maxUserChainsPerOrg()")).toBeLessThan(src.indexOf("createUserChain("));
  });
  it("resume goes through canManageChain and answers 'not found' to anyone else", () => {
    const src = routes.find((r) => r.name === "resume")!.src;
    expect(src).toContain("canManageChain(access, run.chain)");
    expect(src).toMatch(/Value chain not found.*404|404.*Value chain not found/s);
  });
  it("no route tells the client which model is in use", () => {
    for (const r of routes) expect(r.src, r.name).not.toMatch(/NextResponse\.json\(\{[^}]*\bmodel\b/);
  });
  it("only prompts actually written are charged: the shared run records usage after a stored prompt, and the narrative / suggest routes after success", () => {
    for (const n of ["build-narrative", "suggest-processes"]) {
      const src = routes.find((r) => r.name === n)!.src;
      expect(src.indexOf("recordUsage(")).toBeGreaterThan(src.indexOf("gateLimit("));
    }
  });
});
