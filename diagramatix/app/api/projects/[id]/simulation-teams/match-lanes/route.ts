/**
 * POST — repair a project's team names to the EXACT lane names.
 *
 * Older simulations (and the "Fill missing" autofill before it was changed)
 * keyed teams by the SLUG of the swim-lane ("loan-assessment-team") rather than
 * the readable lane label ("Loan Assessment Team"). This renames every library
 * team whose name is the slug of a lane in the project to that lane's exact
 * label, AND rewrites the matching sim.teamId on every task/element across the
 * project's diagrams — the two together, so nothing breaks.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

const slugify = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const diagrams = await prisma.diagram.findMany({ where: { projectId: id, type: "bpmn" }, select: { id: true, data: true } });

  // slug → exact lane/pool label (first wins).
  const slugToLabel = new Map<string, string>();
  for (const d of diagrams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const els = ((d.data ?? {}) as any).elements ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const el of els as any[]) {
      if ((el.type === "lane" || el.type === "pool") && typeof el.label === "string" && el.label.trim()) {
        const s = slugify(el.label);
        if (s && !slugToLabel.has(s)) slugToLabel.set(s, el.label);
      }
    }
  }

  // Rename library teams whose name is a lane slug → the exact label.
  const teams = await prisma.simulationTeam.findMany({ where: { projectId: id }, select: { id: true, name: true } });
  const existingNames = new Set(teams.map((t) => t.name));
  const renamed: { from: string; to: string }[] = [];
  for (const t of teams) {
    const label = slugToLabel.get(t.name);
    if (label && label !== t.name && !existingNames.has(label)) {
      await prisma.simulationTeam.update({ where: { id: t.id }, data: { name: label } });
      existingNames.delete(t.name); existingNames.add(label);
      renamed.push({ from: t.name, to: label });
    }
  }

  // Rewrite sim.teamId (slug → label) on every element across the diagrams.
  let diagramsUpdated = 0;
  for (const d of diagrams) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (d.data ?? {}) as any;
    let changed = false;
    for (const el of data.elements ?? []) {
      const tid: unknown = el.properties?.sim?.teamId;
      if (typeof tid === "string" && slugToLabel.has(tid) && slugToLabel.get(tid) !== tid) {
        el.properties.sim.teamId = slugToLabel.get(tid);
        changed = true;
      }
    }
    if (changed) {
      await pgPool.query('UPDATE "Diagram" SET data = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', [JSON.stringify(data), d.id]);
      diagramsUpdated++;
    }
  }

  return NextResponse.json({ renamed, diagramsUpdated });
}
