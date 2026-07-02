import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { sanitizePattern } from "./sanitize";

type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/simulation-calendars — the project's working calendars
 *  (reusable weekly shift patterns). Gated at "view" so any editor/viewer can
 *  load them when running a simulation. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const calendars = await prisma.simulationCalendar.findMany({
    where: { projectId: id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ calendars });
}

/** POST /api/projects/[id]/simulation-calendars { name, pattern? } */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  // Create the row (pattern defaults to {"intervals":[]}); if a pattern was
  // supplied, write it via raw SQL — Prisma 7 omits JSON fields from write inputs.
  const created = await prisma.simulationCalendar.create({ data: { name, projectId: id } });
  if (body.pattern !== undefined) {
    await pgPool.query('UPDATE "SimulationCalendar" SET pattern = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(sanitizePattern(body.pattern)), created.id]);
  }
  const calendar = await prisma.simulationCalendar.findUnique({ where: { id: created.id } });
  return NextResponse.json({ calendar }, { status: 201 });
}
