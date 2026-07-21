/**
 * SuperAdmin: read / set the AI-Generate default model (persisted in AppSetting).
 * The picker offers the shared AI_MODELS list — the same models the "Compare all
 * models" tool runs.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { allModels } from "@/app/lib/ai/models";
import { getAiGenerateModel, setAiGenerateModel } from "@/app/lib/ai/aiModelSetting";

export async function GET() {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ model: await getAiGenerateModel(), models: allModels() });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = typeof body.model === "string" ? body.model : "";
  try {
    const model = await setAiGenerateModel(id);
    return NextResponse.json({ model });
  } catch {
    return NextResponse.json({ error: "Unknown model" }, { status: 400 });
  }
}
