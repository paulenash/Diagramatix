/**
 * Phase 2 — Apply Layout (Standard Flowchart).
 * Takes a (possibly user-edited) AI plan, lightly validates it, runs the
 * deterministic top-down flowchart layout engine, and returns a full
 * DiagramData object ready for the canvas. No Sonnet call happens here.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { layoutFlowchartDiagram, type AiFcElement, type AiFcConnection } from "@/app/lib/diagram/layoutFlowchart";
import { normaliseFlowchartPlan } from "@/app/lib/ai/planFlowchart";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = (body as { plan?: unknown } | null)?.plan as
    | { elements?: unknown; connections?: unknown }
    | undefined;
  if (plan == null) {
    return NextResponse.json({ error: "Missing 'plan' in request body" }, { status: 400 });
  }

  // Lightweight validation — the BPMN Zod schema doesn't know flowchart types.
  const issues: string[] = [];
  if (!Array.isArray(plan.elements)) issues.push("'elements' must be an array");
  if (!Array.isArray(plan.connections)) issues.push("'connections' must be an array");
  if (issues.length === 0) {
    const els = plan.elements as unknown[];
    const ids = new Set<string>();
    els.forEach((e, i) => {
      const el = e as { id?: unknown; type?: unknown };
      if (typeof el.id !== "string" || !el.id.trim()) issues.push(`element[${i}] missing string id`);
      else if (ids.has(el.id)) issues.push(`duplicate element id "${el.id}"`);
      else ids.add(el.id);
      if (typeof el.type !== "string" || !el.type.trim()) issues.push(`element[${i}] missing string type`);
    });
    (plan.connections as unknown[]).forEach((c, i) => {
      const cn = c as { sourceId?: unknown; targetId?: unknown };
      if (typeof cn.sourceId !== "string" || typeof cn.targetId !== "string") {
        issues.push(`connection[${i}] needs string sourceId and targetId`);
      }
    });
  }
  if (issues.length > 0) {
    return NextResponse.json({ error: "Plan failed validation", issues: issues.slice(0, 10) }, { status: 400 });
  }

  const normalised = {
    elements: plan.elements as AiFcElement[],
    connections: plan.connections as AiFcConnection[],
  };
  normaliseFlowchartPlan(normalised);

  try {
    const diagramData = layoutFlowchartDiagram(normalised);
    return NextResponse.json({
      diagramData,
      elementCount: normalised.elements.length,
      connectionCount: normalised.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Layout failed: ${msg}` }, { status: 500 });
  }
}
