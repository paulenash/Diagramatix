import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

/** GET — return database schema (tables, columns, types) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Get all tables
    const tables = await pgPool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    // Get columns for each table
    const schema: Record<string, { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]> = {};
    for (const t of tables.rows) {
      const cols = await pgPool.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [t.table_name]);
      schema[t.table_name] = cols.rows;
    }

    // Get row counts
    const counts: Record<string, number> = {};
    for (const t of tables.rows) {
      const c = await pgPool.query(`SELECT count(*)::int as c FROM "${t.table_name}"`);
      counts[t.table_name] = c.rows[0].c;
    }

    return NextResponse.json({ schema, counts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — execute arbitrary SQL (superuser only) */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { sql, params } = (await req.json()) as { sql?: string; params?: unknown[] };
  if (!sql?.trim()) {
    return NextResponse.json({ error: "SQL query required" }, { status: 400 });
  }

  try {
    const start = Date.now();
    const result = params?.length ? await pgPool.query(sql, params) : await pgPool.query(sql);
    const duration = Date.now() - start;

    return NextResponse.json({
      rows: result.rows ?? [],
      rowCount: result.rowCount ?? 0,
      fields: (result.fields ?? []).map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
      command: result.command,
      duration,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
