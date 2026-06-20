/**
 * Public Simulation-Example gallery API. Any signed-in user sees the PUBLISHED
 * catalog entries (metadata + a content summary) to browse and adopt. The full
 * package is only loaded at adopt time (Phase 6b), keeping this list light.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { summarizePackage, type ExamplePackage } from "@/app/lib/simulation/examplePackage";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.simulationExample.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
  });
  const examples = rows.map((e) => ({
    id: e.id,
    slug: e.slug,
    title: e.title,
    concept: e.concept,
    description: e.description,
    difficulty: e.difficulty,
    summary: summarizePackage((e.package ?? {}) as unknown as ExamplePackage),
  }));
  return NextResponse.json({ examples });
}
