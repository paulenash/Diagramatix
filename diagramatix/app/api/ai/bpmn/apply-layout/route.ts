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

  const plan = (body as { plan?: unknown } | null)?.plan;
  if (plan == null) {
    return NextResponse.json({ error: "Missing 'plan' in request body" }, { status: 400 });
  }

  const result = validatePlan(plan);
  if (!result.ok) {
    return NextResponse.json({ error: "Plan failed validation", issues: result.issues }, { status: 400 });
  }

  // Defence-in-depth: run the same normaliser the Sonnet path uses so any
  // camelCase-typed plan hand-edited in the JSON view still lays out correctly.
  const normalised = {
    elements: result.plan.elements as unknown as AiElement[],
    connections: result.plan.connections as unknown as AiConnection[],
  };
  normaliseAiPlan(normalised);

  try {
    const diagramData = layoutBpmnDiagram(normalised.elements, normalised.connections);
    return NextResponse.json({
      diagramData,
      elementCount: normalised.elements.length,
      connectionCount: normalised.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI apply-layout] layout error:", msg);
    return NextResponse.json({ error: `Layout failed: ${msg}` }, { status: 500 });
  }
}
