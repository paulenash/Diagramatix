import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { libraryGet, libraryPost, type LibrarySession } from "@/app/lib/valueChain/libraryAdmin";
import { listOrgMembers, reassignChainOwner } from "@/app/lib/valueChain/newChain";
import { isUserChain } from "@/app/lib/valueChain/chainPermissions";

/**
 * SuperAdmin — ONE Organisation's own Process Repository (its adopted chains and the chains its users created with "Create a New Value Chain"),
 * managed from the SuperAdmin Process Repository screen's Org picker. The same handlers as the OrgAdmin's screen (libraryAdmin.ts), scoped to the
 * Org named in the path. SuperAdmin only; read-only impersonation blocked on writes. An unknown Org is "not found".
 *
 * Note for the AI actions: they run as the SuperAdmin (their allowance, the Org-model rule of THEIR active Org) — only the rows touched are the
 * named Org's.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ orgId: string }> };

async function authorise(params: Params["params"], mutate: boolean): Promise<{ orgId: string; session: LibrarySession } | NextResponse> {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (mutate && isReadOnlyImpersonation(session, await cookies())) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  const { orgId } = await params;
  const org = orgId ? await prisma.org.findUnique({ where: { id: orgId }, select: { id: true } }) : null;
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });
  return { orgId: org.id, session: session as LibrarySession };
}

export async function GET(req: Request, ctx: Params) {
  const a = await authorise(ctx.params, false);
  if (a instanceof NextResponse) return a;
  if (new URL(req.url).searchParams.get("members") === "1") return NextResponse.json({ members: await listOrgMembers(a.orgId) });
  return libraryGet(req, a.orgId);
}

export async function POST(req: Request, ctx: Params) {
  const a = await authorise(ctx.params, true);
  if (a instanceof NextResponse) return a;
  // "reassign-owner" is not one of the shared handlers' actions (it only exists for chains users created): handled here for the SuperAdmin.
  const peek = (await req.clone().json().catch(() => null)) as { action?: unknown; id?: unknown; userId?: unknown } | null;
  if (peek?.action === "reassign-owner") {
    const chain = await prisma.valueChainLibrary.findUnique({ where: { id: String(peek.id ?? "") }, select: { id: true, orgId: true, createdByUserId: true } });
    if (!chain || chain.orgId !== a.orgId || !isUserChain(chain)) return NextResponse.json({ error: "Value chain not found" }, { status: 404 });
    const r = await reassignChainOwner(chain, String(peek.userId ?? ""));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  return libraryPost(req, a.session, a.orgId);
}
