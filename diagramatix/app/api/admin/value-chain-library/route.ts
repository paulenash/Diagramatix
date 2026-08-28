import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { chooseModel } from "@/app/lib/ai/modelAccess";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import {
  type ImportedChain, parseLibraryFromMd, renderChainMd, renderLibraryMd, renumber,
} from "@/app/lib/valueChain/library";
import { type MdPromptType, MD_PROMPT_TYPES, MD_PROMPT_LABEL, mdPromptCategory, buildMdPromptBriefing } from "@/app/lib/valueChain/promptTemplates";
import { generateMdPrompt } from "@/app/lib/valueChain/generatePrompt";
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
async function chainPayload(code?: string) {
  return prisma.valueChainLibrary.findMany({
    where: code ? { code } : undefined,
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      processes: { orderBy: { sortOrder: "asc" } },
      prompts: { orderBy: [{ type: "asc" }, { processCode: "asc" }] },
    },
  });
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? undefined;

  // Export as markdown, for a download or a diff against the file.
  if (url.searchParams.get("format") === "md") {
    const rows = await chainPayload(code);
    const chains: ImportedChain[] = rows.map(toImported);
    const md = code && chains[0] ? renderChainMd(chains[0]) : renderLibraryMd(chains);
    return new Response(md, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${code ?? "process-repository"}.md"`,
      },
    });
  }

  const chains = await chainPayload(code);
  return NextResponse.json({
    chains: chains.map((c) => ({
      id: c.id, code: c.code, title: c.title, groupName: c.groupName, hidden: c.hidden,
      sortOrder: c.sortOrder,
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
  })),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";

  // ── Import the markdown document into the library ────────────────────────
  if (action === "import") {
    const md = typeof body?.md === "string" ? body.md : "";
    if (!md.trim() || md.length > MAX_MD_CHARS) {
      return NextResponse.json({ error: "A valid .md (≤ 8 MB) is required" }, { status: 400 });
    }
    const replace = body?.replace === true;
    const parsed = parseLibraryFromMd(md);
    if (parsed.length === 0) return NextResponse.json({ error: "No value chains found in that file" }, { status: 422 });

    let created = 0, updated = 0, prompts = 0;
    for (const c of parsed) {
      const existing = await prisma.valueChainLibrary.findUnique({ where: { code: c.code } });
      if (existing && !replace) continue;
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
            data: { code: c.code, title: c.title, groupName: c.groupName, sortOrder: c.sortOrder, narrative: c.narrative },
          });
      existing ? updated++ : created++;
      for (const p of c.processes) {
        await prisma.valueChainProcess.create({ data: { chainId: chain.id, code: p.code, title: p.title, sortOrder: p.sortOrder } });
      }
      for (const p of c.prompts) {
        await prisma.valueChainPrompt.create({
          data: {
            chainId: chain.id, type: p.type, processCode: p.processCode, name: p.name,
            prompt: p.prompt, roundTripsOk: true, generatedAt: new Date(),
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
    const rows = await chainPayload(code || undefined);
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
    await prisma.valueChainLibrary.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  }

  // ── Processes: add, rename, remove, reorder — then renumber ──────────────
  if (action === "save-processes") {
    const chainId = String(body?.chainId ?? "");
    const wanted = Array.isArray(body?.processes) ? body.processes as { id?: string; title: string }[] : null;
    if (!chainId || !wanted) return NextResponse.json({ error: "chainId and processes are required" }, { status: 400 });
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

  // ── Regenerate prompts from the master templates ─────────────────────────
  if (action === "regenerate") {
    const code = typeof body?.code === "string" ? body.code : "";
    const requested = Array.isArray(body?.types) ? body.types : [];
    const types = MD_PROMPT_TYPES.filter((t) => requested.includes(t));
    const onlyProcess = typeof body?.processCode === "string" ? body.processCode : "";
    if (!code || types.length === 0) return NextResponse.json({ error: "code and types are required" }, { status: 400 });

    const chain = (await chainPayload(code))[0];
    if (!chain) return NextResponse.json({ error: `Chain ${code} not found` }, { status: 404 });
    if (!chain.narrative.trim()) return NextResponse.json({ error: `${code} has no narrative to generate from` }, { status: 422 });

    let orgId: string;
    try {
      ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
    } catch (err) {
      if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
    const model = chooseModel(undefined, await resolveGenerateModel(false), true);
    const apiKey = aiApiKey(model);
    if (!apiKey) return NextResponse.json({ error: "AI is not configured for the selected model." }, { status: 503 });

    const subs = chain.processes.map((p) => ({ code: p.code, title: p.title }));
    const targets: { type: MdPromptType; code: string; title: string }[] = [];
    for (const t of types) {
      if (t === "bpmn") {
        for (const p of subs) {
          if (onlyProcess && p.code !== onlyProcess) continue;
          targets.push({ type: "bpmn", code: p.code, title: p.title });
        }
      } else if (!onlyProcess) {
        targets.push({ type: t, code: chain.code, title: chain.title });
      }
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
          briefs.set(t, buildMdPromptBriefing(t, row?.rules));
        }

        send({ t: "plan", total: targets.length, chain: chain.code });
        let written = 0, failed = 0, refused = 0;
        for (let i = 0; i < targets.length; i++) {
          const target = targets[i];
          const name = target.type === "bpmn"
            ? `${target.code} ${target.title}`
            : `${chain.code} ${chain.title} — ${MD_PROMPT_LABEL[target.type]}`;
          send({ t: "prompt", index: i + 1, total: targets.length, name, type: target.type, status: "generating" });
          const t0 = Date.now();
          const res = await generateMdPrompt({
            apiKey, model, briefing: briefs.get(target.type)!,
            chainCode: chain.code, chainTitle: chain.title, narrative: chain.narrative, subs, target,
          });
          if (!res.ok) {
            failed++;
            send({ t: "prompt", index: i + 1, total: targets.length, name, type: target.type, status: "error", message: res.error });
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
            },
            update: { name, prompt: res.prompt, roundTripsOk: res.roundTrips, generatedAt: new Date() },
          });
          written++;
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
    await prisma.valueChainLibrary.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  }

  // ── Create an empty chain ────────────────────────────────────────────────
  if (action === "create-chain") {
    const code = String(body?.code ?? "").trim().toUpperCase();
    const title = String(body?.title ?? "").trim();
    if (!/^V\d{2,}$/.test(code)) return NextResponse.json({ error: 'Code must look like "V27"' }, { status: 400 });
    if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });
    const clash = await prisma.valueChainLibrary.findUnique({ where: { code } });
    if (clash) return NextResponse.json({ error: `${code} already exists` }, { status: 409 });
    const max = await prisma.valueChainLibrary.aggregate({ _max: { sortOrder: true } });
    const chain = await prisma.valueChainLibrary.create({
      data: {
        code, title,
        groupName: String(body?.groupName ?? ""),
        sortOrder: (max._max.sortOrder ?? 0) + 1,
        narrative: String(body?.narrative ?? ""),
      },
    });
    return NextResponse.json({ ok: true, id: chain.id });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
