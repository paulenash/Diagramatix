import { NextResponse } from "next/server";
import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { prisma } from "@/app/lib/db";
import { getRiskControl } from "@/app/lib/diagram/riskControl";
import type { DiagramData } from "@/app/lib/diagram/types";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/risk-controls/attachments
 * For each catalog item id, the process steps it is attached to across the
 * project's diagrams — "<Diagram> — <Step>" strings. Powers the "on:" list in the
 * Risk & Control screen (the reverse of the on-model attachment; same scan the
 * .xlsx Audit Grid uses).
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "view", false); if (g.error) return g.error;

  const diagrams = await prisma.diagram.findMany({ where: { projectId: id }, select: { name: true, data: true } });
  const attachments: Record<string, string[]> = {};
  for (const d of diagrams) {
    const data = (d.data ?? {}) as unknown as DiagramData;
    for (const el of data.elements ?? []) {
      const rc = getRiskControl(el);
      const activity = el.label || el.type;
      for (const ref of [...(rc.riskRefs ?? []), ...(rc.controlRefs ?? [])]) {
        (attachments[ref.itemId] ??= []).push(`${d.name} — ${activity}`);
      }
    }
  }
  return NextResponse.json({ attachments });
}
