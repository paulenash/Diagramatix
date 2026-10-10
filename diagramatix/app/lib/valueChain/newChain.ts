import { prisma } from "@/app/lib/db";
import { pgPool } from "@/app/lib/db";
import { getUsageSnapshot } from "@/app/lib/subscription";
import { nextUserChainCode, processCodeFor } from "./chainCodes";
import { rewriteChainCode, validateBuiltNarrative, type BriefInput } from "./chainNarrative";
import { targetsFor, type PromptTarget } from "./generatePrompt";
import { chainPromptTypes, normaliseOptions, plannedPromptCount, type NewChainOptions } from "./newChainPlan";

// The pure part of the plan lives in newChainPlan.ts (the wizard uses it in the browser); re-exported so server code has one import.
export { chainPromptTypes, normaliseOptions, plannedPromptCount, type NewChainOptions };

/**
 * The database side of "Create a New Value Chain" (Paul, 2026-10-10): what a run will write, how a chain is created, and what is still missing
 * when a stopped run is resumed.
 */

/** The targets for a chain, in writing order. */
export function planTargets(code: string, title: string, subs: { code: string; title: string }[], opts: NewChainOptions): PromptTarget[] {
  return targetsFor(code, title, subs, chainPromptTypes(opts));
}

const targetKey = (t: { type: string; code: string }) => (t.type === "bpmn" ? `bpmn:${t.code}` : t.type);

/** The targets with no stored prompt yet — what a resumed run still has to write. */
export async function missingTargets(chainId: string, targets: PromptTarget[]): Promise<PromptTarget[]> {
  const have = await prisma.valueChainPrompt.findMany({ where: { chainId }, select: { type: true, processCode: true } });
  const haveKeys = new Set(have.map((p) => (p.type === "bpmn" ? `bpmn:${p.processCode}` : p.type)));
  return targets.filter((t) => !haveKeys.has(targetKey(t)));
}

/** AI attempts this user can still spend; Infinity when unlimited (SuperAdmin, or a tier without a cap). */
export async function attemptsRemaining(userId: string): Promise<number> {
  const snap = await getUsageSnapshot(userId);
  const row = snap?.metrics.find((m) => m.metric === "aiAttempts");
  if (!snap || snap.isAdmin || !row || row.limit === null) return Infinity;
  return Math.max(0, row.limit - row.current);
}

// ── The cap on user-created chains per Org (Paul, 2026-10-10: a Feature Availability limit, default 10) ──
export const MAX_USER_CHAINS_KEY = "valueChain.userChains.maxPerOrg";
export const DEFAULT_MAX_USER_CHAINS = 10;

export async function maxUserChainsPerOrg(): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key: MAX_USER_CHAINS_KEY } }).catch(() => null);
  const n = Number(row?.value);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_MAX_USER_CHAINS;
}

export const userChainCount = (orgId: string): Promise<number> =>
  prisma.valueChainLibrary.count({ where: { orgId, createdByUserId: { not: null } } });

// ── Creating the chain ───────────────────────────────────────────────────────

export interface CreateUserChainArgs {
  orgId: string;
  userId: string;
  userName: string;
  brief: BriefInput;
  /** The approved structured narrative, written under `provisionalCode`. */
  narrative: string;
  provisionalCode: string;
  options: NewChainOptions;
  answers: { label: string; answer: string }[];
  narrativeTemplateVersion: number | null;
  narrativeModel: string | null;
}

export type CreateUserChainResult =
  | { ok: true; chainId: string; code: string; narrative: string; processes: { code: string; title: string }[] }
  | { ok: false; status: number; error: string };

/** The group name user-created chains sit under in the Org's list. */
export const USER_CHAIN_GROUP = "Our value chains";

/**
 * Allocate the next C code in the Org and create the chain, its processes and its brief, as a DRAFT owned by the author.
 *
 * The code is "one more than the Org's highest C number". Two people creating at once can pick the same number; the database's
 * unique(orgId, code) settles it — the loser's insert fails and tries again with the number now taken, up to a handful of times.
 * The approved narrative was written under a provisional code; it is re-issued under the real one and checked once more, because the
 * author may have edited it.
 */
export async function createUserChain(a: CreateUserChainArgs): Promise<CreateUserChainResult> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const existing = await prisma.valueChainLibrary.findMany({ where: { orgId: a.orgId }, select: { code: true, sortOrder: true } });
    const code = nextUserChainCode(existing.map((c) => c.code));
    const narrative = rewriteChainCode(a.narrative, a.provisionalCode, code);
    const problems = validateBuiltNarrative(narrative, code, a.brief);
    if (problems.length) return { ok: false, status: 422, error: `The narrative no longer fits the process list: ${problems.slice(0, 2).join(" ")}` };
    const sortOrder = existing.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;
    try {
      const chain = await prisma.valueChainLibrary.create({
        data: {
          orgId: a.orgId, code, title: a.brief.title, groupName: USER_CHAIN_GROUP, sortOrder, narrative,
          createdByUserId: a.userId, createdByName: a.userName,
          processes: { create: a.brief.processes.map((p, i) => ({ code: processCodeFor(code, i + 1), title: p.title, details: p.details, sortOrder: i })) },
        },
        select: { id: true },
      });
      // Json columns are written with raw SQL (Prisma 7 omits JSON from its inputs).
      await pgPool.query(
        `INSERT INTO "ValueChainBrief" (id, "chainId", "generalNarrative", options, answers, "narrativeTemplateVersion", "narrativeModel", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, NOW(), NOW())`,
        [`vcb_${chain.id}`, chain.id, a.brief.generalNarrative, JSON.stringify(a.options), JSON.stringify(a.answers), a.narrativeTemplateVersion, a.narrativeModel],
      );
      return { ok: true, chainId: chain.id, code, narrative, processes: a.brief.processes.map((p, i) => ({ code: processCodeFor(code, i + 1), title: p.title })) };
    } catch (err) {
      const unique = (err as { code?: string })?.code === "P2002";
      if (!unique) throw err;                       // not a lost race — a real fault
    }
  }
  return { ok: false, status: 409, error: "Could not allocate a value chain code — please try again." };
}

/** What a stopped run needs to carry on: the chain, its processes, the options and answers the author chose. Null when it is not a user chain. */
export async function loadChainForRun(chainId: string, orgId: string) {
  const chain = await prisma.valueChainLibrary.findFirst({
    where: { id: chainId, orgId, createdByUserId: { not: null } },
    include: { processes: { orderBy: { sortOrder: "asc" } }, brief: true },
  });
  if (!chain) return null;
  const options = normaliseOptions(chain.brief?.options);
  const answers = (Array.isArray(chain.brief?.answers) ? chain.brief!.answers as unknown[] : [])
    .filter((x): x is { label: string; answer: string } => !!x && typeof (x as { label?: unknown }).label === "string" && typeof (x as { answer?: unknown }).answer === "string");
  const subs = chain.processes.map((p) => ({ code: p.code, title: p.title }));
  return { chain, subs, options, answers, targets: planTargets(chain.code, chain.title, subs, options) };
}

// ── Handing a chain to someone else (OrgAdmin / SuperAdmin — e.g. its owner has left) ──

/** The members of an Org, for the hand-over list. */
export async function listOrgMembers(orgId: string): Promise<{ userId: string; name: string }[]> {
  const rows = await prisma.orgMember.findMany({ where: { orgId }, select: { userId: true, user: { select: { name: true, email: true } } } });
  return rows.map((m) => ({ userId: m.userId, name: m.user?.name || m.user?.email || m.userId }));
}

/** Make `toUserId` the owner of a user-created chain. They must be a member of the chain's Org. */
export async function reassignChainOwner(chain: { id: string; orgId: string }, toUserId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = toUserId ? await prisma.orgMember.findFirst({ where: { orgId: chain.orgId, userId: toUserId }, select: { user: { select: { name: true, email: true } } } }) : null;
  if (!member) return { ok: false, error: "That person is not a member of this organisation." };
  await prisma.valueChainLibrary.update({ where: { id: chain.id }, data: { createdByUserId: toUserId, createdByName: member.user?.name || member.user?.email || "" } });
  return { ok: true };
}
