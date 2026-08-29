import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { parseValueChainMd, type ParsedDiagram } from "@/app/lib/valueChain/parseValueChainMd";
import { loadAiRulesForType } from "@/app/lib/ai/loadAiRules";
import { generateDiagramData } from "@/app/lib/ai/generateDiagramData";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { chooseModel } from "@/app/lib/ai/modelAccess";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { AI_INVOCATION_POINTS, enterAiContext, recordDiagramGenerated } from "@/app/lib/ai/aiTelemetry";

/**
 * SuperAdmin — "Create Project Diagrams from .md" batch runner.
 *
 * Given the uploaded Value-Chain markdown + a chosen chain code, this creates a
 * new Project and then generates every diagram in that chain by driving the SAME
 * AI Generate + Auto Layout pipeline the editor uses (per diagram type), saving
 * each as it completes. Detailed progress streams back as NDJSON — one JSON
 * object per line:
 *   { t:"project", projectId, projectName, total }
 *   { t:"diagram", index, total, name, type, status:"generating" }
 *   { t:"diagram", index, total, name, type, status:"done",  diagramId, ms }
 *   { t:"diagram", index, total, name, type, status:"error", message }
 *   { t:"done", projectId, created, failed }
 *   { t:"error", message }                         (fatal — e.g. project create failed)
 *
 * Not wrapped in one DB transaction: each diagram is a slow AI call, so we create
 * per-diagram and keep every success even if one fails (continue-on-error).
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_MD_CHARS = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { md?: unknown; chainCode?: unknown; projectName?: unknown; source?: unknown }
    | null;
  const md = typeof body?.md === "string" ? body.md : "";
  const chainCode = typeof body?.chainCode === "string" ? body.chainCode.trim() : "";
  const fromLibrary = body?.source === "library";
  if (!chainCode) return NextResponse.json({ error: "chainCode is required" }, { status: 400 });
  if (!fromLibrary && (!md.trim() || md.length > MAX_MD_CHARS)) {
    return NextResponse.json({ error: "A valid .md (≤ 4 MB) is required" }, { status: 400 });
  }

  /**
   * Where the prompts come from.
   *
   * The library is the normal source now; the markdown upload stays for a chain
   * that has not been imported yet. Both produce the same `{name, type, prompt}`
   * shape, so everything downstream — generation, naming, the link scan — is
   * identical whichever was used.
   *
   * The library read takes ONLY published prompts. A draft is by definition a
   * chain someone is still working on, and generating 15 diagrams from a
   * half-regenerated chain is exactly what the draft/published split exists to
   * prevent.
   */
  let chain: { code: string; title: string; diagrams: ParsedDiagram[] } | undefined;
  if (fromLibrary) {
    const row = await prisma.valueChainLibrary.findUnique({
      where: { code: chainCode },
      include: { processes: { orderBy: { sortOrder: "asc" } }, prompts: true },
    });
    if (!row) return NextResponse.json({ error: `Value chain ${chainCode} is not in the library` }, { status: 404 });
    if (!row.publishedAt) {
      return NextResponse.json({ error: `${chainCode} has never been published — publish it in the Process Repository first` }, { status: 409 });
    }
    // Chain-level prompts first, then one per process in order, so the generated
    // project reads top-down the way the chain does.
    const order = ["value-chain", "context", "process-context", "archimate"];
    const live = row.prompts.filter((p) => (p.publishedPrompt ?? "").trim());
    const diagrams = [
      ...order.flatMap((t) => live.filter((p) => p.type === t && !p.processCode)),
      ...row.processes.flatMap((proc) => live.filter((p) => p.type === "bpmn" && p.processCode === proc.code)),
    ].map((p) => ({ name: p.name, type: p.type as ParsedDiagram["type"], prompt: p.publishedPrompt! }));
    chain = { code: row.code, title: row.publishedTitle ?? row.title, diagrams };
  } else {
    chain = parseValueChainMd(md).find((c) => c.code === chainCode);
    if (!chain) return NextResponse.json({ error: `Value chain ${chainCode} not found` }, { status: 404 });
  }
  if (chain.diagrams.length === 0) {
    return NextResponse.json({ error: `Value chain ${chainCode} has no diagram prompts` }, { status: 422 });
  }

  const projectName =
    (typeof body?.projectName === "string" && body.projectName.trim()) || chain.title;

  // Resolve the writable org for this session (respects the active-org cookie).
  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // One model for the whole run (SuperAdmin → any model allowed), plus its key.
  const model = chooseModel(undefined, await resolveGenerateModel(false), true);
  const apiKey = aiApiKey(model);
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." },
      { status: 503 },
    );
  }

  const userId = session.user.id;
  const diagrams = chain.diagrams;
  const total = diagrams.length;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      // Tag every AI call this run makes for usage telemetry.
      enterAiContext({ userId, orgId, invocationPoint: AI_INVOCATION_POINTS.DiagramGenerate });

      // Cache the green-rules brief per diagram type (10 BPMN diagrams share one).
      const rulesByType = new Map<string, string>();
      const rulesFor = async (type: string) => {
        let r = rulesByType.get(type);
        if (r === undefined) { r = await loadAiRulesForType(type); rulesByType.set(type, r); }
        return r;
      };

      let projectId: string;
      try {
        const project = await prisma.project.create({
          data: {
            name: projectName.trim(),
            userId,
            orgId,
            ownerName: session.user?.name ?? session.user?.email ?? "",
          },
          select: { id: true },
        });
        projectId = project.id;
        send({ t: "project", projectId, projectName: projectName.trim(), total });
      } catch (e) {
        send({ t: "error", message: e instanceof Error ? e.message : "Could not create the project" });
        controller.close();
        return;
      }

      let created = 0;
      let failed = 0;
      for (let i = 0; i < diagrams.length; i++) {
        const d: ParsedDiagram = diagrams[i];
        const index = i + 1;
        send({ t: "diagram", index, total, name: d.name, type: d.type, status: "generating" });
        const t0 = Date.now();
        try {
          const rules = await rulesFor(d.type);
          // Anything the layout could not take at face value. Collected per
          // diagram and reported with it: a run of fifteen diagrams is unattended,
          // and a dangling reference used to come back looking like a success.
          const diagnostics: { kind: string; label: string; field?: string; detail: string }[] = [];
          const data = await generateDiagramData({
            onDiagnostic: (x) => diagnostics.push({ kind: x.kind, label: x.label, field: x.field, detail: x.detail }),
            diagramType: d.type,
            prompt: d.prompt,
            model,
            apiKey,
            rules,
            promptLabel: d.name,
          });
          // Save the prompt into AI Prompt Maintenance under its diagram type, and
          // link it back on the diagram's data (the editor's "Generated from" link).
          const promptName = `${d.name} — AI prompt`;
          let promptId: string | undefined;
          try {
            const p = await prisma.prompt.create({
              data: { name: promptName, text: d.prompt, diagramType: d.type, userId, orgId },
              select: { id: true },
            });
            promptId = p.id;
          } catch { /* prompt-list save is best-effort — still create the diagram */ }
          if (promptId) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (data as any).aiGeneration = {
              promptId, promptName, promptText: d.prompt, model,
              generatedAt: new Date().toISOString(), autoNamed: true,
            };
          }
          const saved = await prisma.diagram.create({
            data: {
              name: d.name,
              type: d.type,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              data: data as any,
              userId,
              diagramOwnerId: userId,
              orgId,
              projectId,
            },
            select: { id: true },
          });
          created++;
          await recordDiagramGenerated({ userId, orgId, diagramType: d.type, source: "md-batch" });
          send({
            t: "diagram", index, total, name: d.name, type: d.type,
            status: "done", diagramId: saved.id, ms: Date.now() - t0,
            elements: data.elements.length, connectors: data.connectors.length,
            diagnostics,
          });
        } catch (e) {
          failed++;
          send({
            t: "diagram", index, total, name: d.name, type: d.type,
            status: "error", message: e instanceof Error ? e.message : String(e),
          });
        }
      }

      send({ t: "done", projectId, created, failed });
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
