/**
 * SuperAdmin "Export Full AI Prompt" — packages the EXACT payload that a BPMN
 * generation would send to the model, as a ZIP, WITHOUT calling the AI (no quota
 * burn, no cost). Lets Chris replay the identical inputs against a local LLM.
 *
 * It reuses the same model resolution + rules loading + green filter + PCF
 * grounding as POST /api/ai/generate-bpmn, then `buildBpmnRequest` — the single
 * source of truth for the request body — so the export can never drift from what
 * is really sent.
 */
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { chooseModel } from "@/app/lib/ai/modelAccess";
import { splitRulesByEnforcement } from "@/app/lib/ai/splitRules";
import { groundRulesWithPcf } from "@/app/lib/pcf/promptGrounding";
import { buildBpmnRequest, buildSystemPrompt } from "@/app/lib/ai/planBpmn";
import { providerForModel } from "@/app/lib/ai/models";
import { safeExportName } from "@/app/lib/exportFilename";

const IMAGE_EXT: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // SuperAdmin only — this is a debugging/inspection tool that exposes the full
  // internal prompt + rules.
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { prompt, attachment, pcfNodeId, model: requestedModel, captureGeometry } =
    await req.json();
  // A prompt OR an attachment is required (image ingestion can be attachment-only).
  if (!prompt?.trim() && !attachment) {
    return NextResponse.json({ error: "A prompt or an attachment is required" }, { status: 400 });
  }

  // Same model resolution as the generation route (image → vision model).
  const defaultModel = await resolveGenerateModel(attachment?.type === "image");
  const model = chooseModel(requestedModel, defaultModel, true /* SuperAdmin */);

  // Same rules pipeline: General + BPMN defaults → GREEN-only → PCF-grounded.
  let rulesRaw = "";
  try {
    for (const category of ["general", "bpmn"]) {
      const dr = await prisma.diagramRules.findFirst({
        where: { category, isDefault: true },
        select: { rules: true },
      });
      if (dr?.rules) rulesRaw += (rulesRaw ? "\n\n" : "") + dr.rules;
    }
  } catch { /* proceed without rules */ }
  const { aiRules } = splitRulesByEnforcement(rulesRaw);
  const grounded = await groundRulesWithPcf(prisma, aiRules, pcfNodeId);

  const promptText = (typeof prompt === "string" ? prompt : "").trim();

  // The EXACT request that would be sent (no AI call).
  const request = buildBpmnRequest({
    apiKey: "", // unused by buildBpmnRequest — the export never calls the model
    prompt: promptText,
    attachment: attachment ?? undefined,
    rules: grounded,
    model,
    captureGeometry: !!captureGeometry,
  });

  const isImage = attachment?.type === "image";
  const wantGeometry = !!captureGeometry && isImage;
  const scenario = isImage ? "image" : attachment?.type === "pdf" ? "pdf"
    : attachment?.type === "text" ? "document" : "text";

  const zip = new JSZip();
  // The byte-faithful request body (replay this against any Anthropic-Messages
  // endpoint, e.g. the local box's /v1/messages).
  zip.file("request.json", JSON.stringify(request, null, 2));
  // Readable splits.
  zip.file("system-prompt.txt", request.system);
  zip.file("framework.txt", buildSystemPrompt("", wantGeometry)); // (b) the scaffold, rules omitted
  zip.file("green-rules.md", grounded || "(no green rules configured)"); // (c) rules as injected
  zip.file("user-prompt.txt", promptText || "(no text prompt — attachment only)"); // (a) the user's text

  if (isImage && attachment?.data && attachment?.mediaType) {
    const ext = IMAGE_EXT[attachment.mediaType] ?? "bin";
    // Raw image bytes so it can be opened; the base64 is also in request.json.
    zip.file(`image.${ext}`, attachment.data, { base64: true });
  }

  const meta = {
    scenario,
    model,
    provider: providerForModel(model),
    maxTokens: request.max_tokens,
    captureGeometry: wantGeometry,
    attachment: attachment
      ? { type: attachment.type, name: attachment.name ?? null, mediaType: attachment.mediaType ?? null }
      : null,
    counts: {
      systemChars: request.system.length,
      userPromptChars: promptText.length,
      greenRulesChars: grounded.length,
      contentBlocks: request.messages[0].content.length,
    },
    generatedAt: new Date().toISOString(),
    note: "Exported by SuperAdmin 'Export Full AI Prompt'. request.json is the exact messages.create body; POST it to any Anthropic-Messages endpoint. The system prompt = framework.txt + green-rules.md (rules injected under 'USER RULES AND PREFERENCES').",
  };
  zip.file("meta.json", JSON.stringify(meta, null, 2));
  zip.file(
    "README.txt",
    [
      "Full AI Prompt export — everything sent to the model for one BPMN generation.",
      "",
      "  request.json      the EXACT messages.create body (model, max_tokens, system, messages)",
      "  system-prompt.txt the full system string as sent",
      "  framework.txt     the BPMN framework scaffold only (rules omitted) — for reading",
      "  green-rules.md    the GREEN (AI-enforceable) rules + any PCF grounding, as injected",
      "  user-prompt.txt   the user's typed prompt",
      "  image.<ext>       the attached image (image scenario only; base64 also in request.json)",
      "  meta.json         model / provider / token cap / char counts / timestamp",
      "",
      "Replay: POST request.json to an Anthropic-Messages endpoint, e.g.",
      "  curl -H 'Authorization: Bearer <key>' -H 'anthropic-version: 2023-06-01' \\",
      "       -H 'Content-Type: application/json' --data @request.json \\",
      "       https://<your-box>/v1/messages",
    ].join("\n"),
  );

  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const filename = safeExportName(`ai-prompt-${scenario}-${model}`, "ai-prompt") + ".zip";
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
