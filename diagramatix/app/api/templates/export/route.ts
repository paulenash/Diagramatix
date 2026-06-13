/**
 * Bulk template export — produces a `.diag_tems` JSON payload containing
 * every template of the requested kind:
 *   - type=user (default): every template owned by the current user with
 *     templateType="user"
 *   - type=builtin: every template with templateType="builtin"; admin only
 *
 * Admin authorisation reuses the SUPERUSER_EMAILS allow-list — no
 * password gate is needed because the user is already authenticated.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import { streamBackup } from "@/app/lib/backupStream";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") === "builtin" ? "builtin" : "user";

  if (type === "builtin" && !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = session.user.id;
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `diagramatix-templates-${type}-${dateStr}.diag_tems`;
  const progressLabel = type === "builtin" ? "Built-in Templates" : "Templates";

  async function buildPayloadBytes(onProgress?: (label: string, count: number) => void): Promise<Uint8Array> {
    const result = type === "builtin"
      ? await pgPool.query(
          `SELECT name, "diagramType", "group", data
             FROM "DiagramTemplate"
            WHERE "templateType" = 'builtin'
            ORDER BY COALESCE("group", '~'), "createdAt" ASC`
        )
      : await pgPool.query(
          `SELECT name, "diagramType", "group", data
             FROM "DiagramTemplate"
            WHERE "templateType" = 'user' AND "userId" = $1
            ORDER BY COALESCE("group", '~'), "createdAt" ASC`,
          [userId]
        );
    onProgress?.(progressLabel, result.rows.length);

    const payload = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      templateType: type,
      // Templates are ordered by group (NULLs last via the '~' COALESCE
      // sort key — '~' sorts after any printable ASCII so ungrouped
      // entries land at the bottom of the file). The `group` field
      // (string or null) round-trips into the import.
      templates: result.rows.map(
        (r: { name: string; diagramType: string; group: string | null; data: unknown }) => ({
          name: r.name,
          diagramType: r.diagramType,
          group: r.group,
          data: r.data,
        }),
      ),
    };
    return new TextEncoder().encode(JSON.stringify(payload, null, 2));
  }

  // ?stream=1 → live NDJSON progress + report; plain GET returns the JSON.
  if (searchParams.get("stream") === "1") {
    return streamBackup((onProgress) => buildPayloadBytes(onProgress), filename);
  }

  try {
    const bytes = await buildPayloadBytes();
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/templates/export] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
