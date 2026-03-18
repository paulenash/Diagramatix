import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await pgPool.query(
      `SELECT id, name, "diagramType", data, "createdAt"
       FROM "DiagramTemplate"
       WHERE id = $1 AND "userId" = $2`,
      [id, session.user.id]
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
    const { id } = await params;
    const body = await req.json();
    const { name, data } = body;

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
    values.push(session.user.id);

    const result = await pgPool.query(
      `UPDATE "DiagramTemplate" SET ${sets.join(", ")} WHERE id = $${idx++} AND "userId" = $${idx}`,
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

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const result = await pgPool.query(
      `DELETE FROM "DiagramTemplate" WHERE id = $1 AND "userId" = $2`,
      [id, session.user.id]
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
