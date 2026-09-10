/**
 * GET — what one published Simulator example illustrates.
 *
 * Mirrors the Miner's summary route. Per-example and on demand rather than
 * folded into the gallery list, so the list stays as light as its docblock
 * promises and only an opened summary costs anything.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { simulatorExampleFeatures } from "@/app/lib/simulation/exampleFeatures";
import type { ExamplePackage } from "@/app/lib/simulation/examplePackage";
import type { ExampleSummary } from "@/app/lib/exampleFeature";
import { renderHelpMarkdown } from "@/app/lib/help/renderMarkdown";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const row = await prisma.simulationExample.findFirst({ where: { id, published: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const groups = simulatorExampleFeatures((row.package ?? {}) as unknown as ExamplePackage);
  const summary: ExampleSummary = {
    title: row.title,
    concept: row.concept,
    descriptionHtml: renderHelpMarkdown(row.description ?? ""),
    difficulty: row.difficulty,
    groups,
    note: groups.length === 0
      ? "This example carries no teams, calendars or alternative scenarios, so there is nothing specific to point at — load it and open the Simulator to see what it holds."
      : undefined,
  };
  return NextResponse.json(summary);
}
