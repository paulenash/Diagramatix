/**
 * Phase 2 — Apply Layout.
 * Takes a (possibly user-edited) AI plan, validates it with the shared Zod
 * schema, runs the deterministic BPMN layout engine, and returns a full
 * DiagramData object ready for the canvas. No Sonnet call happens here.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { validatePlan } from "@/app/lib/ai/planSchema";
import { normaliseAiPlan } from "@/app/lib/ai/planBpmn";
import { isSuperuser } from "@/app/lib/superuser";
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
  const result = validatePlan(plan);
  if (!result.ok) {
    trace(`[apply-layout] validation failed: ${JSON.stringify(result.issues?.slice(0, 3))}`);
    return NextResponse.json({ error: "Plan failed validation", issues: result.issues }, { status: 400 });
  }

  trace("[apply-layout] normalising");
  // Defence-in-depth: run the same normaliser the Sonnet path uses so any
  // camelCase-typed plan hand-edited in the JSON view still lays out correctly.
  const normalised = {
    elements: result.plan.elements as unknown as AiElement[],
    connections: result.plan.connections as unknown as AiConnection[],
  };
  normaliseAiPlan(normalised);

  trace(`[apply-layout] validated: ${normalised.elements.length} elements, ${normalised.connections.length} connections`);
  const t0 = Date.now();

  try {
    const diagramData = layoutBpmnDiagram(normalised.elements, normalised.connections,
      { promptLabel, preservePositions, imageAspect, mode });
    trace(`[apply-layout] ok in ${Date.now() - t0}ms: ${diagramData.elements.length} rendered elements, ${diagramData.connectors.length} connectors`);
    return NextResponse.json({
      diagramData,
      elementCount: normalised.elements.length,
      connectionCount: normalised.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    trace(`[apply-layout] ERROR after ${Date.now() - t0}ms: ${msg}`);
    return NextResponse.json({ error: `Layout failed: ${msg}` }, { status: 500 });
  }
}
