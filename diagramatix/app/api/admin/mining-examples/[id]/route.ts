/**
 * Admin Mining-Example entry API (SuperAdmin only).
 *
 *   PUT    /api/admin/mining-examples/[id]
 *     Patch metadata (title/concept/description/difficulty/sortOrder),
 *     toggle `published`, or replace the `package` (validated).
 *   DELETE /api/admin/mining-examples/[id]
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { validateMiningExamplePackage } from "@/app/lib/mining/examplePackage";

type Params = { params: Promise<{ id: string }> };
const DIFFICULTIES = new Set(["intro", "core", "advanced"]);

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.miningExample.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {};
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.concept === "string") data.concept = body.concept;
  if (typeof body.description === "string") data.description = body.description;
  if (DIFFICULTIES.has(body.difficulty)) data.difficulty = body.difficulty;
  if (typeof body.sortOrder === "number") data.sortOrder = Math.round(body.sortOrder);
  if (typeof body.published === "boolean") data.published = body.published;
  if (body.package !== undefined) {
    const errs = validateMiningExamplePackage(body.package);
    if (errs.length) return NextResponse.json({ error: `Invalid package: ${errs.join("; ")}` }, { status: 400 });
    data.package = body.package;
  }

  const example = await prisma.miningExample.update({ where: { id }, data });
  return NextResponse.json({ example });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const existing = await prisma.miningExample.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.miningExample.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
