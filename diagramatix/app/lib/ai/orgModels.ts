/**
 * PER-ORG AI MODELS (Paul, 2026-10-05, plan: new features/ai-model-selection-changes-plan-2026-10-05.md).
 *
 *   • A SuperAdmin chooses, per Org, which models are OFFERED for each purpose — Default, Vision, Voice Assist Command.
 *   • An OrgAdmin chooses, from those lists, the model their people use.
 *   • Ordinary users never choose (a model sent in a request is ignored — modelAccess.ts).
 *   • A SuperAdmin keeps the global settings and the full list.
 *
 * Stored as AppSetting rows (no schema change):  ai.org.<orgId>.offered.<purpose>  (a JSON array of model ids; ABSENT = never
 * customised = the default list, every Anthropic model, so a newly added Anthropic model reaches Orgs nobody has curated) and
 * ai.org.<orgId>.chosen.<purpose>  (one id).
 *
 * ONE RESOLVER. `resolveOrgModel()` is the only way a route should pick a model; a test (T5255) fails when a route that calls a
 * provider reaches for the global getters instead.
 */
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { AI_MODELS, isKnownAiModel } from "./models";
import { aiApiKey } from "./anthropicClient";
import { getAiCommandModel, getAiGenerateModel, resolveGenerateModel } from "./aiModelSetting";

export type ModelPurpose = "default" | "vision" | "command";
export const MODEL_PURPOSES: readonly ModelPurpose[] = ["default", "vision", "command"];

export const offeredKey = (orgId: string, purpose: ModelPurpose) => `ai.org.${orgId}.offered.${purpose}`;
export const chosenKey = (orgId: string, purpose: ModelPurpose) => `ai.org.${orgId}.chosen.${purpose}`;

/** The starting list for a purpose: every Anthropic model; for Vision, those that read images. */
export function defaultOfferedModels(purpose: ModelPurpose): string[] {
  return AI_MODELS
    .filter((m) => (m.provider ?? "anthropic") === "anthropic")
    .filter((m) => purpose !== "vision" || m.vision !== false)
    .map((m) => m.id);
}

/**
 * The model in force for an Org and purpose — PURE (unit-tested).
 *
 *   1. the Org's chosen model, if it is in the offered list and this deployment can run it;
 *   2. else the global setting — for an Org nobody has curated (so nothing changes the day this ships), or when the Org's list
 *      still contains it;
 *   3. else the first usable model in the Org's list;
 *   4. else the global setting (an EMPTY list means "use the global setting": AI keeps working).
 */
export function pickModelInForce(i: {
  offered: readonly string[] | null;      // null = never customised
  chosen: string | null;
  globalModel: string;
  defaults: readonly string[];
  usable: (id: string) => boolean;
}): string {
  const list = i.offered ?? i.defaults;
  if (i.chosen && list.includes(i.chosen) && i.usable(i.chosen)) return i.chosen;
  if (i.usable(i.globalModel) && (i.offered === null || list.includes(i.globalModel))) return i.globalModel;
  return list.find(i.usable) ?? i.globalModel;
}

const usable = (id: string) => isKnownAiModel(id) && !!aiApiKey(id);

async function readSetting(key: string): Promise<string | null> {
  try { return (await prisma.appSetting.findUnique({ where: { key } }))?.value ?? null; } catch { return null; }
}

/** What SuperAdmin has offered an Org for a purpose. `customised` is false when nobody has set a list (the default applies). */
export async function getOfferedModels(orgId: string, purpose: ModelPurpose): Promise<{ ids: string[]; customised: boolean }> {
  const raw = await readSetting(offeredKey(orgId, purpose));
  if (raw === null) return { ids: defaultOfferedModels(purpose), customised: false };
  try {
    const v = JSON.parse(raw);
    if (Array.isArray(v)) return { ids: v.filter((x): x is string => typeof x === "string" && isKnownAiModel(x)), customised: true };
  } catch { /* a corrupt row reads as "never customised" */ }
  return { ids: defaultOfferedModels(purpose), customised: false };
}

/** SuperAdmin: set the Org's offered list. Unknown ids are refused. An id the Org had CHOSEN that is no longer offered is cleared. */
export async function setOfferedModels(orgId: string, purpose: ModelPurpose, ids: readonly string[]): Promise<string[]> {
  const clean = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
  const bad = clean.find((id) => !isKnownAiModel(id));
  if (bad) throw new Error(`Unknown model: ${bad}`);
  await prisma.appSetting.upsert({ where: { key: offeredKey(orgId, purpose) }, create: { key: offeredKey(orgId, purpose), value: JSON.stringify(clean) }, update: { value: JSON.stringify(clean) } });
  const chosen = await readSetting(chosenKey(orgId, purpose));
  if (chosen && !clean.includes(chosen)) await prisma.appSetting.deleteMany({ where: { key: chosenKey(orgId, purpose) } });
  return clean;
}

/** SuperAdmin: back to the default list (every Anthropic model). */
export async function resetOfferedModels(orgId: string, purpose: ModelPurpose): Promise<void> {
  await prisma.appSetting.deleteMany({ where: { key: offeredKey(orgId, purpose) } });
}

export async function getChosenModel(orgId: string, purpose: ModelPurpose): Promise<string | null> {
  const v = (await readSetting(chosenKey(orgId, purpose)))?.trim();
  return v || null;
}

/** OrgAdmin: choose from the Org's offered list. Anything else is refused. A blank id clears the choice. */
export async function setChosenModel(orgId: string, purpose: ModelPurpose, id: string): Promise<string | null> {
  const clean = id.trim();
  if (!clean) { await prisma.appSetting.deleteMany({ where: { key: chosenKey(orgId, purpose) } }); return null; }
  const { ids } = await getOfferedModels(orgId, purpose);
  if (!ids.includes(clean)) throw new Error("That model is not offered to this organisation");
  await prisma.appSetting.upsert({ where: { key: chosenKey(orgId, purpose) }, create: { key: chosenKey(orgId, purpose), value: clean }, update: { value: clean } });
  return clean;
}

/** The global setting for a purpose — what a SuperAdmin runs on, and what an uncurated Org inherits. */
export async function globalModelFor(purpose: ModelPurpose): Promise<string> {
  return purpose === "command" ? getAiCommandModel() : purpose === "vision" ? resolveGenerateModel(true) : getAiGenerateModel();
}

/** The model in force for one Org and purpose. */
export async function modelInForce(orgId: string, purpose: ModelPurpose): Promise<string> {
  const [{ ids, customised }, chosen, globalModel] = await Promise.all([getOfferedModels(orgId, purpose), getChosenModel(orgId, purpose), globalModelFor(purpose)]);
  return pickModelInForce({ offered: customised ? ids : null, chosen, globalModel, defaults: defaultOfferedModels(purpose), usable });
}

/**
 * THE resolver — the model a route should use for this request. Best-effort about WHO is asking: a SuperAdmin runs on the global
 * setting (they pick for themselves, as now); anyone else on their active Org's model. Outside a request (a cron, a worker) or
 * with no Org, it is the global setting — AI must never fail because the model could not be worked out.
 */
export async function resolveOrgModel(opts: { purpose?: ModelPurpose; hasImage?: boolean; orgId?: string } = {}): Promise<string> {
  const purpose: ModelPurpose = opts.purpose ?? (opts.hasImage ? "vision" : "default");
  try {
    // Imported here, not at the top: the session and cookie machinery only exists inside a request, and a library that merely
    // IMPORTS this (staff narrative, the simulation facts …) must stay loadable — and testable — without Next's server runtime.
    const { auth } = await import("@/auth");
    const { cookies } = await import("next/headers");
    const { getCurrentOrgId } = await import("@/app/lib/auth/orgContext");
    const session = await auth();
    if (!session?.user?.id || isSuperuser(session)) return globalModelFor(purpose);
    const orgId = opts.orgId ?? (await getCurrentOrgId(session, await cookies()));
    return await modelInForce(orgId, purpose);
  } catch {
    return globalModelFor(purpose);
  }
}
