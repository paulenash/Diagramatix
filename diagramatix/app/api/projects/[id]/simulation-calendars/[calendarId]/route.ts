import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { sanitizePattern } from "../sanitize";

type Params = { params: Promise<{ id: string; calendarId: string }> };

/** PUT /api/projects/[id]/simulation-calendars/[calendarId] { name?, pattern? } */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, calendarId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.simulationCalendar.findFirst({ where: { id: calendarId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  // Scalar (name) via Prisma; the JSON `pattern` via raw SQL (Prisma 7 omits
  // JSON fields from write inputs).
  if (typeof body.name === "string" && body.name.trim()) {
    await prisma.simulationCalendar.update({ where: { id: calendarId }, data: { name: body.name.trim() } });
  }
  if (body.pattern !== undefined) {
    await pgPool.query('UPDATE "SimulationCalendar" SET pattern = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(sanitizePattern(body.pattern)), calendarId]);
  }
  const calendar = await prisma.simulationCalendar.findUnique({ where: { id: calendarId } });
  return NextResponse.json({ calendar });
}

/** DELETE /api/projects/[id]/simulation-calendars/[calendarId]. Teams/sources
 *  referencing it by id simply fall back to always-open (no FK cascade). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id, calendarId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const existing = await prisma.simulationCalendar.findFirst({ where: { id: calendarId, projectId: id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.simulationCalendar.delete({ where: { id: calendarId } });
  return NextResponse.json({ ok: true });
}
