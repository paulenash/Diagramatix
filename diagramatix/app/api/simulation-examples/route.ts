/**
 * Public Simulation-Example gallery API. Any signed-in user sees the PUBLISHED
 * catalog entries (metadata + a content summary) to browse and adopt. The full
 * package is only loaded at adopt time (Phase 6b), keeping this list light.
 */

import { NextResponse } from "next/server";
import { gateFeature } from "@/app/lib/subscription-route";
import { EXAMPLE_ORDER, getExampleAccess, isExampleLocked } from "@/app/lib/features/exampleAccess";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { summarizePackage, type ExamplePackage } from "@/app/lib/simulation/examplePackage";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fg = await gateFeature(session.user.id ?? "", "simulator-examples");
  if (fg) return fg;

  const rows = await prisma.simulationExample.findMany({
    where: { published: true },
    orderBy: EXAMPLE_ORDER,
  });
  // Free / Introductory: only the first N are adoptable; the rest are listed, greyed out (features/exampleAccess.ts).
  const access = await getExampleAccess(session.user.id ?? "");
  const examples = rows.map((e, i) => ({
    locked: isExampleLocked(access, i),
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
