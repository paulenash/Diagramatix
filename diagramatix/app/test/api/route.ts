import { NextResponse } from "next/server";
import pg from "pg";

export async function GET() {
  try {
    const pool = new pg.Pool({
      connectionString: "postgres://postgres:postgres@localhost:5432/diagramatix",
      max: 1,
    });
    const r = await pool.query('SELECT email, name FROM "User"');
    await pool.end();
    return NextResponse.json({ users: r.rows });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
