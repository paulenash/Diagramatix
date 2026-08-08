/**
 * GET /api/projects/:id/simulation/packages
 * All of a project's simulation studies as portable packages (config only:
 * study + scenarios + team/calendar libraries; no run results). Used by the
 * project JSON export so simulation configuration travels with the export and
 * can be replayed on import (POST …/simulation/adopt).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { captureAllProjectPackages } from "@/app/lib/simulation/captureProject";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const packages = await captureAllProjectPackages(id);
  return NextResponse.json({ packages });
}
