/**
 * PUT /api/diagram-type-styles/sort-order
 *   Body: { order: string[] }   — every editable typeKey exactly once, in the
 *   desired display order. Writes sortOrder = index on each DiagramTypeStyle
 *   row, preserving its current code/colours. Returns the new effective list.
 *
 * Gate: SuperAdmin OR an OrgAdmin (Owner/Admin in their current org). The order
 * is a single global config (like the code/colour identity); the OrgAdmin tile
 * edits the same shared order.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { requireRole } from "@/app/lib/auth/orgContext";
import type { OrgRole } from "@/app/lib/auth/orgRoleType";
import { EDITABLE_DIAGRAM_TYPE_KEYS } from "@/app/lib/diagram/diagramTypeStyles";
import { effectiveDiagramTypeStyles } from "@/app/lib/diagram/diagramTypeStyleServer";

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // SuperAdmin everywhere; otherwise must be Owner/Admin in the current org.
  if (!isSuperuser(session)) {
    try {
      await requireRole(session, await cookies(), ["Owner", "Admin"] as OrgRole[]);
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let body: { order?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const order = body.order;
  const editable = new Set(EDITABLE_DIAGRAM_TYPE_KEYS);
  if (
    !Array.isArray(order) ||
    order.length !== EDITABLE_DIAGRAM_TYPE_KEYS.length ||
    new Set(order).size !== order.length ||
    !order.every((k) => typeof k === "string" && editable.has(k))
  ) {
    return NextResponse.json(
      { error: "order must list every diagram type exactly once" },
      { status: 400 },
    );
  }

  // Preserve each type's current code/colours; only the sortOrder changes.
  const current = await effectiveDiagramTypeStyles();
  const byKey = new Map(current.map((s) => [s.typeKey, s]));
  await prisma.$transaction(
    (order as string[]).map((typeKey, i) => {
      const s = byKey.get(typeKey)!;
      return prisma.diagramTypeStyle.upsert({
        where: { typeKey },
        create: { typeKey, code: s.code, bgColor: s.bgColor, textColor: s.textColor, sortOrder: i },
        update: { sortOrder: i },
      });
    }),
  );

  return NextResponse.json({ styles: await effectiveDiagramTypeStyles() });
}
