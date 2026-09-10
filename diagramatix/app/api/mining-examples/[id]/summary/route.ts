/**
 * GET — what one published Diagramatix Miner example illustrates.
 *
 * Split from the gallery list on purpose. That list's own docblock says the
 * full package is loaded only at adopt time, "keeping this list light", and the
 * measured half of a feature summary means MINING the example's sample log —
 * seven examples' worth of that on every gallery render, to render nothing
 * anybody has asked to see yet.
 *
 * So the summary is per-example and on demand: opening one pays for one.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { gateFeature } from "@/app/lib/subscription-route";
import { minerExampleFeatures } from "@/app/lib/mining/exampleFeatures";
import type { MiningExamplePackage } from "@/app/lib/mining/examplePackage";
import type { ExampleSummary } from "@/app/lib/exampleFeature";
import { renderHelpMarkdown } from "@/app/lib/help/renderMarkdown";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // The same gate the list carries. A summary is catalog content, and hiding a
  // door is not locking it.
  const fg = await gateFeature(session.user.id ?? "", "process-mining-examples");
  if (fg) return fg;

  const { id } = await params;
  const row = await prisma.miningExample.findFirst({ where: { id, published: true } });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const groups = minerExampleFeatures((row.package ?? {}) as unknown as MiningExamplePackage);
  const summary: ExampleSummary = {
    title: row.title,
    concept: row.concept,
    descriptionHtml: renderHelpMarkdown(row.description ?? ""),
    difficulty: row.difficulty,
    groups,
    // An admin-authored example can legitimately carry nothing recognisable.
    // An empty list with no explanation reads as a broken screen.
    note: groups.length === 0
      ? "This example carries no reference model, no resource column and no extra dimensions, so there is nothing specific to point at — load it and mine the log to see what it holds."
      : undefined,
  };
  return NextResponse.json(summary);
}
