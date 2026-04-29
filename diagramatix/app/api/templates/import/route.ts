/**
 * Bulk template import — reads a `.diag_tems` payload and creates
 * non-duplicate templates in the destination list.
 *
 *   - type=user (default): imports into the current user's User templates
 *   - type=builtin: imports into the global Built-In templates; admin only
 *
 * Conflict policy: skip duplicates by (name + diagramType) match in the
 * destination list. Returns a summary `{ created, skipped, skippedNames }`.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { isImpersonating } from "@/app/lib/superuser";
import { isSuperuser } from "@/app/lib/superuser";

function cuid() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `c${ts}${rand}`;
}

interface IncomingTemplate {
  name: string;
  diagramType: string;
  data: unknown;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Impersonation is read-only.
  try {
    const cookieStore = await cookies();
    if (isImpersonating(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* ignore — non-critical */ }

  const { searchParams } = new URL(req.url);
  const targetType = searchParams.get("type") === "builtin" ? "builtin" : "user";

  if (targetType === "builtin" && !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = (
    body && typeof body === "object" && Array.isArray((body as { templates?: unknown }).templates)
      ? ((body as { templates: unknown[] }).templates as unknown[])
      : []
  ).filter((t): t is IncomingTemplate =>
    !!t && typeof t === "object"
      && typeof (t as { name?: unknown }).name === "string"
      && typeof (t as { diagramType?: unknown }).diagramType === "string"
  );

  if (incoming.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, skippedNames: [] });
  }

  try {
    // Load existing destination keys (name + diagramType) to detect collisions.
    const existing = targetType === "builtin"
      ? await pgPool.query(
          `SELECT name, "diagramType" FROM "DiagramTemplate" WHERE "templateType" = 'builtin'`
        )
      : await pgPool.query(
          `SELECT name, "diagramType" FROM "DiagramTemplate"
            WHERE "templateType" = 'user' AND "userId" = $1`,
          [session.user.id]
        );
    const existingKeys = new Set<string>(
      existing.rows.map((r: { name: string; diagramType: string }) => `${r.name}|${r.diagramType}`)
    );

    let created = 0;
    const skippedNames: string[] = [];
    for (const t of incoming) {
      const key = `${t.name}|${t.diagramType}`;
      if (existingKeys.has(key)) {
        skippedNames.push(t.name);
        continue;
      }
      const id = cuid();
      const now = new Date();
      await pgPool.query(
        `INSERT INTO "DiagramTemplate"
          (id, name, "diagramType", "templateType", data, "userId", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        [id, t.name, t.diagramType, targetType, JSON.stringify(t.data ?? {}), session.user.id, now, now]
      );
      existingKeys.add(key);
      created++;
    }

    return NextResponse.json({
      created,
      skipped: skippedNames.length,
      skippedNames,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/templates/import] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
