/**
 * Phase 2 — Apply Layout (Event-driven Process Chain).
 * Takes a (possibly user-edited) AI plan, lightly validates it, runs the
 * deterministic vertical EPC layout engine, and returns a full DiagramData
 * object ready for the canvas. No model call happens here.
 *
 * The diagnostics matter more for EPC than for any other type. An AI plan never
 * passes through `canConnect`, so the rules the editor VETOES while you draw —
 * an event that decides, two functions in a row — can only be caught here, and
 * the layout reports them rather than inventing the missing event. A caller that
 * dropped them would show a broken chain as a clean success.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { layoutEpcDiagram, type AiEpcElement, type AiEpcConnection } from "@/app/lib/diagram/layoutEpc";
import type { LayoutDiagnostic } from "@/app/lib/diagram/bpmnLayout";
import { collectLayoutDiagnostics } from "@/app/lib/diagram/layoutDiagnosticLog";
import { normaliseEpcPlan } from "@/app/lib/ai/planEpc";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { recordDiagramGenerated } from "@/app/lib/ai/aiTelemetry";

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

  // Lightweight validation — the BPMN Zod schema doesn't know EPC types.
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
    elements: plan.elements as AiEpcElement[],
    connections: plan.connections as AiEpcConnection[],
  };
  normaliseEpcPlan(normalised);

  try {
    const diagnostics: LayoutDiagnostic[] = [];
    const diagramData = layoutEpcDiagram(normalised, {
      onDiagnostic: collectLayoutDiagnostics("epc-apply", diagnostics),
    });
    // "# diagrams generated using AI": the Plan-flow diagram is PRODUCED here.
    const orgId = await tryGetCurrentOrgId(session as never, await cookies());
    await recordDiagramGenerated({ userId: session.user.id, orgId, diagramType: "epc", source: "epc-apply" });
    return NextResponse.json({
      diagramData,
      diagnostics,
      elementCount: normalised.elements.length,
      connectionCount: normalised.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Layout failed: ${msg}` }, { status: 500 });
  }
}
