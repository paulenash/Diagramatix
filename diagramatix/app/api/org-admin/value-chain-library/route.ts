import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";
import { guardOrgRoute } from "@/app/lib/routeGuard";
import { libraryGet, libraryPost, type LibrarySession } from "@/app/lib/valueChain/libraryAdmin";

/**
 * OrgAdmin — "Master Template Value Chain Generation": the Org's OWN Process Repository (Paul, 2026-10-08).
 *
 * The same handlers as the SuperAdmin maintenance route (app/lib/valueChain/libraryAdmin.ts) over the caller's ACTIVE Org's rows only: adopt a
 * master chain, edit its narrative and processes, regenerate its prompts from the master template plus the Org's own additions (with the
 * clarifying questions), publish and unpublish. OrgAdmin of the Org, or a SuperAdmin; read-only impersonation blocked on writes. The Org
 * cannot import a file, and every id-addressed action is checked to be inside the Org's own repository.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function activeOrgId(): Promise<{ orgId: string; session: LibrarySession } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return { orgId: await getCurrentOrgId(session, await cookies()), session: session as LibrarySession };
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function GET(req: Request) {
  const a = await activeOrgId();
  if (a instanceof NextResponse) return a;
  const g = await guardOrgRoute(a.orgId, { mutate: false });
  if (g.error) return g.error;
  return libraryGet(req, a.orgId);
}

export async function POST(req: Request) {
  const a = await activeOrgId();
  if (a instanceof NextResponse) return a;
  const g = await guardOrgRoute(a.orgId, { mutate: true });
  if (g.error) return g.error;
  return libraryPost(req, a.session, a.orgId);
}
