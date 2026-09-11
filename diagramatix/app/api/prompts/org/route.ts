/**
 * GET  /api/prompts/org   — every saved prompt in the active org, with its owner.
 * POST /api/prompts/org   — delete a named set of them.
 *
 * **OrgAdmin or SuperAdmin only.** A saved prompt is somebody's working note:
 * it can carry the description of a process they were asked to model, which is
 * exactly the kind of thing a colleague should not be able to read casually.
 * `/api/prompts` stays private to its owner and is unchanged; this is the
 * separate, gated door, so the ordinary path cannot accidentally widen.
 *
 * The delete is a POST rather than a DELETE because it carries a body naming
 * the ids, and it re-checks every one of them against the active org before
 * removing anything — an id list from a browser is a request, not an authority.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { getCurrentOrgId, requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, cookieStore);
    // SuperAdmin anywhere, OrgAdmin in their own org. A saved prompt is
    // somebody's working note — it can carry the description of a process they
    // were asked to model, which is not something a colleague should read
    // casually.
    await requireOrgAdminFor(session, cookieStore, orgId);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const diagramType = searchParams.get("diagramType");

  const prompts = await prisma.prompt.findMany({
    where: { orgId, ...(diagramType ? { diagramType } : {}) },
    orderBy: [{ userId: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true, name: true, text: true, diagramType: true,
      createdAt: true, updatedAt: true,
      source: true, refinedAt: true, fromImage: true,
      modelUsed: true, lastUsedAt: true, useCount: true,
      // Not the plan itself — it can be large, and the list only needs to know
      // whether there IS one. A prompt that has one re-applies with no AI call.
      planUpdatedAt: true,
      userId: true,
      user: { select: { email: true, name: true } },
    },
  });

  return NextResponse.json(prompts.map((p) => ({
    id: p.id, name: p.name, text: p.text, diagramType: p.diagramType,
    createdAt: p.createdAt, updatedAt: p.updatedAt,
    source: p.source, refinedAt: p.refinedAt, fromImage: p.fromImage,
    modelUsed: p.modelUsed, lastUsedAt: p.lastUsedAt, useCount: p.useCount,
    planUpdatedAt: p.planUpdatedAt,
    ownerId: p.userId,
    // Display name only; the email is what identifies a colleague in this org.
    ownerLabel: p.user?.name?.trim() || p.user?.email || "(unknown)",
  })));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cookieStore = await cookies();
  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, cookieStore);
    await requireOrgAdminFor(session, cookieStore, orgId);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (isReadOnlyImpersonation(session, cookieStore)) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const ids: unknown = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    return NextResponse.json({ error: "ids must be an array of strings" }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ deleted: 0 });

  // Re-resolve against the ACTIVE ORG rather than trusting the list. A browser
  // can post any id; what it may delete is decided here, not there.
  const owned = await prisma.prompt.findMany({
    where: { id: { in: ids as string[] }, orgId },
    select: { id: true },
  });
  if (owned.length === 0) return NextResponse.json({ deleted: 0, skipped: ids.length });

  const { count } = await prisma.prompt.deleteMany({
    where: { id: { in: owned.map((p) => p.id) }, orgId },
  });

  // Report the shortfall rather than swallowing it: if a caller asked for
  // twelve and nine went, the three that did not belong to this org should be
  // visible, not inferred from a count nobody compares.
  return NextResponse.json({ deleted: count, skipped: ids.length - count });
}
