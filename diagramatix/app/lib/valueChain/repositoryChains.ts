/**
 * Which Process Repository chains a person sees (Paul, 2026-10-08).
 *
 * There is ONE master repository (orgId "") that SuperAdmin keeps, and each Org may keep its own (orgId = the Org's id) that an OrgAdmin builds by
 * adopting master chains and changing them. What an Org's users see in "Create Project from Process Repository" is the two put together:
 *   • an Org chain that is PUBLISHED replaces the master chain with the same code, for that Org's users only;
 *   • every master chain the Org has not published a version of still shows, as before.
 * An Org chain that is only a draft is invisible to users (publishing is the act that makes it so), and unpublishing it hands the code back to
 * the master. Hidden chains are never offered, wherever they live; an Org that wants a master chain gone for its users adopts it, hides it and
 * publishes.
 *
 * Every read of the library for a USER goes through here, so the rule is in one place.
 */
import { prisma } from "@/app/lib/db";

export const MASTER_ORG = "";

const WITH_CONTENT = {
  processes: { orderBy: { sortOrder: "asc" as const } },
  prompts: true,
};

export type ChainSource = "org" | "master";

/** The published, visible chain for `code` as `orgId` sees it, with its processes and prompts; null if there is none. */
export async function publishedChainFor(code: string, orgId: string | null | undefined) {
  if (orgId) {
    const own = await prisma.valueChainLibrary.findFirst({ where: { orgId, code, publishedAt: { not: null } }, include: WITH_CONTENT });
    if (own) return own.hidden ? null : { ...own, source: "org" as ChainSource };
  }
  const master = await prisma.valueChainLibrary.findFirst({ where: { orgId: MASTER_ORG, code, publishedAt: { not: null }, hidden: false }, include: WITH_CONTENT });
  return master ? { ...master, source: "master" as ChainSource } : null;
}

/** Every chain `orgId` sees, in the master's order with the Org's own chains standing in for the master ones they replace. */
export async function publishedChainsFor(orgId: string | null | undefined) {
  const [master, own] = await Promise.all([
    prisma.valueChainLibrary.findMany({ where: { orgId: MASTER_ORG, publishedAt: { not: null } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: WITH_CONTENT }),
    orgId
      ? prisma.valueChainLibrary.findMany({ where: { orgId, publishedAt: { not: null } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }], include: WITH_CONTENT })
      : Promise.resolve([]),
  ]);
  const ownByCode = new Map(own.map((c) => [c.code, c]));
  const out: ((typeof master)[number] & { source: ChainSource })[] = [];
  for (const m of master) {
    const o = ownByCode.get(m.code);
    if (o) { ownByCode.delete(m.code); if (!o.hidden) out.push({ ...o, source: "org" }); continue; }
    if (!m.hidden) out.push({ ...m, source: "master" });
  }
  // Org chains with no master counterpart (the Org's own additions) come after, in their own order.
  for (const o of own) if (ownByCode.has(o.code) && !o.hidden) out.push({ ...o, source: "org" });
  return out;
}
