/**
 * Interactive "Refresh now" for a live mining source. For pull sources
 * (azure-blob / sharepoint) it first polls for new files, then rebuilds the
 * live run in place from the accumulated buffer. SharePoint uses the signed-in
 * user's Graph token (unattended SharePoint polling is a later phase).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { refreshRunFromSource } from "@/app/lib/mining/refreshRun";
import { pollBlobSource, pollSharePointSource } from "@/app/lib/mining/pull";

type Params = { params: Promise<{ id: string; sourceId: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, sourceId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const source = await prisma.miningSource.findFirst({ where: { id: sourceId, projectId: id } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let ingested = 0;
  try {
    if (source.kind === "azure-blob") ingested = await pollBlobSource(source);
    else if (source.kind === "sharepoint") ingested = await pollSharePointSource(source, req);
  } catch (err) {
    return NextResponse.json({ error: `Poll failed: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 });
  }

  const fresh = await prisma.miningSource.findUnique({ where: { id: sourceId } });
  const result = fresh ? await refreshRunFromSource(fresh) : null;
  return NextResponse.json({ ingested, result });
}
