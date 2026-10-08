/**
 * T5291 — the backups carry the Process Repository (Paul, 2026-10-09: "check that the full backup backs up any new tables" and "check OrgAdmin
 * backup backs up any modified Process Repository Value Chains").
 *
 *   • the SuperAdmin FULL backup is catalog-driven, so it carries every chain — the master's AND each Org's — with the new orgId / masterPublishedAt
 *     columns;
 *   • the ORG backup carries that Org's OWN chains (adopted from the master and modified, or written) with their processes and prompts, drafts and
 *     published text both — and never the master's or another Org's;
 *   • an additive org restore recreates a chain the target Org lacks (fresh ids, orgId = the target) and leaves one it already has exactly as it is.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { buildOrgBackup, restoreOrgBackupAdditive, scopePayloadToOrg } from "@/app/lib/org-backup";
import { buildFullBackup, parseFullBackup, type AdditiveSelection } from "@/app/lib/full-backup";

type Row = Record<string, unknown>;
const rows = (payload: { tables: Record<string, unknown> }, t: string) => (payload.tables[t] as Row[] | undefined) ?? [];

async function chain(orgId: string, code: string, narrative: string, extra: { masterPublishedAt?: Date } = {}) {
  const c = await prisma.valueChainLibrary.create({
    data: { orgId, code, title: `${orgId || "master"} ${code}`, narrative, publishedNarrative: narrative, publishedTitle: `${orgId || "master"} ${code}`, publishedAt: new Date("2026-10-01"), ...extra },
  });
  await prisma.valueChainProcess.createMany({ data: [
    { chainId: c.id, code: `${code}.01`, title: "First", sortOrder: 1 },
    { chainId: c.id, code: `${code}.02`, title: "Second", sortOrder: 2 },
  ] });
  await prisma.valueChainPrompt.createMany({ data: [
    { chainId: c.id, type: "bpmn", processCode: `${code}.01`, name: `${code}.01 First`, prompt: "DRAFT TEXT 1", publishedPrompt: "PUBLISHED TEXT 1", roundTripsOk: true },
    { chainId: c.id, type: "value-chain", processCode: "", name: `${code} chain`, prompt: "DRAFT CHAIN", publishedPrompt: null, roundTripsOk: true },
  ] });
  return c;
}

describe("T5291 the full backup carries every chain and the new columns", () => {
  beforeEach(async () => { await truncateAll(); });

  it("master and Org chains, with orgId and masterPublishedAt, and their processes and prompts", async () => {
    const { org } = await createUserWithOrg();
    await chain("", "V01", "master narrative");
    await chain(org.id, "V01", "org narrative", { masterPublishedAt: new Date("2026-09-30T10:00:00Z") });
    const payload = await parseFullBackup(await buildFullBackup("admin@test", "test"));
    const chains = rows(payload, "ValueChainLibrary");
    expect(chains.map((c) => `${c.orgId || "master"}:${c.code}`).sort()).toEqual([`${org.id}:V01`, "master:V01"].sort());
    expect(String(chains.find((c) => c.orgId === org.id)!.masterPublishedAt)).toContain("2026-09-30");
    expect(rows(payload, "ValueChainProcess")).toHaveLength(4);
    expect(rows(payload, "ValueChainPrompt")).toHaveLength(4);
  });
});

describe("T5291 the Org backup carries the Org's own repository, and only that", () => {
  beforeEach(async () => { await truncateAll(); });

  it("the Org's chains with drafts and published text; not the master's, not another Org's", async () => {
    const { org } = await createUserWithOrg({ email: "a@test.dev" });
    const other = (await createUserWithOrg({ email: "b@test.dev" })).org;
    await chain("", "V01", "master narrative");
    await chain(org.id, "V01", "my narrative", { masterPublishedAt: new Date("2026-09-30T10:00:00Z") });
    await chain(org.id, "V07", "my other chain");
    await chain(other.id, "V09", "someone else's");

    const payload = await parseFullBackup(await buildOrgBackup(org.id, "admin@test", "test"));
    const chains = rows(payload, "ValueChainLibrary");
    expect(chains.map((c) => c.code).sort()).toEqual(["V01", "V07"]);
    expect(chains.every((c) => c.orgId === org.id)).toBe(true);
    expect(chains.find((c) => c.code === "V01")!.narrative).toBe("my narrative");
    const prompts = rows(payload, "ValueChainPrompt");
    expect(prompts).toHaveLength(4);
    expect(prompts.some((p) => p.prompt === "DRAFT TEXT 1" && p.publishedPrompt === "PUBLISHED TEXT 1")).toBe(true);   // both the draft and the published text
    expect(rows(payload, "ValueChainProcess")).toHaveLength(4);
    expect(payload.counts.ValueChainLibrary).toBe(2);
  });

  it("scoping a wider backup to an Org keeps that Org's chains only", async () => {
    const { org } = await createUserWithOrg({ email: "a@test.dev" });
    const other = (await createUserWithOrg({ email: "b@test.dev" })).org;
    await chain("", "V01", "master"); await chain(org.id, "V02", "mine"); await chain(other.id, "V03", "theirs");
    const wide = await parseFullBackup(await buildFullBackup("admin@test", "test"));
    const scoped = scopePayloadToOrg(wide, org.id);
    expect(rows(scoped, "ValueChainLibrary").map((c) => c.code)).toEqual(["V02"]);
    expect(rows(scoped, "ValueChainProcess")).toHaveLength(2);
    expect(rows(scoped, "ValueChainPrompt")).toHaveLength(2);
  });

  it("an additive restore recreates a chain the target Org lacks, with fresh ids, and never touches the master", async () => {
    const { org } = await createUserWithOrg({ email: "a@test.dev" });
    await chain("", "V01", "master narrative");
    await chain(org.id, "V01", "my narrative", { masterPublishedAt: new Date("2026-09-30T10:00:00Z") });
    const payload = await parseFullBackup(await buildOrgBackup(org.id, "admin@test", "test"));

    const target = (await createUserWithOrg({ email: "c@test.dev" })).org;
    const selection: AdditiveSelection = { orgIds: rows(payload, "Org").map((o) => String(o.id)), userIds: rows(payload, "User").map((u) => String(u.id)), projectIds: [], diagramIds: [] };
    const res = await restoreOrgBackupAdditive(payload, selection, target.id);
    expect(res.inserted.ValueChainLibrary).toBe(1);

    const restored = await prisma.valueChainLibrary.findFirst({ where: { orgId: target.id, code: "V01" }, include: { processes: true, prompts: true } });
    expect(restored, "the chain is in the target Org's repository").toBeTruthy();
    expect(restored!.id).not.toBe((await prisma.valueChainLibrary.findFirst({ where: { orgId: org.id, code: "V01" } }))!.id);
    expect(restored!.narrative).toBe("my narrative");
    expect(restored!.masterPublishedAt?.toISOString()).toContain("2026-09-30");
    expect(restored!.processes).toHaveLength(2);
    expect(restored!.prompts.find((p) => p.processCode === "V01.01")).toMatchObject({ prompt: "DRAFT TEXT 1", publishedPrompt: "PUBLISHED TEXT 1" });
    // the master chain of the same code is exactly as it was
    expect((await prisma.valueChainLibrary.findFirst({ where: { orgId: "", code: "V01" } }))!.narrative).toBe("master narrative");
  });

  it("restoring again, or into an Org that already has the chain, adds nothing and overwrites nothing", async () => {
    const { org } = await createUserWithOrg({ email: "a@test.dev" });
    await chain(org.id, "V01", "my narrative");
    const payload = await parseFullBackup(await buildOrgBackup(org.id, "admin@test", "test"));
    const target = (await createUserWithOrg({ email: "c@test.dev" })).org;
    await chain(target.id, "V01", "THE TARGET'S OWN, CHANGED");                  // the target already has V01
    const selection: AdditiveSelection = { orgIds: rows(payload, "Org").map((o) => String(o.id)), userIds: rows(payload, "User").map((u) => String(u.id)), projectIds: [], diagramIds: [] };
    const first = await restoreOrgBackupAdditive(payload, selection, target.id);
    expect(first.inserted.ValueChainLibrary ?? 0).toBe(0);
    expect((await prisma.valueChainLibrary.findFirst({ where: { orgId: target.id, code: "V01" } }))!.narrative).toBe("THE TARGET'S OWN, CHANGED");
    expect(await prisma.valueChainLibrary.count({ where: { orgId: target.id } })).toBe(1);
  });

  it("an Org that was not selected is not restored", async () => {
    const { org } = await createUserWithOrg({ email: "a@test.dev" });
    await chain(org.id, "V05", "mine");
    const payload = await parseFullBackup(await buildOrgBackup(org.id, "admin@test", "test"));
    const target = (await createUserWithOrg({ email: "c@test.dev" })).org;
    const res = await restoreOrgBackupAdditive(payload, { orgIds: [], userIds: [], projectIds: [], diagramIds: [] }, target.id);
    expect(res.inserted.ValueChainLibrary ?? 0).toBe(0);
    expect(await prisma.valueChainLibrary.count({ where: { orgId: target.id } })).toBe(0);
  });
});
