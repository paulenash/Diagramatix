/**
 * SuperAdmin — the harness case library.
 *
 * A case is a saved test INPUT: description, document, volumetrics. It is our
 * own material, so unlike a partner's document it persists indefinitely and is
 * untouched by the retention sweep. That distinction is the whole reason this is
 * a separate table rather than a flag on PartnerJob.
 *
 * The point of a case is that it can be re-submitted: change the master prompt
 * or the model, run the same input again, compare. That is what turns "look at
 * the output" into a measurement.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** The list never carries document bytes — a library of twenty SOPs would be
 *  megabytes of base64 on every page load. */
const LIST_SELECT = {
  id: true, name: true, notes: true, starred: true, description: true,
  documentName: true, documentType: true, volumetrics: true,
  sourceSopId: true, sourceDiagramId: true,
  runCount: true, lastRunAt: true, createdAt: true, updatedAt: true,
} as const;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (id) {
    const c = await prisma.harnessCase.findUnique({ where: { id } });
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // The single-case read DOES carry the document, because loading a case into
    // the form is exactly when it is needed.
    return NextResponse.json({
      case: {
        ...c,
        documentBytes: undefined,
        documentBase64: c.documentBytes ? Buffer.from(c.documentBytes).toString("base64") : null,
      },
    });
  }

  const cases = await prisma.harnessCase.findMany({
    select: { ...LIST_SELECT },
    orderBy: [{ starred: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({
    cases: cases.map((c) => ({
      ...c,
      // Enough to recognise it in a list without shipping the file.
      hasDocument: !!c.documentName,
      description: c.description.slice(0, 240),
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as {
    name?: string; notes?: string; description?: string;
    documentBase64?: string | null; documentName?: string | null; documentType?: string | null;
    volumetrics?: unknown; sourceSopId?: string | null; sourceDiagramId?: string | null;
  } | null;

  const description = (body?.description ?? "").trim();
  const hasDoc = !!body?.documentBase64;
  if (!description && !hasDoc) {
    return NextResponse.json({ error: "A case needs a description, a document, or both." }, { status: 400 });
  }

  // Name it from the description when nothing better was given, so the library
  // is browsable without anyone having to think of titles.
  const name = (body?.name ?? "").trim()
    || (description.split(/\s+/).slice(0, 7).join(" ") || body?.documentName || "Untitled case").slice(0, 90);

  const created = await prisma.harnessCase.create({
    data: {
      name,
      notes: body?.notes?.trim() || null,
      description,
      documentBytes: body?.documentBase64 ? new Uint8Array(Buffer.from(body.documentBase64, "base64")) : null,
      documentName: body?.documentName ?? null,
      documentType: body?.documentType ?? null,
      sourceSopId: body?.sourceSopId ?? null,
      sourceDiagramId: body?.sourceDiagramId ?? null,
      createdById: session.user.id,
    },
    select: { id: true },
  });
  // Prisma 7 omits Json from the create input — the house rule.
  await pgPool.query(`UPDATE "HarnessCase" SET "volumetrics" = $1::jsonb WHERE "id" = $2`,
    [JSON.stringify(body?.volumetrics ?? {}), created.id]);

  return NextResponse.json({ id: created.id, name });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as
    | { id?: string; name?: string; notes?: string; starred?: boolean }
    | null;
  const id = body?.id?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await prisma.harnessCase.update({
    where: { id },
    data: {
      ...(typeof body?.name === "string" ? { name: body.name.trim().slice(0, 120) } : {}),
      ...(typeof body?.notes === "string" ? { notes: body.notes.trim() || null } : {}),
      ...(typeof body?.starred === "boolean" ? { starred: body.starred } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await prisma.harnessCase.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
