/**
 * Admin Feature catalog API.
 *
 *   GET  /api/admin/features
 *     Returns every Feature row (draft + published fields). Sorted by
 *     draft sortOrder so the editor reflects the admin's working order.
 *
 *   PUT  /api/admin/features
 *     Body: { features: Array<{ id?, name, summary, details, hidden, sortOrder }> }
 *     Upserts each row by id. Rows without id are inserted as new
 *     features (in `draft` state — publishedAt stays null until
 *     someone hits /publish). Rows present in the DB but missing
 *     from the payload are DELETED — so the admin editor can remove
 *     features by removing the row.
 *
 * Both endpoints are gated by isSuperuser. Returns 403 otherwise.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

interface FeatureInput {
  id?: string;
  name: string;
  summary: string;
  details: string;
  hidden?: boolean;
  sortOrder: number;
}

export async function GET() {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const features = await prisma.feature.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ features });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { features?: FeatureInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.features) ? body.features : null;
  if (!incoming) {
    return NextResponse.json({ error: "Missing features array" }, { status: 400 });
  }

  // Validate basic shape before touching the DB.
  for (const f of incoming) {
    if (typeof f.name !== "string" || !f.name.trim()) {
      return NextResponse.json(
        { error: "Each feature needs a non-empty name" },
        { status: 400 },
      );
    }
    if (typeof f.sortOrder !== "number" || !Number.isFinite(f.sortOrder)) {
      return NextResponse.json(
        { error: `Feature "${f.name}" missing valid sortOrder` },
        { status: 400 },
      );
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.feature.findMany({ select: { id: true } });
    const existingIds = new Set(existing.map((e) => e.id));
    const incomingIds = new Set(incoming.filter((f) => f.id).map((f) => f.id!));

    // Delete rows that the editor removed.
    const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
    if (toDelete.length > 0) {
      await tx.feature.deleteMany({ where: { id: { in: toDelete } } });
    }

    // Upsert each incoming row.
    const saved = [];
    for (const f of incoming) {
      if (f.id && existingIds.has(f.id)) {
        const row = await tx.feature.update({
          where: { id: f.id },
          data: {
            name: f.name,
            summary: f.summary,
            details: f.details,
            hidden: f.hidden ?? false,
            sortOrder: f.sortOrder,
          },
        });
        saved.push(row);
      } else {
        const row = await tx.feature.create({
          data: {
            name: f.name,
            summary: f.summary,
            details: f.details,
            hidden: f.hidden ?? false,
            sortOrder: f.sortOrder,
          },
        });
        saved.push(row);
      }
    }
    return saved;
  });

  return NextResponse.json({ features: result });
}
