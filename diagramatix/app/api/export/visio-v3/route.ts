import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import * as fs from "fs";
import * as path from "path";
import { exportVisioV3 } from "@/app/lib/diagram/v3/exportVisioV3";
import { DEFAULT_SYMBOL_COLORS, BW_SYMBOL_COLORS } from "@/app/lib/diagram/colors";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

/**
 * GET /api/export/visio-v3?diagramId=<id>
 * V3 Visio export — independent fork of V2, free to evolve.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const diagramId = searchParams.get("diagramId");
  if (!diagramId) return NextResponse.json({ error: "diagramId required" }, { status: 400 });

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const diagram = await prisma.diagram.findFirst({
    where: { id: diagramId, orgId },
    include: { project: true },
  });
  if (!diagram) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  try {
    // Load V3-specific BPMN_M stencil + template assets (independent copies of
    // the V2 files so V3 work cannot break V2 exports).
    const stencilPath = path.join(process.cwd(), "public", "bpmn-stencil-v3.vssx");
    const stencilBuf = fs.readFileSync(stencilPath);
    const templatePath = path.join(process.cwd(), "public", "bpmn-template-v3.vsdx");
    const templateBuf = fs.readFileSync(templatePath);

    const data = diagram.data as any;
    const displayMode = (diagram as any).displayMode ?? "normal";

    // Build effective colour config: defaults ← project overrides ← diagram overrides
    const projectColors = ((diagram as any).project?.colorConfig as SymbolColorConfig) ?? {};
    const diagramColors = (data.colorConfig as SymbolColorConfig) ?? {};
    const effectiveColors: SymbolColorConfig = displayMode === "hand-drawn"
      ? BW_SYMBOL_COLORS
      : { ...DEFAULT_SYMBOL_COLORS, ...projectColors, ...diagramColors };

    console.log("[visio-v3] Elements:", data.elements?.length, "Connectors:", data.connectors?.length, "Mode:", displayMode);
    const result = await exportVisioV3(data, diagram.name, stencilBuf.buffer, templateBuf.buffer, displayMode, effectiveColors);
    console.log("[visio-v3] Output size:", result.length, "bytes");

    return new NextResponse(result as any, {
      headers: {
        "Content-Type": "application/vnd.ms-visio.drawing",
        "Content-Disposition": `attachment; filename="${diagram.name} (V3).vsdx"`,
      },
    });
  } catch (err: any) {
    console.error("[visio-v3] Export error:", err);
    return NextResponse.json({ error: err.message ?? "Export failed" }, { status: 500 });
  }
}
