/**
 * AI icon vectorize — image → editable vector primitives (SuperAdmin).
 * POST { image(base64), mediaType } → { primitives }.
 * Reuses the vision seam (vision-model override, provider-aware client, telemetry).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import Anthropic from "@anthropic-ai/sdk";
import { isSuperuser } from "@/app/lib/superuser";
import { makeAiClient, aiApiKey } from "@/app/lib/ai/anthropicClient";
import { enterAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { VECTORIZE_SYSTEM_PROMPT, VECTORIZE_INSTRUCTION, parseVectorizeResponse } from "@/app/lib/archimate/iconVectorize";

const ALLOWED = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await enterAiRouteContext(session, AI_INVOCATION_POINTS.IconVectorize);

  const { image, mediaType } = await req.json().catch(() => ({}));
  if (!image || typeof image !== "string") return NextResponse.json({ error: "image (base64) required" }, { status: 400 });
  const media_type = ALLOWED.includes(mediaType) ? mediaType : "image/png";

  const model = await resolveGenerateModel(true); // vision override
  const apiKey = aiApiKey(model);
  if (!apiKey) return NextResponse.json({ error: "AI not configured. Set ANTHROPIC_API_KEY or MOONSHOT_API_KEY." }, { status: 503 });

  try {
    const client = makeAiClient(model, apiKey);
    const content: Anthropic.Messages.ContentBlockParam[] = [
      { type: "image", source: { type: "base64", media_type, data: image } } as Anthropic.Messages.ContentBlockParam,
      { type: "text", text: VECTORIZE_INSTRUCTION },
    ];
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: VECTORIZE_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return NextResponse.json({ error: "No AI response" }, { status: 500 });

    let primitives;
    try { primitives = parseVectorizeResponse(textBlock.text); }
    catch { return NextResponse.json({ error: "Failed to parse AI JSON", raw: textBlock.text.slice(0, 500) }, { status: 500 }); }

    return NextResponse.json({ primitives });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Vectorize failed: ${msg}` }, { status: 500 });
  }
}
