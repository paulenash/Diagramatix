/**
 * SuperAdmin — Diagram-JSON schema-validation findings (from the parallel Zod
 * validator). GET lists unresolved issues (deduped, newest first). POST resolves
 * one ({ action:"resolve", id }) or clears all ({ action:"clear" }).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

async function guard() {
  const s = await auth();
  return !!s?.user?.id && isSuperuser(s);
}

export async function GET() {
  if (!(await guard())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [issues, total] = await Promise.all([
    prisma.schemaValidationIssue.findMany({ where: { resolved: false }, orderBy: { lastSeen: "desc" }, take: 500 }),
    prisma.schemaValidationIssue.count({ where: { resolved: false } }),
  ]);
  return NextResponse.json({ issues, total });
}

export async function POST(req: Request) {
  if (!(await guard())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  if (body.action === "resolve" && typeof body.id === "string") {
    await prisma.schemaValidationIssue.update({ where: { id: body.id }, data: { resolved: true } }).catch(() => {});
  } else if (body.action === "clear") {
    await prisma.schemaValidationIssue.updateMany({ where: { resolved: false }, data: { resolved: true } });
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
