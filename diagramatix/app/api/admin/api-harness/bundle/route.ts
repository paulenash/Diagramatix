/**
 * SuperAdmin — export and import a harness case bundle.
 *
 * A corpus that lives only in the database it was built in is not much of a
 * corpus. As a bundle it can sit in the repo, seed a fresh environment, ride
 * along with a bug report, and eventually be replayed in CI as a
 * generation-quality regression suite.
 *
 * CROSS-ENVIRONMENT IDS ARE USELESS, so `sourceSopId` / `sourceDiagramId` export
 * as LABELS and are re-resolved on import. A bundle carrying a raw id would
 * either dangle or — much worse — resolve to a stranger's diagram and quietly
 * score a round trip against the wrong ground truth.
 */
import { NextResponse } from "next/server";
import { prisma, pgPool } from "@/app/lib/db";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

const BUNDLE_VERSION = 1;

interface BundleCase {
  name: string;
  notes: string | null;
  starred: boolean;
  description: string;
  documentName: string | null;
  documentType: string | null;
  documentBase64: string | null;
  volumetrics: unknown;
  /** Labels, not ids — see the note at the top. */
  sourceSopTitle: string | null;
  sourceDiagramName: string | null;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const id = new URL(req.url).searchParams.get("id")?.trim();
  const rows = await prisma.harnessCase.findMany({
    where: id ? { id } : undefined,
    orderBy: [{ starred: "desc" }, { name: "asc" }],
  });

  // Resolve the ground-truth references to names, once.
  const sopIds = rows.map((r) => r.sourceSopId).filter(Boolean) as string[];
  const diagIds = rows.map((r) => r.sourceDiagramId).filter(Boolean) as string[];
  const [sops, diagrams] = await Promise.all([
    sopIds.length ? prisma.sopDocument.findMany({ where: { id: { in: sopIds } }, select: { id: true, title: true } }) : [],
    diagIds.length ? prisma.diagram.findMany({ where: { id: { in: diagIds } }, select: { id: true, name: true } }) : [],
  ]);
  const sopName = new Map(sops.map((s) => [s.id, s.title]));
  const diagName = new Map(diagrams.map((d) => [d.id, d.name]));

  const cases: BundleCase[] = rows.map((r) => ({
    name: r.name,
    notes: r.notes,
    starred: r.starred,
    description: r.description,
    documentName: r.documentName,
    documentType: r.documentType,
    documentBase64: r.documentBytes ? Buffer.from(r.documentBytes).toString("base64") : null,
    volumetrics: r.volumetrics,
    sourceSopTitle: r.sourceSopId ? sopName.get(r.sourceSopId) ?? null : null,
    sourceDiagramName: r.sourceDiagramId ? diagName.get(r.sourceDiagramId) ?? null : null,
  }));

  const filename = id && cases[0]
    ? `${cases[0].name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.dgxcase.json`
    : "harness-cases.dgxcase.json";

  return new NextResponse(
    JSON.stringify({ version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), cases }, null, 2),
    { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}"` } },
  );
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as { version?: number; cases?: BundleCase[] } | null;
  if (!Array.isArray(body?.cases)) {
    return NextResponse.json({ error: "That does not look like a case bundle." }, { status: 400 });
  }
  if (body.version !== BUNDLE_VERSION) {
    return NextResponse.json(
      { error: `That bundle is version ${body.version ?? "unknown"}; this build reads version ${BUNDLE_VERSION}.` },
      { status: 400 },
    );
  }

  let imported = 0;
  const unresolved: string[] = [];

  for (const c of body.cases) {
    if (!c || typeof c.name !== "string") continue;

    // Re-resolve the ground truth BY NAME in this environment. Falling back to
    // "no ground truth" is the only safe answer — a wrong resolution would score
    // a round trip against a stranger's diagram and report a number that means
    // nothing.
    let sourceDiagramId: string | null = null;
    let sourceSopId: string | null = null;
    if (c.sourceDiagramName) {
      const d = await prisma.diagram.findFirst({ where: { name: c.sourceDiagramName }, select: { id: true } });
      sourceDiagramId = d?.id ?? null;
      if (!d) unresolved.push(`${c.name}: no diagram called "${c.sourceDiagramName}"`);
    }
    if (c.sourceSopTitle) {
      const s = await prisma.sopDocument.findFirst({ where: { title: c.sourceSopTitle }, select: { id: true } });
      sourceSopId = s?.id ?? null;
    }

    const created = await prisma.harnessCase.create({
      data: {
        name: c.name.slice(0, 120),
        notes: c.notes ?? null,
        starred: !!c.starred,
        description: c.description ?? "",
        documentBytes: c.documentBase64 ? new Uint8Array(Buffer.from(c.documentBase64, "base64")) : null,
        documentName: c.documentName ?? null,
        documentType: c.documentType ?? null,
        sourceSopId,
        sourceDiagramId,
        createdById: session.user.id,
      },
      select: { id: true },
    });
    await pgPool.query(`UPDATE "HarnessCase" SET "volumetrics" = $1::jsonb WHERE "id" = $2`,
      [JSON.stringify(c.volumetrics ?? {}), created.id]);
    imported++;
  }

  return NextResponse.json({
    imported,
    // Said out loud, so an import into a fresh environment does not silently
    // produce cases that cannot be scored.
    unresolved,
  });
}
