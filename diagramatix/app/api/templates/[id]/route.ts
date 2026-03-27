import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { pgPool, prisma } from "@/app/lib/db";
import { getEffectiveUserId, isImpersonating, SUPERUSER_EMAIL } from "@/app/lib/superuser";

const ADMIN_PASSWORD = "!Aardwolf2026";

type Params = { params: Promise<{ id: string }> };

async function getUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email ?? null;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let userId = session.user.id;
    try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback */ }
    const { id } = await params;
    const result = await pgPool.query(
      `SELECT id, name, "diagramType", "templateType", data, "createdAt"
       FROM "DiagramTemplate"
       WHERE id = $1 AND ("templateType" = 'builtin' OR "userId" = $2)`,
      [id, userId]
    );
    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result.rows[0]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/templates/:id] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ck = await cookies();
    if (isImpersonating(session, ck)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* proceed normally */ }

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, data, adminPassword } = body;

    // Check if this is a builtin template
    const existing = await pgPool.query(
      `SELECT "templateType" FROM "DiagramTemplate" WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isBuiltin = existing.rows[0].templateType === "builtin";

    if (isBuiltin) {
      const userEmail = await getUserEmail(session.user.id);
      if (userEmail !== SUPERUSER_EMAIL && adminPassword !== ADMIN_PASSWORD) {
        return NextResponse.json({ error: "Invalid admin password" }, { status: 403 });
      }
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name?.trim()) { sets.push(`name = $${idx++}`); values.push(name.trim()); }
    if (data) { sets.push(`data = $${idx++}::jsonb`); values.push(JSON.stringify(data)); }

    if (sets.length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    sets.push(`"updatedAt" = $${idx++}`);
    values.push(new Date());
    values.push(id);

    let whereClause: string;
    if (isBuiltin) {
      whereClause = `WHERE id = $${idx++}`;
    } else {
      values.push(session.user.id);
      whereClause = `WHERE id = $${idx++} AND "userId" = $${idx}`;
    }

    const result = await pgPool.query(
      `UPDATE "DiagramTemplate" SET ${sets.join(", ")} ${whereClause}`,
      values
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/templates/:id] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ck = await cookies();
    if (isImpersonating(session, ck)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* proceed normally */ }

  try {
    const { id } = await params;

    // Check if this is a builtin template
    const existing = await pgPool.query(
      `SELECT "templateType" FROM "DiagramTemplate" WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isBuiltin = existing.rows[0].templateType === "builtin";

    if (isBuiltin) {
      const userEmail = await getUserEmail(session.user.id);
      let adminPassword: string | undefined;
      try {
        const body = await req.json();
        adminPassword = body.adminPassword;
      } catch { /* no body */ }
      if (userEmail !== SUPERUSER_EMAIL && adminPassword !== ADMIN_PASSWORD) {
        return NextResponse.json({ error: "Invalid admin password" }, { status: 403 });
      }
    }

    const result = await pgPool.query(
      isBuiltin
        ? `DELETE FROM "DiagramTemplate" WHERE id = $1`
        : `DELETE FROM "DiagramTemplate" WHERE id = $1 AND "userId" = $2`,
      isBuiltin ? [id] : [id, session.user.id]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[DELETE /api/templates/:id] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
