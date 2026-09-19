/**
 * The AI-Generate default model, persisted as a global AppSetting so a SuperAdmin
 * can change it without a deploy. Reads fall back to DEFAULT_AI_MODEL (Opus 5)
 * when unset or pointing at a since-removed model.
 *
 * The ROW WINS. A comment here naming the constant is not evidence of what
 * production uses — this docblock said "Kimi K3" for a week after Opus 5 became
 * the default everywhere, which is how the wrong answer got repeated. Read the
 * AppSetting, or the SuperAdmin AI Model screen.
 */
import { prisma } from "@/app/lib/db";
import { resolveAiModel, isKnownAiModel } from "./models";
import { aiApiKey } from "./anthropicClient";

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

/**
 * The model the Voice Assist command interpreter uses, and its default.
 *
 * Plan item C5. The fallback used to run on the global AI-Generate model —
 * Opus 5, chosen for writing a whole diagram from a prompt — to do a much
 * smaller job: rewrite ONE spoken sentence into a canonical command. That was
 * defensible while the feature was SuperAdmin-only; it went Expert-and-above on
 * 2026-09-17, so the spend became customers' rather than Paul's own testing.
 *
 * Paul, 2026-09-20, chose Haiku. The reason it is safe here and NOT safe for
 * generation — where his own 2026-09-04 measurement found Haiku returning about
 * a third of the content — is that this is not generation. The model picks from
 * a listed vocabulary against a listed diagram, and whatever it returns is
 * re-parsed by the deterministic grammar before anything touches the canvas. A
 * poor rewrite fails to parse; it cannot corrupt the diagram.
 *
 * An admin can override it in AI Model settings; blank clears the override and
 * returns to this default.
 */
export const AI_COMMAND_MODEL_KEY = "ai.command.model";

/** Small, quick, and re-validated downstream — see above. */
export const DEFAULT_AI_COMMAND_MODEL = "claude-haiku-4-5-20251001";

/**
 * The model the Voice Assist command route should use right now.
 *
 * Falls back to the AI-Generate model when the chosen one is not reachable from
 * THIS deployment — a Haiku default is no use on an install with no Anthropic
 * key, and a command that cannot run is worse than a dearer one that can.
 */
export async function getAiCommandModel(): Promise<string> {
  const usable = (id: string | undefined | null): id is string =>
    !!id && isKnownAiModel(id) && !!aiApiKey(id);
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: AI_COMMAND_MODEL_KEY } });
    const chosen = row?.value?.trim();
    if (usable(chosen)) return chosen;
  } catch {
    // DB hiccup → fall through, never block a command over a settings read.
  }
  if (usable(DEFAULT_AI_COMMAND_MODEL)) return DEFAULT_AI_COMMAND_MODEL;
  return getAiGenerateModel();
}

/** Set (or, with a blank id, clear back to the default) the command model. */
export async function setAiCommandModel(id: string): Promise<string | null> {
  const trimmed = id.trim();
  if (!trimmed) {
    await prisma.appSetting.deleteMany({ where: { key: AI_COMMAND_MODEL_KEY } });
    return null;
  }
  if (!isKnownAiModel(trimmed)) throw new Error(`Unknown model: ${trimmed}`);
  await prisma.appSetting.upsert({
    where: { key: AI_COMMAND_MODEL_KEY },
    create: { key: AI_COMMAND_MODEL_KEY, value: trimmed },
    update: { value: trimmed },
  });
  return trimmed;
}
