/**
 * GET — the project's State-Machine diagrams, for the conformance reference
 * picker. With `?runId=…`, the list is SCOPED to that run: only state machines
 * whose states overlap the run's observed states (its own entity's lifecycle),
 * and never the run's own discovered mirror — so an OCEL "Order" run doesn't
 * offer the "Item"/"Invoice" machines, nor itself.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { isRelevantReference, runStates } from "@/app/lib/mining/referenceScope";
import type { Variant } from "@/app/lib/mining/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  const diagrams = await prisma.diagram.findMany({
    where: { projectId: id, type: "state-machine" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, data: true },
  });

  if (!runId) return NextResponse.json({ diagrams: diagrams.map((d) => ({ id: d.id, name: d.name })) });

  // Scope to the run: exclude its own discovered SM + require state overlap.
  const run = await prisma.processMiningRun.findFirst({ where: { id: runId, projectId: id }, select: { variants: true, discoveredSmId: true } });
  const states = run ? runStates((run.variants ?? []) as unknown as Variant[]) : [];
  const scoped = diagrams
    .filter((d) => d.id !== run?.discoveredSmId)
    .filter((d) => {
      const labels = (((d.data as { elements?: { type?: string; label?: string }[] })?.elements) ?? [])
        .filter((e) => e.type === "state").map((e) => e.label ?? "");
      return isRelevantReference(labels, states);
    })
    .map((d) => ({ id: d.id, name: d.name }));
  return NextResponse.json({ diagrams: scoped });
}
