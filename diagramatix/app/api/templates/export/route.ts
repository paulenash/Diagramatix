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

  try {
    const result = type === "builtin"
      ? await pgPool.query(
          `SELECT name, "diagramType", data
             FROM "DiagramTemplate"
            WHERE "templateType" = 'builtin'
            ORDER BY "createdAt" ASC`
        )
      : await pgPool.query(
          `SELECT name, "diagramType", data
             FROM "DiagramTemplate"
            WHERE "templateType" = 'user' AND "userId" = $1
            ORDER BY "createdAt" ASC`,
          [session.user.id]
        );

    const payload = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      templateType: type,
      templates: result.rows.map((r: { name: string; diagramType: string; data: unknown }) => ({
        name: r.name,
        diagramType: r.diagramType,
        data: r.data,
      })),
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `diagramatix-templates-${type}-${dateStr}.diag_tems`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
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
