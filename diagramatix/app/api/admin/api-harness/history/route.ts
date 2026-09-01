/**
 * SuperAdmin — a case's run history, and comparing two of its runs.
 *
 * The loop the harness exists for: change the master prompt or the model, run the
 * same fixed input, and see what moved. Without a history that comparison is a
 * memory exercise.
 *
 * The diagram-level detail is left to the existing process-diff machinery rather
 * than reimplemented — `POST /api/diagrams/diff` already knows how to compare two
 * BPMN versions, and a second, subtly different comparison would be worse than
 * none.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";

export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const url = new URL(req.url);
  const jobId = url.searchParams.get("jobId")?.trim();

  /**
   * ONE RUN, IN FULL — the inputs that produced it and the outputs it produced.
   *
   * The list below carries headline numbers, which answers "which run was
   * better". This answers the other question, which is the one you have when a
   * run went wrong: what exactly went in, and what exactly came back. Without it
   * a saved run is a row in a table rather than something you can reopen.
   */
  if (jobId) {
    const job = await prisma.partnerJob.findUnique({
      where: { id: jobId },
      select: {
        id: true, status: true, stage: true, model: true, createdAt: true,
        startedAt: true, finishedAt: true, diagramId: true, projectId: true,
        result: true, error: true, request: true, harnessCaseId: true,
        inputDocumentName: true, inputDocumentType: true,
      },
    });
    if (!job) return NextResponse.json({ error: "No such run" }, { status: 404 });

    // The case is where a harness run's own inputs live — the prose and the
    // document belong to it, not to the job, so a re-run of the same case does
    // not store them twice.
    const kase = job.harnessCaseId
      ? await prisma.harnessCase.findUnique({
          where: { id: job.harnessCaseId },
          select: { id: true, name: true, notes: true, description: true, documentName: true, documentType: true, volumetrics: true },
        })
      : null;

    return NextResponse.json({
      run: {
        jobId: job.id,
        status: job.status,
        stage: job.stage,
        model: job.model,
        at: job.createdAt,
        durationMs: job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null,
        diagramId: job.diagramId,
        projectId: job.projectId,
        // The SHAPE of what was sent: sizes and hashes always, and the caller's
        // own instructions, which change the result and so have to be visible.
        request: job.request,
        documentName: job.inputDocumentName ?? kase?.documentName ?? null,
        documentType: job.inputDocumentType ?? kase?.documentType ?? null,
        result: job.result,
        error: job.error,
        case: kase,
      },
    });
  }

  const caseId = url.searchParams.get("caseId")?.trim();
  if (!caseId) return NextResponse.json({ error: "caseId or jobId is required" }, { status: 400 });

  const jobs = await prisma.partnerJob.findMany({
    where: { harnessCaseId: caseId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true, status: true, model: true, createdAt: true, startedAt: true, finishedAt: true,
      diagramId: true, projectId: true, result: true, error: true,
    },
  });

  return NextResponse.json({
    runs: jobs.map((j) => {
      const r = (j.result ?? {}) as {
        diagram?: { elementCount?: number; connectorCount?: number; name?: string };
        activities?: unknown[]; warnings?: unknown[]; diagnostics?: unknown[];
      };
      return {
        jobId: j.id,
        status: j.status,
        model: j.model,
        at: j.createdAt,
        durationMs: j.startedAt && j.finishedAt ? j.finishedAt.getTime() - j.startedAt.getTime() : null,
        diagramId: j.diagramId,
        diagramName: r.diagram?.name ?? null,
        elements: r.diagram?.elementCount ?? null,
        connectors: r.diagram?.connectorCount ?? null,
        activities: Array.isArray(r.activities) ? r.activities.length : null,
        warnings: Array.isArray(r.warnings) ? r.warnings.length : null,
        diagnostics: Array.isArray(r.diagnostics) ? r.diagnostics.length : null,
        error: j.status === "failed" ? (j.error as { code?: string })?.code ?? null : null,
      };
    }),
  });
}

/** Compare two runs of the same case — the headline numbers side by side. */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as { a?: string; b?: string } | null;
  if (!body?.a || !body?.b) return NextResponse.json({ error: "Two job ids are required" }, { status: 400 });

  const [a, b] = await Promise.all([
    prisma.partnerJob.findUnique({ where: { id: body.a }, select: { id: true, model: true, result: true, startedAt: true, finishedAt: true, diagramId: true } }),
    prisma.partnerJob.findUnique({ where: { id: body.b }, select: { id: true, model: true, result: true, startedAt: true, finishedAt: true, diagramId: true } }),
  ]);
  if (!a || !b) return NextResponse.json({ error: "One of those runs no longer exists" }, { status: 404 });

  const side = (j: typeof a) => {
    const r = (j!.result ?? {}) as {
      diagram?: { elementCount?: number; connectorCount?: number };
      activities?: { name: string }[]; pools?: unknown[]; roles?: string[];
      warnings?: unknown[]; diagnostics?: unknown[];
    };
    return {
      jobId: j!.id,
      model: j!.model,
      diagramId: j!.diagramId,
      durationMs: j!.startedAt && j!.finishedAt ? j!.finishedAt.getTime() - j!.startedAt.getTime() : null,
      elements: r.diagram?.elementCount ?? 0,
      connectors: r.diagram?.connectorCount ?? 0,
      activities: r.activities?.length ?? 0,
      roles: r.roles?.length ?? 0,
      pools: r.pools?.length ?? 0,
      warnings: r.warnings?.length ?? 0,
      diagnostics: r.diagnostics?.length ?? 0,
      activityNames: (r.activities ?? []).map((x) => x.name),
    };
  };

  const A = side(a), B = side(b);
  const setA = new Set(A.activityNames.map((n) => n.toLowerCase().replace(/\s+/g, " ").trim()));
  const setB = new Set(B.activityNames.map((n) => n.toLowerCase().replace(/\s+/g, " ").trim()));

  return NextResponse.json({
    a: A,
    b: B,
    // Named from B's point of view: what the newer run did that the older did not.
    onlyInA: A.activityNames.filter((n) => !setB.has(n.toLowerCase().replace(/\s+/g, " ").trim())),
    onlyInB: B.activityNames.filter((n) => !setA.has(n.toLowerCase().replace(/\s+/g, " ").trim())),
    // The full diagram-level comparison is the existing feature, not a second
    // implementation of it.
    diffHint: A.diagramId && B.diagramId
      ? { endpoint: "/api/diagrams/diff", a: A.diagramId, b: B.diagramId }
      : null,
  });
}
