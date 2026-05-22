import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";
import * as fs from "fs";
import * as path from "path";
import { exportVisioV3Bulk } from "@/app/lib/diagram/v3/exportVisioV3Bulk";
import { profileByName } from "@/app/lib/diagram/v3/stencilProfile";
import {
  DEFAULT_SYMBOL_COLORS,
  BW_SYMBOL_COLORS,
} from "@/app/lib/diagram/colors";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";

/**
 * GET /api/export/visio-v3/bulk?projectId=<id>[&profile=v1.6]
 *
 * Exports every BPMN diagram in the project as one multi-page .vsdx —
 * pages ordered alphabetically by diagram name (case-insensitive). Default
 * profile is v1.5 (the modified stencil); pass profile=bpmn-m to override.
 * Non-BPMN diagrams are silently skipped (Visio export is BPMN-only).
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback to session */ }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, orgId },
    include: {
      diagrams: {
        select: {
          id: true, name: true, type: true, data: true,
          displayMode: true, colorConfig: true,
        },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const bpmnDiagrams = project.diagrams
    .filter((d) => d.type === "bpmn")
    .sort((a, b) =>
      new Intl.Collator(undefined, { sensitivity: "base", numeric: true })
        .compare(a.name, b.name),
    );

  if (bpmnDiagrams.length === 0) {
    return NextResponse.json(
      { error: "No BPMN diagrams to export in this project" },
      { status: 400 },
    );
  }

  // Subscription cap: bulk exports. Always monthly for tiers that allow
  // them (Free has bulkExports=0 so this always blocks for Free users).
  const limitBlock = await gateLimit(session.user.id, "bulkExports");
  if (limitBlock) return limitBlock;

  try {
    // v1.6 default for bulk — fresh GUIDs avoid the v1.4/v1.5 stencil
    // resolver collision in Visio. Caller can still pass ?profile=v1.5
    // (legacy) or ?profile=bpmn-m to override.
    const profile = profileByName(searchParams.get("profile") ?? "v1.6");

    const stencilPath = path.join(process.cwd(), "public", profile.stencilFile);
    const stencilBuf = fs.readFileSync(stencilPath);
    const templatePath = path.join(process.cwd(), "public", profile.templateFile);
    const templateBuf = fs.readFileSync(templatePath);

    const projectColors =
      ((project as unknown as { colorConfig?: SymbolColorConfig }).colorConfig) ?? {};

    const bulkInputs = bpmnDiagrams.map((d) => {
      const data = d.data as unknown as Record<string, unknown>;
      const diagramColors = (data.colorConfig as SymbolColorConfig | undefined) ?? {};
      const displayMode =
        (d as unknown as { displayMode?: string | null }).displayMode ?? "normal";
      const effectiveColors: SymbolColorConfig =
        displayMode === "hand-drawn"
          ? BW_SYMBOL_COLORS
          : { ...DEFAULT_SYMBOL_COLORS, ...projectColors, ...diagramColors };
      return {
        data: data as unknown as Parameters<typeof exportVisioV3Bulk>[0][number]["data"],
        name: d.name,
        colorConfig: effectiveColors,
        displayMode,
      };
    });

    const result = await exportVisioV3Bulk(
      bulkInputs,
      stencilBuf.buffer as ArrayBuffer,
      templateBuf.buffer as ArrayBuffer,
      profile,
      project.name,
    );

    const suffix = profile.name === "diagramatix-v1.5" ? "v1.5" : "V3";
    // Strip filename-invalid chars (Windows + macOS): \ / : * ? " < > |
    const safeName = project.name.replace(/[\\/:*?"<>|]/g, "_").trim() || "Project";
    // Record AFTER the file is built. Failed exports don't burn the quota.
    await recordUsage(session.user.id, "bulkExports");
    return new NextResponse(result as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.ms-visio.drawing",
        "Content-Disposition": `attachment; filename="${safeName} (${suffix}).vsdx"`,
      },
    });
  } catch (err: unknown) {
    console.error("Visio bulk export error:", err);
    const msg = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
