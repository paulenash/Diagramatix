/**
 * Capture a project's simulation into a NEW example catalog entry (SuperAdmin).
 * The authoring path: build a simulation in a project with the full Simulator
 * UI, then snapshot the study + its root diagrams + the team library + the
 * scenarios into a portable ExamplePackage. Created as a DRAFT — edit metadata
 * + publish from the catalog editor.
 *
 * This is the inverse of adopt; together they give the change → copy → extend
 * round-trip (adopt an example, modify it in a project, capture it back as a
 * new example).
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { captureProjectPackage } from "@/app/lib/simulation/captureProject";

const DIFFICULTIES = new Set(["intro", "core", "advanced"]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "example";
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { projectId, studyId } = body;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!projectId || !studyId) return NextResponse.json({ error: "projectId + studyId required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  let pkg;
  try {
    ({ pkg } = await captureProjectPackage(projectId, studyId));
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
  const existing = await prisma.simulationExample.findUnique({ where: { slug }, select: { id: true } });
  if (existing) {
    const example = await prisma.simulationExample.update({ where: { id: existing.id }, data: meta });
    return NextResponse.json({ example, overwritten: true });
  }
  const max = await prisma.simulationExample.aggregate({ _max: { sortOrder: true } });
  const example = await prisma.simulationExample.create({
    data: { slug, ...meta, sortOrder: (max._max.sortOrder ?? 0) + 1, createdById: session?.user?.id ?? null, published: false },
  });
  return NextResponse.json({ example }, { status: 201 });
}
