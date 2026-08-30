/**
 * SuperAdmin — SOPs available as harness inputs, and the round-trip score.
 *
 * `GET`  lists SOPs across every project, which is the one thing the existing
 *        SOP routes cannot do: `/api/projects/:id/sop` is project-scoped, and a
 *        harness that made you pick a project first would be tedious for no
 *        reason. Each row carries the diagram it came from — the ground truth.
 * `GET ?id=`  returns the SOP as TEXT, ready to send as a `text` attachment.
 *        Cheapest honest path: exporting to .docx and back through LibreOffice
 *        tests our own exporter rather than the API, and costs a soffice spawn.
 * `POST` scores a produced diagram against an SOP's source diagram.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { scoreRoundTrip } from "@/app/lib/partner/roundTrip";
import type { DiagramData } from "@/app/lib/diagram/types";

export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const id = new URL(req.url).searchParams.get("id")?.trim();

  if (id) {
    const doc = await prisma.sopDocument.findUnique({
      where: { id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // The sections' prose, as a document would read. The figure images are
    // dropped: they are pictures OF the diagram we are trying to rebuild, and
    // feeding one back would be testing the vision path, not the SOP path.
    const text = [
      doc.title,
      ...doc.sections.map((s) => `\n## ${s.heading}\n\n${s.bodyMarkdown ?? ""}`),
    ].join("\n").trim();

    return NextResponse.json({
      sop: {
        id: doc.id, title: doc.title, diagramId: doc.diagramId,
        scope: doc.scope, scopeLabel: doc.scopeLabel,
        text,
      },
    });
  }

  const docs = await prisma.sopDocument.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true, title: true, status: true, scope: true, scopeLabel: true,
      diagramId: true, generatedAt: true, updatedAt: true,
      diagram: { select: { name: true } },
      project: { select: { name: true } },
    },
  });
  return NextResponse.json({
    sops: docs.map((d) => ({
      id: d.id, title: d.title, status: d.status, scope: d.scope, scopeLabel: d.scopeLabel,
      diagramId: d.diagramId, diagramName: d.diagram?.name ?? null,
      projectName: d.project?.name ?? null,
      updatedAt: d.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as
    | { sourceDiagramId?: string; resultDiagramId?: string }
    | null;
  const sourceId = body?.sourceDiagramId?.trim();
  const resultId = body?.resultDiagramId?.trim();
  if (!sourceId || !resultId) {
    return NextResponse.json({ error: "sourceDiagramId and resultDiagramId are required" }, { status: 400 });
  }

  const [source, result] = await Promise.all([
    prisma.diagram.findUnique({ where: { id: sourceId }, select: { name: true, data: true } }),
    prisma.diagram.findUnique({ where: { id: resultId }, select: { name: true, data: true } }),
  ]);
  if (!source || !result) return NextResponse.json({ error: "One of those diagrams no longer exists" }, { status: 404 });

  const score = scoreRoundTrip(
    source.data as unknown as DiagramData,
    result.data as unknown as DiagramData,
  );
  return NextResponse.json({
    source: { id: sourceId, name: source.name },
    result: { id: resultId, name: result.name },
    ...score,
    // Stated with the number, because it decides how to read it.
    caveat: "Activities are matched on a normalised label, so a renamed step counts as one lost and one invented. The score under-reports success rather than flattering it.",
  });
}
