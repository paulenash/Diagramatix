/**
 * Optional AI "tidy" pass for the deterministic flowchart→BPMN translation.
 * Refines labels / sub-types only; structure is locked by mergeRefinement, so
 * this can never alter the graph. Falls back to the input plan on any failure.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { refineFlowchartBpmnPlan } from "@/app/lib/ai/refineFlowchartBpmn";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { getAiGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;

  const model = await getAiGenerateModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured for the selected model." }, { status: 503 });
  }

  const { elements, connections } = await req.json();
  if (!Array.isArray(elements) || !Array.isArray(connections)) {
    return NextResponse.json({ error: "elements and connections arrays are required" }, { status: 400 });
  }

  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  const result = await refineFlowchartBpmnPlan({ apiKey, elements, connections, model });
  // Only count the attempt when the model actually contributed a refinement.
  if (result.refined) await recordUsage(session.user.id, "aiAttempts");

  return NextResponse.json({
    elements: result.elements,
    connections: result.connections,
    refined: result.refined,
  });
}
