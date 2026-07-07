import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { pgPool } from "@/app/lib/db";
import { buildPhysicalDdl } from "@/app/lib/diagram/physicalDdl";

/**
 * GET /api/admin/physical-ddl
 * The PHYSICAL DDL of the live Diagramatix PostgreSQL database — introspected
 * from the catalog (real tables, native types, enums, constraints, indexes).
 * SuperAdmin only. Returned as a downloadable .sql file.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const ddl = await buildPhysicalDdl((sql) => pgPool.query(sql));
    return new NextResponse(ddl, {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="diagramatix-physical-ddl-PostgreSQL.sql"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/admin/physical-ddl]", message);
    return NextResponse.json({ error: `Failed to generate physical DDL: ${message}` }, { status: 500 });
  }
}
