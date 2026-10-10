import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { isOrgAdminRole } from "@/app/lib/auth/orgAdminRole";
import { requireRole, WRITE_ROLES, READ_ONLY_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { libraryGet, libraryPost, type LibrarySession } from "@/app/lib/valueChain/libraryAdmin";
import { canDeleteChain, canManageChain, isUserChain, type ChainActor } from "@/app/lib/valueChain/chainPermissions";
import { listOrgMembers, reassignChainOwner } from "@/app/lib/valueChain/newChain";

/**
 * "My Value Chains" — the value chains a user created with "Create a New Value Chain" (Paul, 2026-10-10), managed by their owner, the OrgAdmin
 * and the SuperAdmin.
 *
 * The same maintenance handlers as the SuperAdmin and OrgAdmin screens (libraryAdmin.ts), over the caller's ACTIVE Org, with three additions:
 *   - what is LISTED is only chains the caller may manage (an OrgAdmin or SuperAdmin sees every user-created chain in the Org; anyone else, their own);
 *   - every id-addressed action is checked with canManageChain against THAT chain first — a chain the caller may not manage is "not found";
 *   - only the actions that make sense for a user's chain are allowed (no import, adopt or hand-made chains), and DELETE is the owner's or a
 *     SuperAdmin's only: an OrgAdmin can unpublish a chain but never delete it.
 * "reassign-owner" (OrgAdmin / SuperAdmin) hands a chain to another member, e.g. when its owner has left.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { actor: ChainActor; session: LibrarySession; userName: string };

async function context(mutate: boolean): Promise<Ctx | NextResponse> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jar = await cookies();
  if (mutate && isReadOnlyImpersonation(session, jar)) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  try {
    const { orgId, userId, role } = await requireRole(session, jar, mutate ? WRITE_ROLES : [...WRITE_ROLES, ...READ_ONLY_ROLES]);
    return {
      actor: { userId, orgId, isSuper: isSuperuser(session), isOrgAdmin: isOrgAdminRole(role) },
      session: session as LibrarySession,
      userName: session.user.name || session.user.email || "",
    };
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}

export async function GET(req: Request) {
  const c = await context(false);
  if (c instanceof NextResponse) return c;
  const { actor } = c;
  const url = new URL(req.url);
  // The Org's members, for handing a chain to someone else (OrgAdmin / SuperAdmin only).
  if (url.searchParams.get("members") === "1") {
    if (!actor.isOrgAdmin && !actor.isSuper) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json({ members: await listOrgMembers(actor.orgId) });
  }
  return libraryGet(req, actor.orgId, actor.isOrgAdmin || actor.isSuper ? { userChains: true } : { ownedBy: actor.userId });
}

const ALLOWED = new Set(["save-chain", "save-processes", "regenerate", "questions", "publish", "unpublish", "delete-chain", "reassign-owner"]);

export async function POST(req: Request) {
  const c = await context(true);
  if (c instanceof NextResponse) return c;
  const { actor, session } = c;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (!ALLOWED.has(action)) return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  // Which chain? By id (save-chain, save-processes as chainId, delete-chain, reassign-owner) or by code (the rest). Publish / unpublish must name one.
  const id = String(body?.id ?? body?.chainId ?? "");
  const code = typeof body?.code === "string" ? body.code : "";
  if (!id && !code) return NextResponse.json({ error: "Name the value chain." }, { status: 400 });
  const chain = id
    ? await prisma.valueChainLibrary.findUnique({ where: { id }, select: { id: true, orgId: true, code: true, createdByUserId: true } })
    : await prisma.valueChainLibrary.findFirst({ where: { orgId: actor.orgId, code }, select: { id: true, orgId: true, code: true, createdByUserId: true } });
  if (!chain || chain.orgId !== actor.orgId || !isUserChain(chain) || !canManageChain(actor, chain)) {
    return NextResponse.json({ error: "Value chain not found" }, { status: 404 });
  }

  if (action === "delete-chain" && !canDeleteChain(actor, chain)) {
    return NextResponse.json({ error: "Only the owner of a value chain, or a SuperAdmin, can delete it. You can unpublish it instead." }, { status: 403 });
  }
  if (action === "reassign-owner") {
    if (!actor.isOrgAdmin && !actor.isSuper) return NextResponse.json({ error: "Only an OrgAdmin or SuperAdmin can hand a value chain to someone else." }, { status: 403 });
    const r = await reassignChainOwner(chain, String(body?.userId ?? ""));
    return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 });
  }
  if (action === "regenerate" || action === "questions") {
    const pol = await gateOrgPolicy(session, "allowAi");
    if (pol) return pol;
  }

  // Hand the (now authorised) request to the shared handlers, which scope it to the Org again and meter AI use against the caller.
  const forward = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ ...body, ...(id ? {} : { id: chain.id }) }) });
  return libraryPost(forward, session, actor.orgId);
}
