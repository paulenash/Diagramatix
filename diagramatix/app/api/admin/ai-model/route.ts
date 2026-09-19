/**
 * SuperAdmin: read / set the AI model settings (persisted in AppSetting).
 * The pickers offer the shared AI_MODELS list — the same models the "Compare
 * all models" tool runs.
 *
 *   • model        — AI Generate's default.
 *   • visionModel  — optional override for image → diagram.
 *   • commandModel — optional override for the Voice Assist command
 *                    interpreter, which defaults to Haiku (Paul, 2026-09-20):
 *                    it rewrites ONE sentence and the deterministic grammar
 *                    re-validates whatever comes back.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { allModels } from "@/app/lib/ai/models";
import {
  getAiGenerateModel, setAiGenerateModel, getAiVisionModel, setAiVisionModel,
  getAiCommandModel, setAiCommandModel, DEFAULT_AI_COMMAND_MODEL, AI_COMMAND_MODEL_KEY,
} from "@/app/lib/ai/aiModelSetting";
import { prisma } from "@/app/lib/db";

export async function GET() {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // The command model reports the STORED override (blank = following the
  // default) alongside what is actually in force, so the picker can show
  // "Default (Haiku 4.5)" rather than pretending an override exists.
  const stored = await prisma.appSetting.findUnique({ where: { key: AI_COMMAND_MODEL_KEY } })
    .catch(() => null);
  return NextResponse.json({
    model: await getAiGenerateModel(),
    visionModel: (await getAiVisionModel()) ?? "",
    commandModel: stored?.value?.trim() ?? "",
    commandModelInUse: await getAiCommandModel(),
    commandModelDefault: DEFAULT_AI_COMMAND_MODEL,
    models: allModels(),
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    // Either or both may be sent. `visionModel: ""` clears the vision override.
    // Any of the three may be sent. An empty string CLEARS that override:
    // vision falls back to the generate model, command to its own default.
    const out: { model?: string; visionModel?: string; commandModel?: string | null } = {};
    if (typeof body.model === "string") out.model = await setAiGenerateModel(body.model);
    if (typeof body.visionModel === "string") out.visionModel = await setAiVisionModel(body.visionModel);
    if (typeof body.commandModel === "string") out.commandModel = await setAiCommandModel(body.commandModel);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  }
}
