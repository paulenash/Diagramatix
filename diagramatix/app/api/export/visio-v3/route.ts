import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import * as fs from "fs";
import * as path from "path";
import { exportVisioV3 } from "@/app/lib/diagram/v3/exportVisioV3";
import { profileByName } from "@/app/lib/diagram/v3/stencilProfile";
import { DEFAULT_SYMBOL_COLORS, BW_SYMBOL_COLORS } from "@/app/lib/diagram/colors";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";

/**
 * GET /api/export/visio-v3?diagramId=<id>
 * V3 Visio export — now the default Visio export wired to the user-facing
 * "Export → Visio" button. V2 endpoint stays in place as a rollback path.
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

  // Subscription cap: individual exports. Free is lifetime; paid tiers are
  // monthly. Bulk exports go through /api/export/visio-v3/bulk and use the
  // separate bulkExports metric.
  const limitBlock = await gateLimit(session.user.id, "individualExports");
  if (limitBlock) return limitBlock;

  try {
    // Profile selects which stencil flavour to emit. `?profile=` accepts
    // "bpmn-m" (default) or "diagramatix-v1.4" / "v1.4" / "v14".
    const profile = profileByName(searchParams.get("profile"));

    // Load the stencil + template files named by the profile.
    const stencilPath = path.join(process.cwd(), "public", profile.stencilFile);
    const stencilBuf = fs.readFileSync(stencilPath);
    const templatePath = path.join(process.cwd(), "public", profile.templateFile);
    const templateBuf = fs.readFileSync(templatePath);

    const data = diagram.data as any;
    const displayMode = (diagram as any).displayMode ?? "normal";

    // Build effective colour config: defaults ← project overrides ← diagram overrides
    const projectColors = ((diagram as any).project?.colorConfig as SymbolColorConfig) ?? {};
    const diagramColors = (data.colorConfig as SymbolColorConfig) ?? {};
    const effectiveColors: SymbolColorConfig = displayMode === "hand-drawn"
      ? BW_SYMBOL_COLORS
      : { ...DEFAULT_SYMBOL_COLORS, ...projectColors, ...diagramColors };

    const result = await exportVisioV3(
      data,
      diagram.name,
      stencilBuf.buffer,
      templateBuf.buffer,
      displayMode,
      effectiveColors,
      profile,
    );

    const suffix =
      profile.name === "diagramatix-v1.6" ? "v1.6"
      : profile.name === "diagramatix-v1.5" ? "v1.5"
      : "V3";
    // Record AFTER the file is generated. Failed exports don't burn a quota.
    await recordUsage(session.user.id, "individualExports");
    return new NextResponse(result as any, {
      headers: {
        "Content-Type": "application/vnd.ms-visio.drawing",
        "Content-Disposition": `attachment; filename="${diagram.name} (${suffix}).vsdx"`,
      },
    });
  } catch (err: any) {
    console.error("Visio export error:", err);
    return NextResponse.json({ error: err.message ?? "Export failed" }, { status: 500 });
  }
}
