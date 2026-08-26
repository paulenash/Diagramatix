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
import { chainSection, chainTitle, subprocessHeadings, chainNarrative, chainCodes } from "@/app/lib/valueChain/chainSource";
import {
  type MdPromptType, MD_PROMPT_TYPES, mdPromptCategory, buildMdPromptBriefing,
} from "@/app/lib/valueChain/promptTemplates";
import { generateMdPrompt, targetsFor } from "@/app/lib/valueChain/generatePrompt";

/**
 * SuperAdmin — "Generate Repository Prompts".
 *
 * The other end of "Create Project Diagrams from .md". That tool CONSUMES the
 * prompt blocks in a Process Repository document; this one WRITES them, from the
 * chain's narrative and an editable master template per diagram type. Together
 * they close the loop: template → generator → .md → parseValueChainMd → batch
 * tool → diagrams, with the template as the single editable point controlling all
 * 140+ prompts.
 *
 * Progress streams back as NDJSON — one JSON object per line:
 *   { t:"plan", chainCode, chainTitle, total, subprocesses }
 *   { t:"prompt", index, total, code, title, type, status:"generating" }
 *   { t:"prompt", index, total, code, title, type, status:"done", block, roundTrips, ms }
 *   { t:"prompt", index, total, code, title, type, status:"error", message }
 *   { t:"done", written, failed, roundTripFailures }
 *   { t:"error", message }                       (fatal)
 *
 * `roundTrips` is the one that matters: every generated block is parsed back with
 * `parseValueChainMd` before it is reported, so a prompt the batch tool could not
 * read is flagged here rather than discovered 140 diagrams later.
 *
 * Nothing is written to the database except AI usage telemetry — the output is
 * text for the operator to paste into the document.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_MD_CHARS = 4 * 1024 * 1024;

/** GET — the chains a document declares, so the page can offer a list. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; md?: unknown; chainCode?: unknown; types?: unknown }
    | null;
  const md = typeof body?.md === "string" ? body.md : "";
  if (!md.trim() || md.length > MAX_MD_CHARS) {
    return NextResponse.json({ error: "A valid .md (≤ 4 MB) is required" }, { status: 400 });
  }

  // "inspect" — list the chains and what each would produce, without any AI call.
  if (body?.action === "inspect") {
    const chains = chainCodes(md).map((code) => {
      const section = chainSection(md, code) ?? "";
      const subs = subprocessHeadings(section, code);
      return {
        code,
        title: chainTitle(section),
        subprocesses: subs.length,
        narrativeChars: chainNarrative(section).length,
      };
    });
    return NextResponse.json({ chains });
  }

  const chainCode = typeof body?.chainCode === "string" ? body.chainCode.trim() : "";
  if (!chainCode) return NextResponse.json({ error: "chainCode is required" }, { status: 400 });

  const requested = Array.isArray(body?.types) ? body.types : [];
  const types = MD_PROMPT_TYPES.filter((t) => requested.includes(t));
  if (types.length === 0) return NextResponse.json({ error: "Pick at least one diagram type" }, { status: 400 });

  const section = chainSection(md, chainCode);
  if (!section) return NextResponse.json({ error: `Value chain ${chainCode} not found` }, { status: 404 });
  const title = chainTitle(section);
  const narrative = chainNarrative(section);
  if (!narrative.trim()) {
    return NextResponse.json({ error: `Value chain ${chainCode} has no narrative to generate from` }, { status: 422 });
  }
  const subs = subprocessHeadings(section, chainCode);
  const targets = targetsFor(chainCode, title, subs, types);
  if (targets.length === 0) {
    return NextResponse.json({ error: "Nothing to generate for that chain and those types" }, { status: 422 });
  }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const model = chooseModel(undefined, await resolveGenerateModel(false), true);
  const apiKey = aiApiKey(model);
  if (!apiKey) {
    return NextResponse.json({ error: "AI is not configured for the selected model." }, { status: 503 });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      enterAiContext({ userId, orgId, invocationPoint: AI_INVOCATION_POINTS.DiagramGenerate });

      // One briefing per type for the whole run — the built-in template plus this
      // organisation's stored additions. Read once: ten BPMN prompts share one.
      const briefings = new Map<MdPromptType, string>();
      for (const type of types) {
        const row = await prisma.diagramRules
          .findFirst({ where: { category: mdPromptCategory(type), isDefault: true }, select: { rules: true } })
          .catch(() => null);
        briefings.set(type, buildMdPromptBriefing(type, row?.rules));
      }

      send({ t: "plan", chainCode, chainTitle: title, total: targets.length, subprocesses: subs.length });

      let written = 0, failed = 0, roundTripFailures = 0;
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const index = i + 1;
        send({ t: "prompt", index, total: targets.length, code: target.code, title: target.title, type: target.type, status: "generating" });
        const t0 = Date.now();
        const res = await generateMdPrompt({
          apiKey, model, briefing: briefings.get(target.type)!,
          chainCode, chainTitle: title, narrative, subs, target,
        });
        if (res.ok) {
          written++;
          if (!res.roundTrips) roundTripFailures++;
          send({
            t: "prompt", index, total: targets.length, code: target.code, title: target.title,
            type: target.type, status: "done", block: res.block, roundTrips: res.roundTrips,
            parsedName: res.parsedName, ms: Date.now() - t0,
          });
        } else {
          failed++;
          send({
            t: "prompt", index, total: targets.length, code: target.code, title: target.title,
            type: target.type, status: "error", message: res.error,
          });
        }
      }

      send({ t: "done", written, failed, roundTripFailures });
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
