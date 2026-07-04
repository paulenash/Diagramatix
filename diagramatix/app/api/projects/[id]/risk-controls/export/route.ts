import { NextResponse } from "next/server";
import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { buildRcmXlsx } from "@/app/lib/riskControls/exportRcm";

type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/[id]/risk-controls/export — the Risk-Control Matrix as .xlsx. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "view", false); if (g.error) return g.error;
  const rcm = await buildRcmXlsx(id);
  if (!rcm) return NextResponse.json({ error: "This project has no Risk & Control library yet." }, { status: 404 });
  return new NextResponse(rcm.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${rcm.filename.replace(/[^\x20-\x7e]/g, "-")}"`,
    },
  });
}
