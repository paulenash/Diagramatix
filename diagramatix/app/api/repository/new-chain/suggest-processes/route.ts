import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateLimit, recordUsage } from "@/app/lib/subscription-route";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveOrgModel } from "@/app/lib/ai/orgModels";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { requireNewChainAccess } from "@/app/lib/valueChain/newChainAccess";
import { suggestProcesses, modelComplete } from "@/app/lib/valueChain/chainNarrativeAi";
import { MAX_NARRATIVE_CHARS, MIN_NARRATIVE_CHARS } from "@/app/lib/valueChain/chainNarrative";

/**
 * POST { title, generalNarrative } — "Suggest processes": 5–12 process names (with a one-line scope each) drawn from the author's
 * description, for them to edit. Create a New Value Chain, step 2. Costs one AI attempt, and only when it produces a usable list.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await auth();
  const access = await requireNewChainAccess(session);
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as { title?: unknown; generalNarrative?: unknown } | null;
  const title = String(body?.title ?? "").replace(/\s+/g, " ").trim();
  const generalNarrative = String(body?.generalNarrative ?? "").trim();
  if (!title) return NextResponse.json({ error: "Give the value chain a name first." }, { status: 400 });
  if (generalNarrative.length < MIN_NARRATIVE_CHARS) return NextResponse.json({ error: "Describe the value chain in a few sentences first." }, { status: 400 });
  if (generalNarrative.length > MAX_NARRATIVE_CHARS) return NextResponse.json({ error: "The description is too long." }, { status: 400 });

  const blocked = await gateLimit(access.userId, "aiAttempts");
  if (blocked) return blocked;
  const model = await resolveOrgModel();
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI is not configured." }, { status: 503 });
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.DiagramGenerate));

  const processes = await suggestProcesses({ title, generalNarrative, complete: modelComplete(apiKey, model) });
  if (!processes) return NextResponse.json({ error: "No usable list came back — write your own list of processes, or try again." }, { status: 422 });
  if (!access.isSuper) await recordUsage(access.userId, "aiAttempts");
  return NextResponse.json({ processes });
}
