import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import * as fs from "fs";
import * as path from "path";
import { exportVisioV2 } from "@/app/lib/diagram/v2/exportVisioV2";

/**
 * GET /api/export/visio-v2?diagramId=<id>
 * V2 Visio export using BPMN_M masters with property overrides.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const diagramId = searchParams.get("diagramId");
  if (!diagramId) return NextResponse.json({ error: "diagramId required" }, { status: 400 });

  const diagram = await prisma.diagram.findUnique({ where: { id: diagramId } });
  if (!diagram) return NextResponse.json({ error: "Diagram not found" }, { status: 404 });

  try {
    // Load BPMN_M stencil (has all masters) + template (has document.xml/theme for rendering)
    const stencilPath = path.join(process.cwd(), "public", "bpmn-stencil-v2.vssx");
    const stencilBuf = fs.readFileSync(stencilPath);
    const templatePath = path.join(process.cwd(), "public", "bpmn-template-v2.vsdx");
    const templateBuf = fs.readFileSync(templatePath);

    const data = diagram.data as any;
    console.log("[visio-v2] Elements:", data.elements?.length, "Connectors:", data.connectors?.length);
    const result = await exportVisioV2(data, diagram.name, stencilBuf.buffer, templateBuf.buffer);
    console.log("[visio-v2] Output size:", result.length, "bytes");

    return new NextResponse(result as any, {
      headers: {
        "Content-Type": "application/vnd.ms-visio.drawing",
        "Content-Disposition": `attachment; filename="${diagram.name} (V2).vsdx"`,
      },
    });
  } catch (err: any) {
    console.error("[visio-v2] Export error:", err);
    return NextResponse.json({ error: err.message ?? "Export failed" }, { status: 500 });
  }
}
