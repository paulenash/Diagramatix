/**
 * T5290 — an Org's own Process Repository and the OrgAdmin's "Master Template Value Chain Generation" (Paul, 2026-10-08).
 *
 * The master repository (orgId "") is SuperAdmin's; each Org may keep its own (orgId = the Org). An Org chain that is PUBLISHED replaces the master's
 * for that Org's users; the rest of the master still shows. The OrgAdmin adopts, edits, regenerates and publishes; a new master template version shows
 * as an out-of-date count to act on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// ── what a user sees: the merge of master and Org ───────────────────────────────────────────────────────────────────────
type Row = { id: string; orgId: string; code: string; sortOrder: number; hidden: boolean; publishedAt: Date | null; title: string; processes: []; prompts: [] };
const row = (orgId: string, code: string, extra: Partial<Row> = {}): Row =>
  ({ id: `${orgId || "M"}-${code}`, orgId, code, sortOrder: Number(code.slice(1)), hidden: false, publishedAt: new Date("2026-10-01"), title: `${orgId || "master"} ${code}`, processes: [], prompts: [], ...extra });
let table: Row[] = [];
vi.mock("@/app/lib/db", () => ({
  prisma: {
    valueChainLibrary: {
      findMany: async ({ where }: { where: { orgId: string; publishedAt?: unknown } }) =>
        table.filter((r) => r.orgId === where.orgId && (!where.publishedAt || r.publishedAt !== null)).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
      findFirst: async ({ where }: { where: { orgId: string; code: string; publishedAt?: unknown; hidden?: boolean } }) =>
        table.find((r) => r.orgId === where.orgId && r.code === where.code && (!where.publishedAt || r.publishedAt !== null) && (where.hidden === undefined || r.hidden === where.hidden)) ?? null,
    },
  },
}));

describe("T5290 what an Org's users see", () => {
  beforeEach(() => { table = [row("", "V01"), row("", "V02"), row("", "V03"), row("orgA", "V01", { title: "orgA V01" })]; });

  it("an Org's PUBLISHED chain replaces the master's with the same code; the other master chains still show", async () => {
    const { publishedChainsFor } = await import("@/app/lib/valueChain/repositoryChains");
    const seen = await publishedChainsFor("orgA");
    expect(seen.map((c) => `${c.code}:${c.source}`)).toEqual(["V01:org", "V02:master", "V03:master"]);
    expect(seen[0].title).toBe("orgA V01");
  });
  it("another Org, and a user with no Org, see only the master", async () => {
    const { publishedChainsFor } = await import("@/app/lib/valueChain/repositoryChains");
    expect((await publishedChainsFor("orgB")).map((c) => c.source)).toEqual(["master", "master", "master"]);
    expect((await publishedChainsFor(null)).map((c) => c.source)).toEqual(["master", "master", "master"]);
  });
  it("an Org chain that is only a DRAFT changes nothing for its users", async () => {
    table = [row("", "V01"), row("orgA", "V01", { publishedAt: null })];
    const { publishedChainsFor, publishedChainFor } = await import("@/app/lib/valueChain/repositoryChains");
    expect((await publishedChainsFor("orgA")).map((c) => c.source)).toEqual(["master"]);
    expect((await publishedChainFor("V01", "orgA"))?.source).toBe("master");
  });
  it("hidden chains are never offered; an Org hides a master chain by adopting, hiding and publishing it", async () => {
    table = [row("", "V01"), row("", "V02", { hidden: true }), row("", "V03"), row("orgA", "V03", { hidden: true })];
    const { publishedChainsFor, publishedChainFor } = await import("@/app/lib/valueChain/repositoryChains");
    expect((await publishedChainsFor("orgA")).map((c) => c.code)).toEqual(["V01"]);
    expect(await publishedChainFor("V03", "orgA")).toBeNull();          // the Org's hidden version wins; the master's V03 does not leak back
    expect(await publishedChainFor("V02", "orgA")).toBeNull();
  });
  it("an Org's own additional chain (no master counterpart) shows after the master ones", async () => {
    table = [row("", "V01"), row("orgA", "V90")];
    const { publishedChainsFor } = await import("@/app/lib/valueChain/repositoryChains");
    expect((await publishedChainsFor("orgA")).map((c) => `${c.code}:${c.source}`)).toEqual(["V01:master", "V90:org"]);
    expect((await publishedChainsFor("orgB")).map((c) => c.code)).toEqual(["V01"]);
  });
});

// ── nothing reaches the wrong repository ──────────────────────────────────────────────────────────────────────────────────
const walk = (dir: string, out: string[] = []): string[] => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "generated" || e === "node_modules" || e === ".next") continue;
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
};

describe("T5290 every library query names its repository", () => {
  it("a ratchet: each read of the chains table in app/ and scripts/ is bounded by orgId (or a unique id), so the master screen can never list an Org's chains", () => {
    const bad: string[] = [];
    for (const f of [...walk("app"), ...walk("scripts")]) {
      const src = readFileSync(f, "utf8");
      const re = /valueChainLibrary\.(findMany|findFirst|findUnique|count|aggregate)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const call = src.slice(m.index, m.index + 420);
        if (!/orgId|scopeOrg|where: \{ id\b|where: \{ id:/.test(call)) bad.push(`${f.split("\\").join("/")}: ${call.split("\n")[0].trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("and each read of the prompts table reaches them through a chain", () => {
    const bad: string[] = [];
    for (const f of [...walk("app"), ...walk("scripts")]) {
      const src = readFileSync(f, "utf8");
      const re = /valueChainPrompt\.(findMany|findFirst)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const call = src.slice(m.index, m.index + 420);
        if (!/chain: \{ orgId|chainId/.test(call)) bad.push(`${f.split("\\").join("/")}: ${call.split("\n")[0].trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("the schema: orgId defaults to the master (empty) and a code is unique per repository", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const model = schema.slice(schema.indexOf("model ValueChainLibrary {"), schema.indexOf("model ValueChainProcess {"));
    expect(model).toContain('orgId     String  @default("")');
    expect(model).toContain("@@unique([orgId, code])");
    expect(model).toContain("masterPublishedAt DateTime?");
  });
});

describe("T5290 the maintenance handlers keep an Org inside its own repository", () => {
  const lib = readFileSync("app/lib/valueChain/libraryAdmin.ts", "utf8");
  it("every id-addressed action checks the chain is in scope, and an Org cannot import a file", () => {
    expect(lib).toContain("const ownsChain = async (id: string) =>");
    for (const guard of ['if (!(await ownsChain(id))) return NextResponse.json({ error: "Chain not found" }, { status: 404 });',
      'if (!(await ownsChain(chainId))) return NextResponse.json({ error: "Chain not found" }, { status: 404 });']) expect(lib).toContain(guard);
    expect(lib.match(/ownsChain\(/g)!.length).toBe(3);          // save-chain, save-processes, delete-chain
    expect(lib).toContain('if (scopeOrg && action === "import")');
  });
  it("adopt copies only the master's PUBLISHED content as a draft; sync replaces an adopted chain; both stamp which master version", () => {
    expect(lib).toContain('if (scopeOrg && (action === "adopt" || action === "sync"))');
    expect(lib).toContain("const livePrompts = master.prompts.filter((p) => (p.publishedPrompt ?? \"\").trim());");
    expect(lib).toContain("masterPublishedAt: master.publishedAt");
    expect(lib).toContain("prompt: p.publishedPrompt!");
    expect(lib).toContain("already in your repository");
  });
  it("an Org's regeneration uses the Org's model and its own template additions, and is metered one attempt per prompt", () => {
    expect(lib).toContain("scopeOrg ? await resolveOrgModel() : await masterLibraryModel()");
    // The Org's own additions are loaded by the shared loader (storePrompt.ts), which the handler calls with the Org's id.
    expect(lib).toContain("loadPromptBriefing(t, scopeOrg || null)");
    expect(readFileSync("app/lib/valueChain/storePrompt.ts", "utf8")).toContain("where: { category: mdPromptCategory(type), orgId, userId: null }");
    expect(lib).toContain('if (scopeOrg) await recordUsage(userId, "aiAttempts");');
    expect(lib).toContain('const blocked = await gateLimit(userId, "aiAttempts");');
  });
  it("the wrappers: SuperAdmin passes the master scope; the OrgAdmin route is guarded and passes the active Org", () => {
    const master = readFileSync("app/api/admin/value-chain-library/route.ts", "utf8");
    expect(master).toContain("isSuperuser(session)");
    expect(master).toContain('libraryGet(req, "")');
    expect(master).toContain('libraryPost(req, session as LibrarySession, "")');
    const org = readFileSync("app/api/org-admin/value-chain-library/route.ts", "utf8");
    expect(org).toContain("guardOrgRoute(a.orgId, { mutate: false })");
    expect(org).toContain("guardOrgRoute(a.orgId, { mutate: true })");
    expect(org).toContain("libraryGet(req, a.orgId)");
    expect(org).toContain("libraryPost(req, a.session, a.orgId)");
    expect(org).not.toContain("isSuperuser");
  });
});

describe("T5290 the OrgAdmin tile, page and screen", () => {
  it("the tile is on the OrgAdmin dashboard and its page needs an OrgAdmin of the active Org", () => {
    expect(readFileSync("app/(dashboard)/dashboard/org-admin/OrgAdminClient.tsx", "utf8")).toContain('title: "Master Template Value Chain Generation"');
    const page = readFileSync("app/(dashboard)/dashboard/org-admin/value-chain-generation/page.tsx", "utf8");
    expect(page).toContain("requireOrgAdminFor(session, cookieStore, orgId)");
    expect(page).toContain('<ValueChainLibraryClient scope="org" />');
  });
  it("the same screen, pointed at the Org's API: no file import, an adopt list, 'master updated' marks and the new-template-version banner", () => {
    const ui = readFileSync("app/(dashboard)/dashboard/admin/value-chain-library/ValueChainLibraryClient.tsx", "utf8");
    // (2026-10-10: the same screen also serves "mine" and a SuperAdmin's picked Org, so the API and the master-only sections key off `scope` and `view`.)
    expect(ui).toContain('scope === "org" ? "/api/org-admin/value-chain-library"');
    expect(ui).toContain('"/api/admin/value-chain-library"');
    expect(ui).toContain('{view === "master" && (');
    expect(ui).toContain("<AdoptFromMaster api={API}");
    expect(ui).toContain("master updated");
    expect(ui).toContain("The master template is now <strong>v{t.version}</strong>");
    expect(ui).toContain("Master Template Value Chain Generation");
  });
});

describe("T5290 the user flows read the merged repository", () => {
  it("the chain list, the questions and the runner use the Org-aware loaders; a generated diagram records which repository it came from", () => {
    expect(readFileSync("app/api/repository/chains/route.ts", "utf8")).toContain("publishedChainsFor(orgId)");
    expect(readFileSync("app/api/repository/questions/route.ts", "utf8")).toContain("publishedChainFor(code, orgId)");
    const run = readFileSync("app/lib/valueChain/runLibraryProject.ts", "utf8");
    expect(run).toContain("await publishedChainFor(chainCode, libOrg)");
    expect(run).toContain('scope: row.orgId ? "org" as const : "master" as const,');
    expect(readFileSync("app/api/diagrams/[id]/freshness/route.ts", "utf8")).toContain('chain: { orgId: chainOrg }');
  });
});
