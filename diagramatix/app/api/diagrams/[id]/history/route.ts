import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

/** GET /api/diagrams/[id]/history — list snapshots for a diagram, newest first */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* ignore */ }

  let orgId: string;
  try { orgId = await getCurrentOrgId(session, await cookies()); }
  catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { id } = await params;

  // Verify diagram access — normal path (owner, current org)
  let diagram = await prisma.diagram.findFirst({ where: { id, userId, orgId } });
  if (!diagram) {
    // Archived-diagram path: allow access if the original owner was this user
    const archived = await prisma.diagram.findUnique({ where: { id } });
    if (archived) {
      const data = (archived.data as Record<string, unknown>) ?? {};
      const meta = (data._archive as Record<string, unknown>) ?? {};
      if (meta._archivedFromUserId === userId) diagram = archived;
    }
  }
  if (!diagram) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const history = await prisma.diagramHistory.findMany({
    where: { diagramId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json(history);
}
