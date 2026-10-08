import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/db";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { chooseModel } from "@/app/lib/ai/modelAccess";
import { allModels, isKnownAiModel } from "@/app/lib/ai/models";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { checkPromptBranches } from "@/app/lib/valueChain/checkPromptBranches";
import { checkPromptShapes } from "@/app/lib/valueChain/checkPromptShapes";
import { selectRegenerationTargets } from "@/app/lib/valueChain/regenerationTargets";
import { looksTruncated } from "@/app/lib/valueChain/checkPromptTruncated";
import { isQuotaExhausted, quotaResumesAt } from "@/app/lib/ai/quotaExhausted";
import { planLibraryImport } from "@/app/lib/valueChain/importPlan";
import {
  type ImportedChain, parseLibraryFromMd, renderChainMd, renderLibraryMd, renumber,
} from "@/app/lib/valueChain/library";
import { type MdPromptType, MD_PROMPT_TYPES, MD_PROMPT_LABEL, mdPromptCategory, buildMdPromptBriefing } from "@/app/lib/valueChain/promptTemplates";
import { generateMdPrompt } from "@/app/lib/valueChain/generatePrompt";
import { answersBlock, choosePromptQuestions, coreQuestionSet, wantsEntityNames } from "@/app/lib/valueChain/promptQuestions";
import { loadEntityNames } from "@/app/lib/valueChain/entityNames";
import { auditPrompts } from "@/app/lib/valueChain/spliceBlocks";

/**
 * SuperAdmin — the Process Repository library.
 *
 * The repository lives here now rather than in a 500 KB markdown file. This route
 * imports that file once, then owns the chains: edit a narrative, add or remove a
 * process, regenerate a prompt from the master template, publish.
 *
 * DRAFT AND PUBLISHED are separate on purpose. Everything edited here is a draft;
 * project generation reads only the published snapshot, so a half-edited chain or
 * a regeneration in flight is never visible to it.
 *
 * `regenerate` streams NDJSON like the other AI tools:
 *   { t:"plan", total }
 *   { t:"prompt", index, total, name, type, status, ... }
 *   { t:"done", written, failed, refused }
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_MD_CHARS = 8 * 1024 * 1024;

/** Everything the maintenance screen needs about one chain. */
async function chainPayload(scopeOrg: string, code?: string) {
  return prisma.valueChainLibrary.findMany({
    where: code ? { orgId: scopeOrg, code } : { orgId: scopeOrg },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      processes: { orderBy: { sortOrder: "asc" } },
      prompts: { orderBy: [{ type: "asc" }, { processCode: "asc" }] },
    },
  });
}

/** The signed-in session the wrappers have already authorised (SuperAdmin for the master repository, OrgAdmin for an Org's). */
export type LibrarySession = Session & { user: { id: string } };

/**
 * The maintenance handlers for a Process Repository — the MASTER one (scopeOrg "", SuperAdmin) or ONE ORG's own (scopeOrg = the Org's id,
 * OrgAdmin). The two screens are the same screen over different rows, so the code is shared and the scope is the only difference; the wrappers
 * (app/api/admin/value-chain-library, app/api/org-admin/value-chain-library) do the authorising and pass the scope. Every query below is
 * bounded by `scopeOrg`, so an OrgAdmin can never read or change the master or another Org's chain — pinned in tests/valueChain/org-repository.test.ts.
 */
export async function libraryGet(req: Request, scopeOrg: string) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? undefined;

  // An Org's screen also needs the MASTER chains it can adopt, and which of them it already has (and whether the master has moved on since).
  if (scopeOrg && url.searchParams.get("master") === "1") {
    const [master, own] = await Promise.all([
      prisma.valueChainLibrary.findMany({
        where: { orgId: "", publishedAt: { not: null } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        select: { code: true, publishedTitle: true, title: true, groupName: true, publishedAt: true, _count: { select: { processes: true, prompts: true } } },
      }),
      prisma.valueChainLibrary.findMany({ where: { orgId: scopeOrg }, select: { code: true, masterPublishedAt: true } }),
    ]);
    const have = new Map(own.map((o) => [o.code, o.masterPublishedAt]));
    return NextResponse.json({
      master: master.map((m) => ({
        code: m.code, title: m.publishedTitle ?? m.title, groupName: m.groupName, publishedAt: m.publishedAt,
        processes: m._count.processes, prompts: m._count.prompts,
        adopted: have.has(m.code),
        masterMoved: have.has(m.code) && !!have.get(m.code) && !!m.publishedAt && m.publishedAt > have.get(m.code)!,
      })),
    });
  }

  // Export as markdown, for a download or a diff against the file.
  if (url.searchParams.get("format") === "md") {
    const rows = await chainPayload(scopeOrg, code);
    const chains: ImportedChain[] = rows.map(toImported);
    const md = code && chains[0] ? renderChainMd(chains[0]) : renderLibraryMd(chains);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${code ?? "process-repository"}.md"`,
      },
    });
  }

  const chains = await chainPayload(scopeOrg, code);
  // Org scope: when did the master chain of each of these codes last publish? (to say "the master has moved on since you adopted it")
  const masterAt = scopeOrg
    ? new Map((await prisma.valueChainLibrary.findMany({ where: { orgId: "", code: { in: chains.map((c) => c.code) } }, select: { code: true, publishedAt: true } }))
        .map((m) => [m.code, m.publishedAt] as const))
    : new Map<string, Date | null>();
  return NextResponse.json({
    scope: scopeOrg ? "org" : "master",
    ...(scopeOrg ? {} : { model: await masterLibraryModel(), models: allModels().map((m) => ({ id: m.id, label: m.label })) }),
    chains: chains.map((c) => ({
      id: c.id, code: c.code, title: c.title, groupName: c.groupName, hidden: c.hidden,
      sortOrder: c.sortOrder,
      masterPublishedAt: c.masterPublishedAt,
      masterMoved: !!scopeOrg && !!c.masterPublishedAt && !!masterAt.get(c.code) && masterAt.get(c.code)! > c.masterPublishedAt,
      narrative: c.narrative,
      published: c.publishedAt !== null,
      publishedAt: c.publishedAt,
      /** True when the draft has moved on from what is published. */
      dirty: c.publishedAt === null
        || c.publishedNarrative !== c.narrative
        || c.publishedTitle !== c.title
        || c.prompts.some((p) => p.publishedPrompt !== p.prompt),
      processes: c.processes.map((p) => ({ id: p.id, code: p.code, title: p.title, sortOrder: p.sortOrder })),
      prompts: c.prompts.map((p) => ({
        id: p.id, type: p.type, processCode: p.processCode, name: p.name,
        prompt: p.prompt, chars: p.prompt.length,
        roundTripsOk: p.roundTripsOk, generatedAt: p.generatedAt,
        // null = unknown, which an imported chain always is. Reported as it is
        // stored so the screen can say "unknown" rather than invent a default.
        model: p.model,
        // Computed on read rather than stored: the check is deterministic and
        // costs microseconds, so it needs no column and cannot go stale against
        // a prompt someone edited by hand.
        unterminatedBranches: checkPromptBranches(p.prompt).length,
        /**
         * ...and WHAT they are. Paul, 2026-09-06: "What does '1 undrawable'
         * message mean?" A count names a quantity of something unnamed, and the
         * answer was only in a hover title. These lines say which instruction,
         * on which line, so the prompt can be read straight to it.
         */
        unterminatedDetail: checkPromptBranches(p.prompt).map(
          (b) => `line ${b.line}: gateway "${b.gateway}" branch "${b.condition}" never says where it goes`),
        // Instructions BPMN cannot carry out — a boundary event on a
        // non-activity, a message flow between two lanes of one pool. Both
        // produce a faithful drawing of something invalid, so they have to be
        // caught in the prompt rather than in the diagram.
        undrawableShapes: checkPromptShapes(p.prompt).length,
        undrawableDetail: checkPromptShapes(p.prompt).map((i) => `line ${i.line}: ${i.detail}`),
        // Why it looks unfinished, or null. A truncated prompt passed every
        // other check — a dangling `- branch "` is not a malformed branch, it
        // is no branch at all (Paul, 2026-09-04).
        truncated: looksTruncated(p.prompt),
        published: p.publishedPrompt !== null && p.publishedPrompt === p.prompt,
      })),
    })),
  });
}

type ChainRow = Awaited<ReturnType<typeof chainPayload>>[number];

const toImported = (c: ChainRow): ImportedChain => ({
  code: c.code, title: c.title, groupName: c.groupName, sortOrder: c.sortOrder,
  narrative: c.narrative,
  processes: c.processes.map((p) => ({ code: p.code, title: p.title, sortOrder: p.sortOrder })),
  prompts: c.prompts.map((p) => ({
    type: p.type as MdPromptType, processCode: p.processCode, name: p.name, prompt: p.prompt,
    // Provenance rides along in the .md so an export-then-import keeps it. A
    // file is a copy of the library, not a laundering of it.
    model: p.model, generatedAt: p.generatedAt ? p.generatedAt.toISOString() : null,
  })),
});

/**
 * What the library currently holds for a set of chain codes — the other half of
 * the import decision. Kept out of the plan function so that stays pure and
 * testable without a database.
 */
async function libraryStateFor(scopeOrg: string, codes: string[]) {
  const here = await prisma.valueChainLibrary.findMany({
    where: { orgId: scopeOrg, code: { in: codes } },
    select: { code: true, publishedAt: true, _count: { select: { prompts: true } } },
  });
  return here.map((h) => ({ code: h.code, prompts: h._count.prompts, published: !!h.publishedAt }));
}
/** The model the MASTER repository generates with: the SuperAdmin's remembered choice for this screen, else the app default. */
export const LIBRARY_MODEL_KEY = "valueChain.library.model";
async function masterLibraryModel(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: LIBRARY_MODEL_KEY } }).catch(() => null);
  const v = row?.value?.trim();
  return v && isKnownAiModel(v) ? v : chooseModel(undefined, await resolveGenerateModel(false), true);
}
export async function libraryPost(req: Request, session: LibrarySession, scopeOrg: string) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  /** Is this chain id inside the scope? An id from the master, or from another Org, is "not found" — never reachable from here. */
  const ownsChain = async (id: string) =>
    !!id && (await prisma.valueChainLibrary.findUnique({ where: { id }, select: { orgId: true } }))?.orgId === scopeOrg;
  if (action === "set-model") {
    if (scopeOrg) return NextResponse.json({ error: "Your Org's model is chosen on the AI Models page." }, { status: 403 });
    const id = typeof body?.model === "string" ? body.model.trim() : "";
    if (id && !isKnownAiModel(id)) return NextResponse.json({ error: `Unknown model: ${id}` }, { status: 400 });
    if (!id) await prisma.appSetting.deleteMany({ where: { key: LIBRARY_MODEL_KEY } });
    else await prisma.appSetting.upsert({ where: { key: LIBRARY_MODEL_KEY }, create: { key: LIBRARY_MODEL_KEY, value: id }, update: { value: id } });
    return NextResponse.json({ ok: true, model: await masterLibraryModel() });
  }
  // An Org does not upload the master's markdown file; it adopts from the master instead (below).
  if (scopeOrg && action === "import") return NextResponse.json({ error: "An Org adopts chains from the master repository; it does not import a file." }, { status: 403 });

  // ── Import the markdown document into the library ────────────────────────
  if (action === "import") {
    const md = typeof body?.md === "string" ? body.md : "";
    if (!md.trim() || md.length > MAX_MD_CHARS) {
      return NextResponse.json({ error: "A valid .md (≤ 8 MB) is required" }, { status: 400 });
    }
    const replace = body?.replace === true;
    const parsed = parseLibraryFromMd(md);
    if (parsed.length === 0) return NextResponse.json({ error: "No value chains found in that file" }, { status: 422 });

    /**
     * WHAT WOULD THIS FILE DO? Paul, 2026-09-05: "The User should not have to
     * click one generic button that may or may not do any or all of these."
     *
     * A dry run: say which chains are new and which already exist, so the
     * decision is made against the file's actual contents rather than its name.
     * Replacing a chain deletes its processes and prompts, which on a
     * regenerated chain is hours of AI spend, so it is not something to discover
     * afterwards.
     */
    const existingChains = await libraryStateFor(scopeOrg, parsed.map((c) => c.code));

    if (body?.preview === true) {
      // replace:false so the dry run reports the SAFE reading — the screen then
      // ticks what to replace, and that tick is the consent.
      return NextResponse.json({
        ok: true,
        chains: planLibraryImport({ parsed, existing: existingChains, codes: null, replace: false }),
      });
    }

    /**
     * WHICH chains to act on. Absent, every chain in the file — the behaviour
     * the two original buttons had. Present, only those named, which is what
     * makes "selectively update" possible without a second file.
     */
    const onlyCodes = Array.isArray(body?.codes)
      ? (body.codes as unknown[]).filter((c): c is string => typeof c === "string")
      : null;

    // The SAME decision the preview showed, so the panel cannot promise "new"
    // and then replace.
    const plan = new Map(
      planLibraryImport({ parsed, existing: existingChains, codes: onlyCodes, replace })
        .map((r) => [r.code, r.action]),
    );

    let created = 0, updated = 0, prompts = 0;
    for (const c of parsed) {
      if (plan.get(c.code) === "skip") continue;
      const existing = await prisma.valueChainLibrary.findFirst({ where: { orgId: scopeOrg, code: c.code } });
      // Replace wholesale rather than merge: an import is a restatement of the
      // chain, and a half-merged chain (old processes, new prompts) would be
      // worse than either version on its own.
      if (existing) {
        await prisma.valueChainProcess.deleteMany({ where: { chainId: existing.id } });
        await prisma.valueChainPrompt.deleteMany({ where: { chainId: existing.id } });
      }
      const chain = existing
        ? await prisma.valueChainLibrary.update({
            where: { id: existing.id },
            data: { title: c.title, groupName: c.groupName, sortOrder: c.sortOrder, narrative: c.narrative },
          })
        : await prisma.valueChainLibrary.create({
            data: { orgId: scopeOrg, code: c.code, title: c.title, groupName: c.groupName, sortOrder: c.sortOrder, narrative: c.narrative },
          });
      existing ? updated++ : created++;
      for (const p of c.processes) {
        await prisma.valueChainProcess.create({ data: { chainId: chain.id, code: p.code, title: p.title, sortOrder: p.sortOrder } });
      }
      for (const p of c.prompts) {
        await prisma.valueChainPrompt.create({
          data: {
            chainId: chain.id, type: p.type, processCode: p.processCode, name: p.name,
            prompt: p.prompt, roundTripsOk: true,
            /**
             * Provenance from the file where the file carries it, UNKNOWN where
             * it does not - never invented.
             *
             * This used to stamp `generatedAt = new Date()` unconditionally,
             * which was worse than losing the date: a prompt written to an old
             * template came back looking freshly current, and every staleness
             * warning that exists to catch that went quiet. A null date reads as
             * stale, which errs towards regenerating - the safe direction.
             *
             * Paul, 2026-09-06: "This may be unknown for an imported Value
             * Chain?" It is, for any file written elsewhere, and it says so.
             */
            generatedAt: p.generatedAt ? new Date(p.generatedAt) : null,
            model: p.model ?? null,
          },
        });
        prompts++;
      }
    }
    return NextResponse.json({ created, updated, prompts, skipped: parsed.length - created - updated });
  }

  // ── Publish: copy draft over the published snapshot ──────────────────────
  if (action === "publish" || action === "unpublish") {
    const code = typeof body?.code === "string" ? body.code : "";
    const rows = await chainPayload(scopeOrg, code || undefined);
    if (rows.length === 0) return NextResponse.json({ error: "Nothing to publish" }, { status: 404 });
    for (const c of rows) {
      if (action === "unpublish") {
        await prisma.valueChainLibrary.update({ where: { id: c.id }, data: { publishedAt: null } });
        continue;
      }
      await prisma.valueChainLibrary.update({
        where: { id: c.id },
        data: { publishedNarrative: c.narrative, publishedTitle: c.title, publishedAt: new Date() },
      });
      for (const p of c.prompts) {
        await prisma.valueChainPrompt.update({ where: { id: p.id }, data: { publishedPrompt: p.prompt } });
      }
    }
    return NextResponse.json({ ok: true, chains: rows.length });
  }

  // ── Edit a chain's own fields ────────────────────────────────────────────
  if (action === "save-chain") {
    const id = String(body?.id ?? "");
    const data: Record<string, unknown> = {};
    for (const f of ["title", "groupName", "narrative"] as const) {
      if (typeof body?.[f] === "string") data[f] = body[f];
    }
    if (typeof body?.hidden === "boolean") data.hidden = body.hidden;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
    if (!(await ownsChain(id))) return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    await prisma.valueChainLibrary.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  }

  // ── Processes: add, rename, remove, reorder — then renumber ──────────────
  if (action === "save-processes") {
    const chainId = String(body?.chainId ?? "");
    const wanted = Array.isArray(body?.processes) ? body.processes as { id?: string; title: string }[] : null;
    if (!chainId || !wanted) return NextResponse.json({ error: "chainId and processes are required" }, { status: 400 });
    if (!(await ownsChain(chainId))) return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    const chain = await prisma.valueChainLibrary.findUnique({ where: { id: chainId }, include: { processes: true, prompts: true } });
    if (!chain) return NextResponse.json({ error: "Chain not found" }, { status: 404 });

    const keptIds = new Set(wanted.map((w) => w.id).filter(Boolean) as string[]);
    const removed = chain.processes.filter((p) => !keptIds.has(p.id));

    // Removing a process removes its BPMN prompt with it — a prompt for a process
    // that no longer exists would generate a diagram nothing links to.
    for (const r of removed) {
      await prisma.valueChainPrompt.deleteMany({ where: { chainId, type: "bpmn", processCode: r.code } });
      await prisma.valueChainProcess.delete({ where: { id: r.id } });
    }

    // Write the new order, then renumber to Vnn.01, .02, … and move each BPMN
    // prompt to its process's new code. Codes are LOCAL: nothing outside a
    // process's own prompt quotes them, because cross-references are by name.
    const finalOrder: { code: string; title: string; sortOrder: number; id?: string }[] = [];
    for (let i = 0; i < wanted.length; i++) {
      const w = wanted[i];
      const title = String(w.title ?? "").trim() || "Untitled process";
      if (w.id) {
        const existing = chain.processes.find((p) => p.id === w.id);
        if (!existing) continue;
        finalOrder.push({ id: existing.id, code: existing.code, title, sortOrder: i });
      } else {
        finalOrder.push({ code: "", title, sortOrder: i });
      }
    }
    const map = renumber(chain.code, finalOrder.map((p, i) => ({ code: p.code || `__new${i}`, title: p.title, sortOrder: i })));

    // Two passes so a code never collides with one still to be moved.
    for (const p of finalOrder) {
      if (!p.id) continue;
      await prisma.valueChainProcess.update({ where: { id: p.id }, data: { code: `__tmp_${p.id}`, title: p.title, sortOrder: p.sortOrder } });
    }
    let k = 0;
    for (const p of finalOrder) {
      const newCode = map.get(p.code || `__new${k}`)!;
      const oldCode = p.code;
      if (p.id) {
        await prisma.valueChainProcess.update({ where: { id: p.id }, data: { code: newCode } });
        if (oldCode && oldCode !== newCode) {
          await prisma.valueChainPrompt.updateMany({
            where: { chainId, type: "bpmn", processCode: oldCode },
            data: { processCode: newCode, name: `${newCode} ${p.title}` },
          });
        } else {
          await prisma.valueChainPrompt.updateMany({
            where: { chainId, type: "bpmn", processCode: newCode },
            data: { name: `${newCode} ${p.title}` },
          });
        }
      } else {
        await prisma.valueChainProcess.create({ data: { chainId, code: newCode, title: p.title, sortOrder: p.sortOrder } });
      }
      k++;
    }
    return NextResponse.json({ ok: true, removed: removed.length, total: finalOrder.length });
  }

  // ── An Org adopts a master chain, or brings an adopted one up to date ──────────
  // "adopt" copies the master's PUBLISHED chain (narrative, processes, prompts) into the Org's own repository as a DRAFT: the Org's users keep seeing
  // the master chain until the OrgAdmin publishes the Org's version. "sync" replaces an adopted chain with the master's current published version
  // (the Org's edits to it are lost — the screen asks first); the chain stays published or not as it was, and shows "unpublished changes".
  // Either way `masterPublishedAt` records which master version the Org's copy is of, so the screen can say when the master has moved on.
  if (scopeOrg && (action === "adopt" || action === "sync")) {
    const code = typeof body?.code === "string" ? body.code : "";
    const master = code ? (await chainPayload("", code))[0] : undefined;
    if (!master || !master.publishedAt) return NextResponse.json({ error: `${code} is not a published chain in the master repository` }, { status: 404 });
    const mine = (await chainPayload(scopeOrg, code))[0];
    if (action === "adopt" && mine) return NextResponse.json({ error: `${code} is already in your repository` }, { status: 409 });
    if (action === "sync" && !mine) return NextResponse.json({ error: `${code} is not in your repository yet — adopt it first` }, { status: 404 });
    const livePrompts = master.prompts.filter((p) => (p.publishedPrompt ?? "").trim());
    const data = {
      title: master.publishedTitle ?? master.title, groupName: master.groupName, sortOrder: master.sortOrder,
      narrative: master.publishedNarrative ?? master.narrative, masterPublishedAt: master.publishedAt,
    };
    const chain = mine
      ? await prisma.valueChainLibrary.update({ where: { id: mine.id }, data })
      : await prisma.valueChainLibrary.create({ data: { orgId: scopeOrg, code, hidden: false, ...data } });
    if (mine) {
      await prisma.valueChainProcess.deleteMany({ where: { chainId: chain.id } });
      await prisma.valueChainPrompt.deleteMany({ where: { chainId: chain.id } });
    }
    for (const p of master.processes) {
      await prisma.valueChainProcess.create({ data: { chainId: chain.id, code: p.code, title: p.title, sortOrder: p.sortOrder } });
    }
    for (const p of livePrompts) {
      await prisma.valueChainPrompt.create({
        data: {
          chainId: chain.id, type: p.type, processCode: p.processCode, name: p.name,
          prompt: p.publishedPrompt!, roundTripsOk: p.roundTripsOk, generatedAt: p.generatedAt, model: p.model, templateHash: p.templateHash,
        },
      });
    }
    return NextResponse.json({ ok: true, id: chain.id, processes: master.processes.length, prompts: livePrompts.length });
  }

  // ── The questions asked before a process prompt is written ────────────────
  // Up to MAX_PROMPT_QUESTIONS: a fixed core list trimmed and sharpened by ONE small AI call on the chain's narrative (promptQuestions.ts).
  // No writes; the answers come back with the "regenerate" request below.
  if (action === "questions") {
    const code = typeof body?.code === "string" ? body.code : "";
    const processCode = typeof body?.processCode === "string" ? body.processCode : "";
    const chain = code ? (await chainPayload(scopeOrg, code))[0] : undefined;
    if (!chain) return NextResponse.json({ error: `Chain ${code} not found` }, { status: 404 });
    let orgId: string;
    try {
      ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
    } catch (err) {
      if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
    const model = scopeOrg ? await resolveOrgModel() : await masterLibraryModel();
    const apiKey = aiApiKey(model);
    // No key is not fatal: the fixed core list can still be asked.
    if (!apiKey) return NextResponse.json(coreQuestionSet());
    enterAiContext({ userId: session.user.id, orgId, invocationPoint: AI_INVOCATION_POINTS.DiagramGenerate });
    const proc = processCode ? chain.processes.find((p) => p.code === processCode) : undefined;
    const set = await choosePromptQuestions({
      apiKey, model, processTitle: proc ? `${proc.code} ${proc.title} (in ${chain.code} ${chain.title})` : `${chain.code} ${chain.title}`,
      narrative: chain.narrative,
    });
    return NextResponse.json(set);
  }

  // ── Regenerate prompts from the master templates ─────────────────────────
  if (action === "regenerate") {
    const code = typeof body?.code === "string" ? body.code : "";
    const requested = Array.isArray(body?.types) ? body.types : [];
    const types = MD_PROMPT_TYPES.filter((t) => requested.includes(t));
    // WHICH processes. `processCode` (one) is what a row's own Regenerate button
    // has always sent; `processCodes` (many) is the subset the checkboxes select.
    // Both narrow to BPMN only — picking specific processes means you did not ask
    // for the chain-level prompts, and silently regenerating those as well would
    // spend AI calls nobody requested.
    const onlyProcess = typeof body?.processCode === "string" ? body.processCode : "";
    const manyCodes = Array.isArray(body?.processCodes)
      ? (body.processCodes as unknown[]).filter((c): c is string => typeof c === "string")
      : [];
    const only = new Set<string>(manyCodes.length ? manyCodes : onlyProcess ? [onlyProcess] : []);
    // The author's answers to the clarifying questions (promptQuestions.ts), applied to every BPMN process prompt in this run. Chain-level
    // prompts (value chain, context, …) are not process prompts and are written as before.
    const answerItems = Array.isArray(body?.answers)
      ? (body.answers as unknown[]).filter((a): a is { label: string; answer: string } =>
          !!a && typeof a === "object" && typeof (a as { label?: unknown }).label === "string" && typeof (a as { answer?: unknown }).answer === "string")
      : [];
    if (!code || types.length === 0) return NextResponse.json({ error: "code and types are required" }, { status: 400 });

    const chain = (await chainPayload(scopeOrg, code))[0];
    if (!chain) return NextResponse.json({ error: `Chain ${code} not found` }, { status: 404 });
    if (!chain.narrative.trim()) return NextResponse.json({ error: `${code} has no narrative to generate from` }, { status: 422 });

    let orgId: string;
    try {
      ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
    } catch (err) {
      if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
    const model = scopeOrg ? await resolveOrgModel() : await masterLibraryModel();
    const apiKey = aiApiKey(model);
    if (!apiKey) return NextResponse.json({ error: "AI is not configured for the selected model." }, { status: 503 });

    const subs = chain.processes.map((p) => ({ code: p.code, title: p.title }));
    const { targets, unknown } = selectRegenerationTargets({
      types, processes: subs, chainCode: chain.code, chainTitle: chain.title, only: [...only],
    });
    if (unknown.length) {
      // Otherwise this regenerates nothing and reports success, which reads as
      // "done" and leaves the prompt exactly as it was.
      return NextResponse.json({ error: `${code} has no process ${unknown.join(", ")}` }, { status: 422 });
    }
    if (targets.length === 0) return NextResponse.json({ error: "Nothing to regenerate" }, { status: 422 });

    const userId = session.user.id;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: unknown) => controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        enterAiContext({ userId, orgId, invocationPoint: AI_INVOCATION_POINTS.DiagramGenerate });

        const briefs = new Map<MdPromptType, string>();
        for (const t of types) {
          const row = await prisma.diagramRules
            .findFirst({ where: { category: mdPromptCategory(t), isDefault: true }, select: { rules: true } })
            .catch(() => null);
          // An Org's repository is written to the SAME master template (so a new template version reaches it) plus the Org's OWN additions.
          const orgRow = scopeOrg
            ? await prisma.diagramRules.findFirst({ where: { category: mdPromptCategory(t), orgId: scopeOrg, userId: null }, select: { rules: true } }).catch(() => null)
            : null;
          briefs.set(t, buildMdPromptBriefing(t, [row?.rules, orgRow?.rules].filter(Boolean).join("\n\n") || undefined));
        }

        // WHICH MODEL. Paul changed the default to Kimi K3 after hitting an
        // Anthropic spend cap and could not tell whether the change had taken:
        // nothing on screen said what the run was using, so the only evidence
        // was the error text, and a stale failed row reads exactly like a fresh
        // one. A run should state its own model.
        send({ t: "plan", total: targets.length, chain: chain.code, model });
        const answersText = answersBlock(answerItems);
        const entityNames = wantsEntityNames(answerItems) ? await loadEntityNames(orgId) : "";
        let written = 0, failed = 0, refused = 0;
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const name = target.type === "bpmn"
            ? `${target.code} ${target.title}`
            : `${chain.code} ${chain.title} — ${MD_PROMPT_LABEL[target.type]}`;
          // An Org's regeneration is the OrgAdmin's own AI use: one attempt per prompt written, checked before each so a run that hits the
          // limit stops with what it has written and says so (the master's is SuperAdmin's and unmetered, as before).
          if (scopeOrg) {
            const blocked = await gateLimit(userId, "aiAttempts");
            if (blocked) {
              const j = await blocked.json().catch(() => ({} as { message?: string; error?: string }));
              send({ t: "halted", reason: "limit", message: `${j.message ?? j.error ?? "You have reached your AI attempts limit."} Stopped after ${written} written; ${targets.length - i} not attempted.`, written, remaining: targets.length - i, nextTarget: null });
              break;
            }
          }
          send({ t: "prompt", index: i + 1, total: targets.length, name, type: target.type, status: "generating" });
          const t0 = Date.now();
          const res = await generateMdPrompt({
            apiKey, model, briefing: briefs.get(target.type)!,
            chainCode: chain.code, chainTitle: chain.title, narrative: chain.narrative, subs, target,
            ...(target.type === "bpmn" ? { answers: answersText || undefined, entityNames: entityNames || undefined } : {}),
          });
          if (!res.ok) {
            failed++;
            send({ t: "prompt", index: i + 1, total: targets.length, name, type: target.type, status: "error", message: res.error });
            // A spend cap is not THIS prompt failing, it is every REMAINING
            // prompt failing. Carrying on made one doomed call per target and
            // buried the reason in a wall of identical rows. Stop, say it once,
            // and say where the run got to so it can be picked up from there.
            if (isQuotaExhausted(res.error)) {
              const back = quotaResumesAt(res.error);
              const notAttempted = targets.length - i - 1;
              send({
                t: "halted",
                reason: "quota",
                message: "The AI account has hit its usage limit"
                  + (back ? `, and regains access on ${back}` : "")
                  + `. Stopped after ${written} written; ${notAttempted} not attempted.`,
                written,
                remaining: notAttempted,
                nextTarget: targets[i + 1]
                  ? (targets[i + 1].type === "bpmn" ? targets[i + 1].code : targets[i + 1].type)
                  : null,
              });
              break;
            }
            continue;
          }
          // The same guard the script applies: a loop-back asks for a shape the
          // layout code prunes, so the repetition would vanish from the diagram.
          const audit = auditPrompts(res.prompt);
          if (audit.loopBacks > 0) {
            refused++;
            send({ t: "prompt", index: i + 1, total: targets.length, name, type: target.type, status: "refused", message: "asks for a loop-back — not stored" });
            continue;
          }
          await prisma.valueChainPrompt.upsert({
            where: { chainId_type_processCode: { chainId: chain.id, type: target.type, processCode: target.type === "bpmn" ? target.code : "" } },
            create: {
              chainId: chain.id, type: target.type, processCode: target.type === "bpmn" ? target.code : "",
              name, prompt: res.prompt, roundTripsOk: res.roundTrips, generatedAt: new Date(),
              model,
            },
            update: { name, prompt: res.prompt, roundTripsOk: res.roundTrips, generatedAt: new Date(), model },
          });
          written++;
          if (scopeOrg) await recordUsage(userId, "aiAttempts");
          send({
            t: "prompt", index: i + 1, total: targets.length, name, type: target.type,
            status: "done", roundTrips: res.roundTrips, chars: res.prompt.length, ms: Date.now() - t0,
            dataObjects: audit.dataObjects, standardLoops: audit.standardLoops,
          });
        }
        send({ t: "done", written, failed, refused });
        controller.close();
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // ── Delete a chain outright ──────────────────────────────────────────────
  if (action === "delete-chain") {
    const id = String(body?.id ?? "");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!(await ownsChain(id))) return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    await prisma.valueChainLibrary.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  // ── Create an empty chain ────────────────────────────────────────────────
  if (action === "create-chain") {
    const code = String(body?.code ?? "").trim().toUpperCase();
    const title = String(body?.title ?? "").trim();
    if (!/^V\d{2,}$/.test(code)) return NextResponse.json({ error: 'Code must look like "V27"' }, { status: 400 });
    if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });
    const clash = await prisma.valueChainLibrary.findFirst({ where: { orgId: scopeOrg, code } });
    if (clash) return NextResponse.json({ error: `${code} already exists` }, { status: 409 });
    const max = await prisma.valueChainLibrary.aggregate({ where: { orgId: scopeOrg }, _max: { sortOrder: true } });
    const chain = await prisma.valueChainLibrary.create({
      data: {
        orgId: scopeOrg, code, title,
        groupName: String(body?.groupName ?? ""),
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        narrative: String(body?.narrative ?? ""),
      },
    });
    return NextResponse.json({ ok: true, id: chain.id });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
