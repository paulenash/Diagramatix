/**
 * Phase 1 — Plan (Event-driven Process Chain).
 * Sends the user prompt + ONLY the green (AI-enforceable) rules to the model and
 * returns the normalised JSON plan. No layout work happens here — the client
 * can edit the plan and pass it to POST /api/ai/epc/apply-layout.
 */
import { NextResponse } from "next/server";
import { describeAiError } from "@/app/lib/ai/aiErrors";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { prisma } from "@/app/lib/db";
import { planEpc } from "@/app/lib/ai/planEpc";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { chooseModel } from "@/app/lib/ai/modelAccess";
import { isSuperuser } from "@/app/lib/superuser";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveUserAiKey, listUserAiKeys } from "@/app/lib/ai/userAiKey";
import { enterUserAiKey } from "@/app/lib/ai/aiKeyContext";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS, enterAiContext } from "@/app/lib/ai/aiTelemetry";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const _pol = await gateOrgPolicy(session, "allowAi");
  if (_pol) return _pol;
  enterAiContext(await resolveAiRouteContext(session, AI_INVOCATION_POINTS.EpcPlan));

  const { prompt, attachment, model: requestedModel } = await req.json();
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  // Image input uses the Vision-model override when set; else the main model. A
  // caller may override with a cost-gated model (SuperAdmin → any); disallowed → default.
  const defaultModel = await resolveGenerateModel(attachment?.type === "image");
  // Models the caller's OWN key unlocks count as available to them. The
  // picker offers those, so rejecting one here would swap it for the
  // default and generate something nobody asked for, without saying so.
  let byoProviders = new Set<string>();
  try {
    byoProviders = new Set((await listUserAiKeys(session.user.id)).map((k) => k.provider));
  } catch { /* no own keys is the normal case */ }
  const selectedModel = chooseModel(requestedModel, defaultModel, isSuperuser(session), byoProviders);
  // The caller's OWN key wins when they have supplied one for this
  // provider — otherwise somebody who set one up is still billed to the
  // deployment, which is a failure with no symptom at all.
  const ownKey = await resolveUserAiKey(session.user.id, selectedModel);
  // Put it in scope for the whole request. `apiKey` below still carries it
  // for the Anthropic path, but every OTHER provider re-reads its own env
  // inside aiClientConfig — by design — so without this line a user's
  // OpenRouter or Kimi key is resolved, passed in, and silently ignored.
  enterUserAiKey(ownKey ? { ...ownKey, userId: session.user.id } : null);
  const apiKey = ownKey?.apiKey ?? aiApiKey(selectedModel);
  if (!apiKey) {
    return NextResponse.json({ error: "AI not configured for the selected model. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." }, { status: 503 });
  }

  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // General + EPC default rules, filtered to GREEN (AI-enforceable) only.
  let fullRules = "";
  try {
    for (const category of ["general", "epc"]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) fullRules += (fullRules ? "\n\n" : "") + dr.rules;
    }
  } catch { /* proceed without rules */ }

  const { aiRules } = splitRulesByEnforcement(fullRules);
  console.log("[AI epc plan] full:", fullRules.length, "chars → green-only:", aiRules.length, "chars");

  try {
    const result = await planEpc({ apiKey, prompt, attachment, rules: aiRules, model: selectedModel });
    if (!result.ok) {
      return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status });
    }
    const { plan, model } = result;
    console.log("[AI epc plan] returned:", plan.elements.length, "elements,", plan.connections.length, "connections");
    const elementBlock = await gateElementCount(session.user.id, "epc", { elements: plan.elements });
    if (elementBlock) return elementBlock;
    await recordUsage(session.user.id, "aiAttempts");
    return NextResponse.json({
      plan,
      model,
      elementCount: plan.elements.length,
      connectionCount: plan.connections.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI epc plan] error:", msg);
    return NextResponse.json({ error: `AI planning failed: ${describeAiError(msg)}` }, { status: 500 });
  }
}
