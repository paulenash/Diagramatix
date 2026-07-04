import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { guardOrg } from "@/app/lib/riskControls/routeAuth";
import { loadOrgLibraries } from "@/app/lib/riskControls/queries";

type Params = { params: Promise<{ id: string }> };

/** GET /api/orgs/[id]/risk-controls — the org's master Risk & Control libraries. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardOrg(id, false); if (g.error) return g.error;
  return NextResponse.json({ libraries: await loadOrgLibraries(id) });
}

/** POST /api/orgs/[id]/risk-controls { name } — create a master library. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardOrg(id, true); if (g.error) return g.error;
  const name = (await req.json().catch(() => ({})))?.name;
  const clean = typeof name === "string" ? name.trim() : "";
  if (!clean) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const library = await prisma.riskControlLibrary.create({ data: { name: clean, orgId: id } });
  return NextResponse.json({ library: { ...library, items: [], links: [] } }, { status: 201 });
}
