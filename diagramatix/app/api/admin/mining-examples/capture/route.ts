/**
 * Capture a project's mining run into a NEW example catalog entry (SuperAdmin).
 * The authoring path: import a log + build the reference SM in a project with
 * the full DiagramatixMINER console, then snapshot the run (mapping + variants +
 * performance) + its reference state machine into a portable package. Created as
 * a DRAFT — edit metadata + publish from the catalog editor.
 *
 * The inverse of adopt; together they give the adopt → modify → capture round-trip.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { captureMiningPackage } from "@/app/lib/mining/captureMiningPackage";

const DIFFICULTIES = new Set(["intro", "core", "advanced"]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "example";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { projectId, runId } = body;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!projectId || !runId) return NextResponse.json({ error: "projectId + runId required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  // The SuperAdmin must still be able to view the source project.
  try {
    await requireProjectAccess(session, await cookies(), projectId, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  let pkg;
  try {
    ({ pkg } = await captureMiningPackage(projectId, runId));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Capture failed";
    return NextResponse.json({ error: msg }, { status: msg.includes("not found") ? 404 : 400 });
  }

  // One catalog copy per example: the slug (derived from the title) is the
  // stable identity. Re-capturing the SAME title OVERWRITES the existing entry
  // (refreshing its content + package), rather than minting a `-2`/`-3`
  // duplicate — its published state + order are preserved.
  const slug = slugify(title);
  const meta = {
    title,
    concept: typeof body.concept === "string" ? body.concept : "",
    description: typeof body.description === "string" ? body.description : "",
    difficulty: DIFFICULTIES.has(body.difficulty) ? body.difficulty : "core",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    package: pkg as any,
  };
  const existing = await prisma.miningExample.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    const example = await prisma.miningExample.update({ where: { id: existing.id }, data: meta });
    return NextResponse.json({ example, overwritten: true });
  }
  const max = await prisma.miningExample.aggregate({ _max: { sortOrder: true } });
  const example = await prisma.miningExample.create({
    data: { slug, ...meta, sortOrder: (max._max.sortOrder ?? 0) + 1, createdById: session?.user?.id ?? null, published: false },
  });
  return NextResponse.json({ example }, { status: 201 });
}
