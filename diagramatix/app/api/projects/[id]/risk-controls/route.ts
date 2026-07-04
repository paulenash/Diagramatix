import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { loadProjectLibrary } from "@/app/lib/riskControls/queries";

type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/risk-controls — the project's own library (or null).
 *  Gated at "view" so the diagram editor can load it for element attachment. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "view", false); if (g.error) return g.error;
  return NextResponse.json({ library: await loadProjectLibrary(id) });
}

/** POST { name } — create an empty project library (owner only). */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  const existing = await prisma.riskControlLibrary.findFirst({ where: { projectId: id }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "This project already has a Risk & Control library." }, { status: 409 });
  const name = (await req.json().catch(() => ({})))?.name;
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const library = await prisma.riskControlLibrary.create({ data: { name: clean, projectId: id } });
  return NextResponse.json({ library: { ...library, items: [], links: [] } }, { status: 201 });
}
