/**
 * GET /api/projects/:id/mining/runs/:runId/analysis-export?format=docx|xlsx|pdf
 * → the DiagramatixMINER analysis report (summary, bottlenecks, variants,
 *   outcomes). Word via buildDocx, PDF via docxToPdf (LibreOffice), Excel via
 *   the hand-built xlsx writer. Project view access.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildDocx } from "@/app/lib/documents/exportDocx";
import { docxToPdf } from "@/app/lib/documents/docxToPdf";
import { buildXlsx } from "@/app/lib/riskControls/xlsx";
import { buildAnalysisChapters, buildAnalysisSheets, type AnalysisInput } from "@/app/lib/mining/exportAnalysis";
import type { RunAnalytics } from "@/app/lib/mining/analytics";
import type { MiningStats, Variant } from "@/app/lib/mining/types";
import type { KpiConfig } from "@/app/lib/mining/outcomes";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id, runId } = await params;
  const format = new URL(req.url).searchParams.get("format") ?? "docx";
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const analytics = run.analytics as unknown as RunAnalytics | null;
  if (!analytics || !analytics.activities?.length) {
    return NextResponse.json({ error: "No analytics for this run — re-import the log to compute the Insights." }, { status: 400 });
  }

  const input: AnalysisInput = {
    name: run.name,
    stats: run.stats as unknown as MiningStats,
    analytics,
    variants: (run.variants as unknown as Variant[]) ?? [],
    kpiConfig: (run.kpiConfig as unknown as KpiConfig | null) ?? null,
  };
  const safe = run.name.replace(/[^a-z0-9\-_. ]/gi, "_").slice(0, 80) || "insights";

  if (format === "xlsx") {
    const buf = await buildXlsx(buildAnalysisSheets(input));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${safe}-insights.xlsx"` },
    });
  }

  const docx = await buildDocx(buildAnalysisChapters(input), { docTitle: `Process Insights — ${run.name}` });

  if (format === "pdf") {
    try {
      const pdf = await docxToPdf(Buffer.from(docx));
      return new NextResponse(new Uint8Array(pdf), { status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${safe}-insights.pdf"` } });
    } catch {
      return NextResponse.json({ error: "pdf-unavailable" }, { status: 503 });
    }
  }

  return new NextResponse(new Uint8Array(docx), {
    status: 200,
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="${safe}-insights.docx"` },
  });
}
