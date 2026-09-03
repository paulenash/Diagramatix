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
import { uniqueDiagramName } from "@/app/lib/valueChain/uniqueDiagramName";

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
    | { md?: unknown; chainCode?: unknown; projectName?: unknown; source?: unknown;
        projectId?: unknown; diagramKeys?: unknown }
    | null;
  const md = typeof body?.md === "string" ? body.md : "";
  const chainCode = typeof body?.chainCode === "string" ? body.chainCode.trim() : "";
  const fromLibrary = body?.source === "library";
  /** Regenerate INTO an existing project rather than creating a new one. */
  const targetProjectId = typeof body?.projectId === "string" && body.projectId.trim()
    ? body.projectId.trim() : "";
  /**
   * Which diagrams of the chain to generate, as `${type}::${name}`. Omitted or
   * empty means the whole chain — the original behaviour. Selecting a subset is
   * what makes regenerating one diagram cheap: a chain is ~15 AI calls.
   */
  const diagramKeys = Array.isArray(body?.diagramKeys)
    ? new Set(body.diagramKeys.filter((k): k is string => typeof k === "string"))
    : null;
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

  // Narrow to the selection, keeping the chain's own order so a partial run
  // still reads top-down the way the chain does.
  if (diagramKeys && diagramKeys.size > 0) {
    chain = { ...chain, diagrams: chain.diagrams.filter((d) => diagramKeys.has(`${d.type}::${d.name}`)) };
    if (chain.diagrams.length === 0) {
      return NextResponse.json({ error: "None of the selected diagrams are in this value chain" }, { status: 422 });
    }
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
      let existingProject = false;
      /**
       * Names already taken in the target project. Regenerating into a project
       * that already holds the diagram must NOT overwrite it — the point is to
       * compare the new one against the old — so a clash gets " (2)", " (3)", …
       * The set is seeded from the database and then updated as this run
       * creates diagrams, so two diagrams of the same name in one selection
       * still land as "X" and "X (2)".
       */
      const takenNames = new Set<string>();
      try {
        if (targetProjectId) {
          const existing = await prisma.project.findFirst({
            where: { id: targetProjectId, orgId },
            select: { id: true, name: true },
          });
          if (!existing) {
            send({ t: "error", message: "That project is not in your current organisation" });
            controller.close();
            return;
          }
          projectId = existing.id;
          existingProject = true;
          const had = await prisma.diagram.findMany({ where: { projectId }, select: { name: true } });
          for (const d of had) takenNames.add(d.name);
          send({ t: "project", projectId, projectName: existing.name, total, existing: true });
        } else {
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
          send({ t: "project", projectId, projectName: projectName.trim(), total, existing: false });
        }
      } catch (e) {
        send({ t: "error", message: e instanceof Error ? e.message : "Could not open the project" });
        controller.close();
        return;
      }

      const uniqueName = (base: string) => uniqueDiagramName(base, takenNames);

      /**
       * Is this failure the provider being busy rather than anything wrong?
       *
       * Paul, 2026-09-03, from a run: `V02.05 ✗ 529 {"type":"error","error":
       * {"type":"overloaded_e…`. 529 is Anthropic's overloaded_error — their
       * servers were saturated for a moment. The SDK already retries twice on a
       * 5xx, so three attempts had failed; but the run is UNATTENDED and losing
       * a diagram to a passing blip means someone has to notice and re-run it.
       */
      const isTransient = (e: unknown) => {
        const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
        const status = (e as { status?: number })?.status;
        return status === 429 || status === 529 || (typeof status === "number" && status >= 500)
          || m.includes("overloaded") || m.includes("rate limit") || m.includes("529")
          || m.includes("timeout") || m.includes("econnreset");
      };
      /** A readable line for the UI; the raw provider JSON is not one. */
      const describeError = (e: unknown) => {
        const raw = e instanceof Error ? e.message : String(e);
        if (/overloaded|529/i.test(raw)) return "AI provider overloaded (529) — transient, try again";
        if (/rate.?limit|429/i.test(raw)) return "AI provider rate limit (429) — transient, try again";
        if (/timeout/i.test(raw)) return "AI call timed out — transient, try again";
        return raw.length > 160 ? raw.slice(0, 157) + "…" : raw;
      };
      /** Wait between attempts; a busy provider needs a moment, not an instant retry. */
      const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));


      /** Ids created by THIS run — the client re-links only these by default. */
      const createdIds: string[] = [];
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
          // The raw plan, kept so a bad generation can be replayed offline and
          // exactly. See GenerateDiagramInput.onPlan for why the saved diagram is
          // not enough.
          let plan: unknown;
          // Up to three goes when the provider is merely busy. A real fault —
          // a bad prompt, a refusal, a parse failure — is not retried, because
          // repeating it just burns tokens to reach the same answer.
          const generateOnce = () => generateDiagramData({
            onDiagnostic: (x) => diagnostics.push({ kind: x.kind, label: x.label, field: x.field, detail: x.detail }),
            onPlan: (p) => { plan = p; },
            diagramType: d.type,
            prompt: d.prompt,
            model,
            apiKey,
            rules,
            promptLabel: d.name,
          });
          let data!: Awaited<ReturnType<typeof generateOnce>>;
          for (let attempt = 1; ; attempt++) {
            try { data = await generateOnce(); break; }
            catch (err) {
              if (attempt >= 3 || !isTransient(err)) throw err;
              diagnostics.length = 0;            // a retry starts clean
              send({ t: "diagram", index, total, name: d.name, type: d.type,
                status: "generating", message: `${describeError(err)} — retry ${attempt} of 2` });
              await pause(attempt * 4000);
            }
          }
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
          // The plan and the diagnostics are kept whether or not the prompt-list
          // save succeeded — they are the record of HOW this diagram came out,
          // and the prompt row is a convenience link.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data as any).aiGeneration = {
            ...(promptId ? { promptId, promptName } : {}),
            promptText: d.prompt, model,
            generatedAt: new Date().toISOString(), autoNamed: true,
            ...(plan ? { plan } : {}),
            ...(diagnostics.length ? { diagnostics } : {}),
          };
          const savedName = uniqueName(d.name);
          const saved = await prisma.diagram.create({
            data: {
              name: savedName,
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
          createdIds.push(saved.id);
          send({
            t: "diagram", index, total, name: d.name, type: d.type,
            status: "done", diagramId: saved.id, ms: Date.now() - t0,
            elements: data.elements.length, connectors: data.connectors.length,
            diagnostics,
            // Only when it differs — the UI shows the rename so nobody wonders
            // why the diagram they asked for is not the one they are looking at.
            ...(savedName !== d.name ? { savedName } : {}),
          });
        } catch (e) {
          failed++;
          send({
            t: "diagram", index, total, name: d.name, type: d.type,
            status: "error", message: describeError(e),
          });
        }
      }

      send({ t: "done", projectId, created, failed, createdIds, existing: existingProject });
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
