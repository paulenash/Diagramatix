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
import type { DiagramData } from "@/app/lib/diagram/types";
import { diffProcesses } from "@/app/lib/diagram/diff/processDiff";
import { diffToMarkdown, diffForAi } from "@/app/lib/diagram/diff/processDiffFormat";

const AI_BRIEFING =
  "You are a business analyst. Given a structured comparison of two versions of the " +
  "same business process, write a concise plain-English summary of what changed between " +
  "the 'before' and 'after' versions. Cover, where relevant: who does the work (roles / " +
  "lanes), which IT systems are used, and what activities were added, removed or altered. " +
  "Use short paragraphs and bullet points. Do not invent changes that aren't in the data. " +
  "If nothing material changed, say so.";

type Sess = Parameters<typeof requireDiagramAccess>[0];
type Jar = Parameters<typeof requireDiagramAccess>[1];
async function loadDiagram(session: Sess, jar: Jar, id: string) {
  await requireDiagramAccess(session, jar, id, "view");
  const d = await prisma.diagram.findUnique({ where: { id }, select: { id: true, name: true, data: true } });
  if (!d) throw new OrgContextError("Diagram not found", 404);
  return { name: d.name, data: (d.data ?? { elements: [], connectors: [] }) as unknown as DiagramData };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
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
    // Optional AI narrative (already generated + shown to the user) is embedded
    // as the first section so the Word report leads with the plain-English summary.
    const aiSummary = typeof body.aiSummary === "string" ? body.aiSummary.trim() : "";
    const sections = [
      ...(aiSummary ? [{ heading: "AI Summary", bodyMarkdown: aiSummary }] : []),
      { heading: aiSummary ? "Comparison" : null, bodyMarkdown: diffToMarkdown(diff) },
    ];
    const buf = await buildDocx(
      [{ title: `Process Comparison — ${a.name} vs ${b.name}`, sections }],
      { docTitle: `Process Comparison — ${a.name} vs ${b.name}` },
    );
    const safe = `${a.name}-vs-${b.name}`.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safe}.docx"`,
      },
    });
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
