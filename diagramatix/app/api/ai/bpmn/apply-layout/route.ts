/**
 * Phase 2 — Apply Layout.
 * Takes a (possibly user-edited) AI plan, validates it with the shared Zod
 * schema, runs the deterministic BPMN layout engine, and returns a full
 * DiagramData object ready for the canvas. No Sonnet call happens here.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { layoutBpmnPlan } from "@/app/lib/ai/layoutBpmnPlan";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { recordDiagramGenerated } from "@/app/lib/ai/aiTelemetry";
// Diagnostic writer — stderr only (no file I/O) to avoid Windows file-lock
// contention under load.
function trace(line: string) {
  const stamped = `${new Date().toISOString()} ${line}\n`;
  try { process.stderr.write(stamped); } catch { /* ignore */ }
}

export async function POST(req: Request) {
  trace("[apply-layout] request received");
  const session = await auth();
  trace(`[apply-layout] auth done, session=${session?.user?.id ? "ok" : "none"}`);
  if (!session?.user?.id) {
    trace("[apply-layout] unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
    trace("[apply-layout] body parsed");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const plan = (body as { plan?: unknown; promptLabel?: unknown } | null)?.plan;
  const promptLabelRaw = (body as { promptLabel?: unknown } | null)?.promptLabel;
  const promptLabel = typeof promptLabelRaw === "string" && promptLabelRaw.trim().length > 0
    ? promptLabelRaw.trim().slice(0, 100)
    : undefined;
  // Image import "reproduce original layout" — preserve the drawn positions
  // rather than auto-stacking. `imageAspect` keeps the vendor's proportions.
  const preservePositions = (body as { preservePositions?: unknown } | null)?.preservePositions === true;
  const aspectRaw = (body as { imageAspect?: unknown } | null)?.imageAspect as { w?: unknown; h?: unknown } | undefined;
  const imageAspect = aspectRaw && typeof aspectRaw.w === "number" && typeof aspectRaw.h === "number"
    && aspectRaw.w > 0 && aspectRaw.h > 0
    ? { w: aspectRaw.w, h: aspectRaw.h }
    : undefined;
  // EXPERIMENTAL connector scheme — honoured ONLY for a SuperAdmin session, so
  // normal product users always get the standard layout regardless of the flag.
  const mode = ((body as { layoutMode?: unknown } | null)?.layoutMode === "test" && isSuperuser(session))
    ? "test" as const
    : "normal" as const;
  if (plan == null) {
    return NextResponse.json({ error: "Missing 'plan' in request body" }, { status: 400 });
  }

  trace("[apply-layout] validating plan");
  const t0 = Date.now();

  try {
    // Validate → normalise → lay out, shared with the phone's generate job
    // (app/lib/ai/layoutBpmnPlan.ts). The layout's diagnostics come back with
    // the diagram: this is the step that produces it, so the damage shows here.
    const laid = layoutBpmnPlan(plan, { promptLabel, preservePositions, imageAspect, mode });
    if (!laid.ok) {
      trace(`[apply-layout] validation failed: ${JSON.stringify((laid.issues as unknown[] | undefined)?.slice(0, 3))}`);
      return NextResponse.json({ error: "Plan failed validation", issues: laid.issues }, { status: 400 });
    }
    const { diagramData, diagnostics, elementCount, connectionCount } = laid;
    trace(`[apply-layout] ok in ${Date.now() - t0}ms: ${diagramData.elements.length} rendered elements, ${diagramData.connectors.length} connectors`);
    // "# diagrams generated using AI": the Plan-flow diagram is PRODUCED here
    // (Phase 2). No AI call happens at this step, so resolve org directly.
    const orgId = await tryGetCurrentOrgId(session as never, await cookies());
    await recordDiagramGenerated({ userId: session.user.id, orgId, diagramType: "bpmn", source: "bpmn-apply" });
    return NextResponse.json({
      diagramData,
      elementCount,
      connectionCount,
      diagnostics,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace(`[apply-layout] ERROR after ${Date.now() - t0}ms: ${msg}`);
    return NextResponse.json({ error: `Layout failed: ${msg}` }, { status: 500 });
  }
}
