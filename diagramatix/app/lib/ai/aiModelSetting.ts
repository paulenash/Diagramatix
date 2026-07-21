/**
 * The AI-Generate default model, persisted as a global AppSetting so a SuperAdmin
 * can change it without a deploy. Reads fall back to DEFAULT_AI_MODEL (Haiku 4.5)
 * when unset or pointing at a since-removed model.
 */
import { prisma } from "@/app/lib/db";
import { resolveAiModel, isKnownAiModel } from "./models";

export const AI_MODEL_KEY = "ai.generate.model";
/** Optional override used ONLY for image → diagram (vision) generation. When
 *  unset/blank, the image paths fall back to the main AI-Generate model. Lets an
 *  admin run a text-only model as the default while a vision-capable model handles
 *  images (the app has a single global model otherwise). */
export const AI_VISION_MODEL_KEY = "ai.vision.model";

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

/** The configured Vision-model override, or null when unset / invalid (⇒ use the
 *  main model for images too). */
export async function getAiVisionModel(): Promise<string | null> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: AI_VISION_MODEL_KEY } });
    const v = row?.value?.trim();
    return v && isKnownAiModel(v) ? v : null;
  } catch {
    return null;
  }
}

/** Set (id) or CLEAR (empty string) the Vision-model override. Returns the stored
 *  id, or "" when cleared. A non-empty id must be a known model. */
export async function setAiVisionModel(id: string): Promise<string> {
  const clean = id.trim();
  if (!clean) {
    await prisma.appSetting.deleteMany({ where: { key: AI_VISION_MODEL_KEY } });
    return "";
  }
  if (!isKnownAiModel(clean)) throw new Error(`Unknown model: ${clean}`);
  await prisma.appSetting.upsert({
    where: { key: AI_VISION_MODEL_KEY },
    create: { key: AI_VISION_MODEL_KEY, value: clean },
    update: { value: clean },
  });
  return clean;
}

/** The model to generate with, honouring the Vision-model override when the input
 *  includes an image. Falls back to the main model when no override is set. */
export async function resolveGenerateModel(hasImage: boolean): Promise<string> {
  if (hasImage) {
    const vision = await getAiVisionModel();
    if (vision) return vision;
  }
  return getAiGenerateModel();
}
