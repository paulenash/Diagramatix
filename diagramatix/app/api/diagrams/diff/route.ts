/**
 * Diff Processes — server side for the two exports that can't run in the browser:
 *   POST /api/diagrams/diff  { aId, bId, mode: "docx" }  → a .docx comparison report
 *                            { aId, bId, mode: "ai"   }  → { summary } plain-English narrative
 *
 * The comparison table + CSV are computed client-side from the pure diff engine;
 * only .docx (buildDocx, optional org Word-template styles) and the AI narrative
 * (metered `bpmn.process-diff`) need the server. Both diagrams are re-loaded and
 * access-checked here — the client never sends the diff, so nothing is trusted.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { makeAiClient, aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { buildDocx } from "@/app/lib/documents/exportDocx";
import { isSuperuser } from "@/app/lib/superuser";
import JSZip from "jszip";
import type { DiagramData } from "@/app/lib/diagram/types";
import { diffProcesses, type ProcessDiff } from "@/app/lib/diagram/diff/processDiff";
import { diffToMarkdown, diffForAi } from "@/app/lib/diagram/diff/processDiffFormat";

/** Org Word-template style adoption: lift word/styles.xml from the org's default
 *  (or newest) SOP template's uploaded .docx, so the diff report matches the org's
 *  Word branding — the same style source SOP export uses. */
async function orgWordStyles(orgId: string | null): Promise<string | undefined> {
  if (!orgId) return undefined;
  const tpl =
    (await prisma.sopTemplate.findFirst({ where: { orgId, isDefault: true, NOT: { docxTemplate: null } }, select: { docxTemplate: true } }))
    ?? (await prisma.sopTemplate.findFirst({ where: { orgId, NOT: { docxTemplate: null } }, orderBy: { updatedAt: "desc" }, select: { docxTemplate: true } }));
  if (!tpl?.docxTemplate) return undefined;
  try {
    const zip = await JSZip.loadAsync(Buffer.from(tpl.docxTemplate));
    return await zip.file("word/styles.xml")?.async("text");
  } catch { return undefined; }
}

/** Build the .docx comparison report response from a computed diff + optional AI summary. */
function diffDocxResponse(aName: string, bName: string, diff: ProcessDiff, aiSummary: string, externalStyles?: string) {
  const sections = [
    ...(aiSummary ? [{ heading: "AI Summary", bodyMarkdown: aiSummary }] : []),
    { heading: aiSummary ? "Comparison" : null, bodyMarkdown: diffToMarkdown(diff) },
  ];
  const title = `Process Comparison — ${aName} vs ${bName}`;
  const safe = `${aName}-vs-${bName}`.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
  return buildDocx([{ title, sections }], { docTitle: title, externalStyles }).then((buf) =>
    new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safe}.docx"`,
      },
    }),
  );
}

const AI_BRIEFING =
  "You are a business analyst. Given a structured comparison of two versions of the " +
  "same business process, write a concise plain-English summary of what changed between " +
  "the 'before' and 'after' versions. Cover, where relevant: who does the work (roles / " +
  "lanes), which IT systems are used, message flows, data objects, and what activities were " +
  "added, removed or altered. Call out AUTOMATION shifts implied by task-marker changes: " +
  "manual→user means IT system support was introduced for a previously manual task; " +
  "user→service/script means automation (RPA, an agent, or a system service) now performs " +
  "work a person used to do; the reverse means automation/IT support was removed. " +
  "Assess REVIEW EVIDENCE from the reviewStatus data: Review Comments, Pain Points, Issues and " +
  "Bottlenecks are annotations added during a review. If they were ADDED, a review has occurred. " +
  "If they were REMOVED, judge whether the process changes plausibly RESOLVED them: did the changes " +
  "implement what a removed Review Comment highlighted, and was a removed Pain Point or Bottleneck " +
  "eliminated by a change AT OR NEAR its location (compare each annotation's 'location'/'near' to the " +
  "activities that changed, moved role, or were automated)? Explicitly state, per removed annotation, " +
  "whether the evidence suggests it was addressed, and flag any that appear removed WITHOUT a " +
  "corresponding change (possibly dismissed rather than resolved). " +
  "Use short paragraphs and bullet points. Do not invent changes that aren't in the data. " +
  "If nothing material changed, say so.";

type Sess = Parameters<typeof requireDiagramAccess>[0];
type Jar = Parameters<typeof requireDiagramAccess>[1];
async function loadDiagram(session: Sess, jar: Jar, id: string) {
  await requireDiagramAccess(session, jar, id, "view");
  const d = await prisma.diagram.findUnique({ where: { id }, select: { id: true, name: true, data: true, orgId: true } });
  if (!d) throw new OrgContextError("Diagram not found", 404);
  return { name: d.name, orgId: d.orgId, data: (d.data ?? { elements: [], connectors: [] }) as unknown as DiagramData };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Export a SAVED run to Word (renders from the stored snapshot, not a recompute).
  const runId = typeof body.runId === "string" ? body.runId : "";
  if (runId && body.mode === "docx") {
    const run = await prisma.processDiffRun.findUnique({ where: { id: runId } });
    if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
    let ok = run.createdById === session.user.id || isSuperuser(session);
    if (!ok) {
      const jar = await cookies();
      for (const did of [run.aDiagramId, run.bDiagramId]) {
        if (!did) continue;
        try { await requireDiagramAccess(session, jar, did, "view"); ok = true; break; } catch { /* try other */ }
      }
    }
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return diffDocxResponse(run.aName, run.bName, run.result as unknown as ProcessDiff, run.aiSummary?.trim() ?? "", await orgWordStyles(run.orgId));
  }

  const aId = typeof body.aId === "string" ? body.aId : "";
  const bId = typeof body.bId === "string" ? body.bId : "";
  const mode = body.mode === "docx" || body.mode === "ai" ? body.mode : "";
  if (!aId || !bId || !mode) return NextResponse.json({ error: "aId, bId and mode are required" }, { status: 400 });

  let a, b;
  try {
    const jar = await cookies();
    a = await loadDiagram(session, jar, aId);
    b = await loadDiagram(session, jar, bId);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const diff = diffProcesses(a.data, a.name, b.data, b.name);

  if (mode === "docx") {
    // Optional AI narrative (already generated + shown to the user) leads the doc.
    const aiSummary = typeof body.aiSummary === "string" ? body.aiSummary.trim() : "";
    return diffDocxResponse(a.name, b.name, diff, aiSummary, await orgWordStyles(a.orgId));
  }

  // mode === "ai"
  const pol = await gateOrgPolicy(session, "allowAi");
  if (pol) return pol;
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.ProcessDiff));
  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI not configured for the selected model." }, { status: 503 });
  const block = await gateLimit(session.user.id, "aiAttempts");
  if (block) return block;

  try {
    const client = makeAiClient(model, apiKey);
    const message = await client.messages.create({
      model,
      max_tokens: 1500,
      system: AI_BRIEFING,
      messages: [{ role: "user", content: `Process comparison (JSON):\n\n${JSON.stringify(diffForAi(diff), null, 2)}` }],
    });
    const textBlock = message.content.find((blk) => blk.type === "text");
    const summary = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    if (!summary) return NextResponse.json({ error: "No response from AI" }, { status: 502 });
    await recordUsage(session.user.id, "aiAttempts");
    return NextResponse.json({ summary, model });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Summary failed: ${msg}` }, { status: 500 });
  }
}
