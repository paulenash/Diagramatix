/**
 * GET    /api/skills            — the org's master Skills list (+ orphans).
 * POST   /api/skills            — add one.
 * PATCH  /api/skills            — edit one (category/description/active/order).
 * DELETE /api/skills?id=…       — delete one (refuses while in use unless ?force=1).
 *
 * READ is open to anyone in the org: the picker on a task and on a team member
 * needs it, and a vocabulary nobody can read is a vocabulary nobody will use.
 * WRITE is OrgAdmin-only — the point of a master list is that it is governed, and
 * a list every user may extend at will is the free text it replaced.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { tryGetCurrentOrgId, requireOrgAdminFor } from "@/app/lib/auth/orgContext";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import {
  listSkills, createSkill, updateSkill, deleteSkill, orphanSkillNames,
} from "@/app/lib/simulation/skillCatalog";

/**
 * Who is asking, and about WHICH org.
 *
 * A SuperAdmin may target any org with `?orgId=` (or an `orgId` in the body),
 * because they maintain every org's vocabulary. For anyone else the parameter is
 * IGNORED rather than refused: a URL is not a permission, and honouring one
 * would make the query string the access-control surface. They always get their
 * own active org, whatever they ask for.
 */
async function ctx(req: Request, bodyOrgId?: unknown) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const cookieStore = await cookies();

  const activeOrgId = await tryGetCurrentOrgId(session, cookieStore);
  const su = await isActingSuperuser(session);
  const asked = typeof bodyOrgId === "string" && bodyOrgId
    ? bodyOrgId
    : new URL(req.url).searchParams.get("orgId");
  const orgId = su && asked ? asked : activeOrgId;
  if (!orgId) return null;

  return { session, cookieStore, orgId, su, readOnly: isReadOnlyImpersonation(session, cookieStore) };
}

export async function GET(req: Request) {
  const c = await ctx(req);
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const includeInactive = url.searchParams.get("includeInactive") === "1";
  const skills = await listSkills(c.orgId, { includeInactive });

  // Only when asked: it reads every BPMN diagram in the org, which is not a
  // cost the task picker should pay on every open.
  const orphans = url.searchParams.get("orphans") === "1" ? await orphanSkillNames(c.orgId) : undefined;

  return NextResponse.json({ skills, ...(orphans ? { orphans } : {}) });
}

/** OrgAdmin + not read-only, or the reason why not. */
async function gateWrite(c: NonNullable<Awaited<ReturnType<typeof ctx>>>) {
  if (c.readOnly) return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  try {
    await requireOrgAdminFor(c.session, c.cookieStore, c.orgId);
  } catch {
    return NextResponse.json({ error: "Only an organisation admin can change the Skills list." }, { status: 403 });
  }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { name?: unknown; category?: unknown; description?: unknown; orgId?: unknown } | null;
  const c = await ctx(req, body?.orgId);
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await gateWrite(c);
  if (blocked) return blocked;

  if (typeof body?.name !== "string") return NextResponse.json({ error: "name is required" }, { status: 400 });

  const r = await createSkill(c.orgId, {
    name: body.name,
    category: typeof body.category === "string" ? body.category : null,
    description: typeof body.description === "string" ? body.description : null,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ skill: r.skill }, { status: 201 });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null) as
    | { id?: unknown; category?: unknown; description?: unknown; active?: unknown; sortOrder?: unknown; orgId?: unknown } | null;
  const c = await ctx(req, body?.orgId);
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await gateWrite(c);
  if (blocked) return blocked;

  if (typeof body?.id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });

  const r = await updateSkill(c.orgId, body.id, {
    ...(body.category !== undefined ? { category: typeof body.category === "string" ? body.category : null } : {}),
    ...(body.description !== undefined ? { description: typeof body.description === "string" ? body.description : null } : {}),
    ...(typeof body.active === "boolean" ? { active: body.active } : {}),
    ...(typeof body.sortOrder === "number" ? { sortOrder: body.sortOrder } : {}),
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ skill: r.skill });
}

export async function DELETE(req: Request) {
  const c = await ctx(req);
  if (!c) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await gateWrite(c);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const r = await deleteSkill(c.orgId, id, url.searchParams.get("force") === "1");
  // 409, not 400: the request was well formed and the refusal is about STATE —
  // the caller can retry it verbatim with ?force=1 once they have decided.
  if (!r.ok) return NextResponse.json({ error: r.error, inUse: r.inUse ?? 0 }, { status: r.inUse ? 409 : 400 });
  return NextResponse.json({ ok: true });
}
