/**
 * GET /api/diagrams/[id]/generate/[jobId] — poll one of the caller's phone
 * Generate runs (see ../route.ts). Another user's run, or another diagram's,
 * is "not found": the prompt text in a run belongs to whoever spoke it.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { reapStaleGenerateJobs, viewGenerateJob } from "@/app/lib/ai/generateJob";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; jobId: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, jobId } = await params;
  // Lazily, so a run lost to a restart reads as failed rather than forever "running".
  await reapStaleGenerateJobs();
  const job = await prisma.diagramGenerateJob.findFirst({
    where: { id: jobId, diagramId: id, userId: session.user.id },
    select: {
      id: true, status: true, stage: true, promptText: true, version: true,
      errorCode: true, errorMessage: true, startedAt: true, finishedAt: true,
    },
  });
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(viewGenerateJob(job));
}
