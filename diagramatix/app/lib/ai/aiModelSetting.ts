/**
 * The AI-Generate default model, persisted as a global AppSetting so a SuperAdmin
 * can change it without a deploy. Reads fall back to DEFAULT_AI_MODEL (Haiku 4.5)
 * when unset or pointing at a since-removed model.
 */
import { prisma } from "@/app/lib/db";
import { resolveAiModel, isKnownAiModel } from "./models";

export const AI_MODEL_KEY = "ai.generate.model";

/** The model AI Generate should use right now (validated; defaulted). */
export async function getAiGenerateModel(): Promise<string> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: AI_MODEL_KEY } });
    return resolveAiModel(row?.value);
  } catch {
    return resolveAiModel(null); // DB hiccup → safe default, never block generation
  }
}

/** Set the AI-Generate model (must be a known model id). Returns the stored id. */
export async function setAiGenerateModel(id: string): Promise<string> {
  if (!isKnownAiModel(id)) throw new Error(`Unknown model: ${id}`);
  await prisma.appSetting.upsert({
    where: { key: AI_MODEL_KEY },
    create: { key: AI_MODEL_KEY, value: id },
    update: { value: id },
  });
  return id;
}
