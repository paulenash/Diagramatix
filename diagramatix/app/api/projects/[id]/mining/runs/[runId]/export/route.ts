/**
 * GET — export a mining run to an interchange format for round-trips with other
 * process-mining tools (ProM / Celonis / Disco / Apromore / Signavio PI).
 * Query: ?format=xes|ocel (default xes). Variant-level fidelity — traces are
 * reconstructed from the compressed variants with synthetic timestamps.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildXes } from "@/app/lib/mining/formats/xes";
import { buildOcel } from "@/app/lib/mining/formats/ocel";
import type { Variant, MiningStats } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string; runId: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id, runId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id }, select: { name: true, variants: true, stats: true } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const variants = (run.variants ?? []) as unknown as Variant[];
  const stats = (run.stats ?? null) as unknown as MiningStats | null;
  const name = run.name || "DiagramatixMINER log";
  const format = new URL(req.url).searchParams.get("format") === "ocel" ? "ocel" : "xes";
  const safe = name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "run";

  if (format === "ocel") {
    const body = buildOcel({ name, variants, stats });
    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.ocel.json"` },
    });
  }
  const body = buildXes({ name, variants, stats });
  return new NextResponse(body, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${safe}.xes"` },
  });
}
