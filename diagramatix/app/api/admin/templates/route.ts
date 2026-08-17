/**
 * SuperAdmin — list EVERY diagram template (built-in + all users') with owner
 * info, for the Template Management page. Read-only; edits/deletes go through the
 * existing /api/templates/[id] routes (which already grant SuperAdmin access to
 * built-ins) and single-thumbnail regen through regenerate-thumbnails.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/app/lib/apiError";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const rows = (await pgPool.query(
      `SELECT t.id, t.name, t."diagramType", t."templateType", t."group",
              t.description, t."thumbnailSvg", t."updatedAt",
              u.email AS "ownerEmail",
              EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(t.data->'elements', '[]'::jsonb)) e) AS "hasElements"
       FROM "DiagramTemplate" t
       LEFT JOIN "User" u ON u.id = t."userId"
       ORDER BY t."templateType", t."diagramType", COALESCE(t."group", ''), t.name`
    )).rows;
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[GET /api/admin/templates] error:", err instanceof Error ? err.message : String(err));
    return serverError(err);
  }
}
