/**
 * GET — the project's State-Machine diagrams, for the conformance reference picker.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const diagrams = await prisma.diagram.findMany({
    where: { projectId: id, type: "state-machine" },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return NextResponse.json({ diagrams });
}
