/**
 * Voice Assist Help — what the SuperAdmin tile stores. Server-only.
 *
 *   `voiceAssistHelp.enabled`      the global switch. Missing means OFF (Paul turns it on).
 *   `voiceAssistHelp.patterns`     the SuperAdmin's edit of the command patterns (text).
 *   `voiceAssistHelp.conventions`  the SuperAdmin's edit of the conventions (JSON).
 *
 * A missing patterns / conventions row means "the shipped default" — there is nothing to
 * seed and "Reset to default" is a delete. This is the same shape as Text to Speech
 * (`ttsSettings.ts`): the default lives in code, the override in `AppSetting`.
 *
 * RENAMED 2026-10-01 (Paul: "Bubbles are not a goer!"). The feature's first keys were
 * `voiceBubbleHelp.*`, and the switch was already ON in production, so this reads the OLD key
 * when the new one is absent — nothing silently turns off — and a save writes the NEW key and
 * removes the old one. Once every database has been saved through the new code the fallback
 * is dead weight and can go.
 *
 * Separate from the existing canvas Bubble Help (`bubbleHelp.enabled`, `bubbleHelpSetting.ts`).
 * Plan: new features/voice-assist-help-plan-2026-10-01.md
 */
import { prisma } from "@/app/lib/db";
import { validateConventions } from "@/app/lib/assist/commandTree/validate";
import type { Conventions } from "@/app/lib/assist/commandTree/conventions";

export const VAH_ENABLED_KEY = "voiceAssistHelp.enabled";
export const VAH_PATTERNS_KEY = "voiceAssistHelp.patterns";
export const VAH_CONVENTIONS_KEY = "voiceAssistHelp.conventions";

/** The keys this feature was first stored under — read as a fallback, removed on the next save. */
export const LEGACY_ENABLED_KEY = "voiceBubbleHelp.enabled";
export const LEGACY_PATTERNS_KEY = "voiceBubbleHelp.patterns";
export const LEGACY_CONVENTIONS_KEY = "voiceBubbleHelp.conventions";

/** A guard against someone pasting a novel. The shipped patterns are ~9 KB. */
export const MAX_PATTERNS_CHARS = 60_000;

export interface StoredVoiceAssistHelp {
  enabled: boolean;
  /** The stored edit, or null when there is none (the shipped default applies). */
  patterns: string | null;
  conventions: Conventions | null;
}

/** Pure: the stored settings from whatever AppSetting rows exist. A conventions row that does not validate is ignored. */
export function parseStoredVoiceAssistHelp(rows: ReadonlyArray<{ key: string; value: string }>): StoredVoiceAssistHelp {
  const get = (k: string, legacy: string) => rows.find((r) => r.key === k)?.value ?? rows.find((r) => r.key === legacy)?.value;
  const patterns = get(VAH_PATTERNS_KEY, LEGACY_PATTERNS_KEY);
  let conventions: Conventions | null = null;
  const rawConv = get(VAH_CONVENTIONS_KEY, LEGACY_CONVENTIONS_KEY);
  if (rawConv) {
    try {
      const v = validateConventions(JSON.parse(rawConv));
      if (v.ok) conventions = v.conventions;
    } catch { /* an unreadable row is no override */ }
  }
  return {
    enabled: get(VAH_ENABLED_KEY, LEGACY_ENABLED_KEY) === "true",
    patterns: patterns && patterns.trim() ? patterns : null,
    conventions,
  };
}

export async function readVoiceAssistHelp(): Promise<StoredVoiceAssistHelp> {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [VAH_ENABLED_KEY, VAH_PATTERNS_KEY, VAH_CONVENTIONS_KEY, LEGACY_ENABLED_KEY, LEGACY_PATTERNS_KEY, LEGACY_CONVENTIONS_KEY],
      },
    },
    select: { key: true, value: true },
  });
  return parseStoredVoiceAssistHelp(rows);
}

/** `null` for patterns / conventions means "no override" — the row is deleted. A field that is written also clears its legacy row. */
export async function writeVoiceAssistHelp(patch: { enabled?: boolean; patterns?: string | null; conventions?: Conventions | null }): Promise<void> {
  const ops = [];
  const put = (key: string, value: string) => prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const drop = (key: string) => prisma.appSetting.deleteMany({ where: { key } });
  if (patch.enabled !== undefined) {
    ops.push(put(VAH_ENABLED_KEY, patch.enabled ? "true" : "false"), drop(LEGACY_ENABLED_KEY));
  }
  if (patch.patterns !== undefined) {
    ops.push(patch.patterns === null ? drop(VAH_PATTERNS_KEY) : put(VAH_PATTERNS_KEY, patch.patterns), drop(LEGACY_PATTERNS_KEY));
  }
  if (patch.conventions !== undefined) {
    ops.push(patch.conventions === null ? drop(VAH_CONVENTIONS_KEY) : put(VAH_CONVENTIONS_KEY, JSON.stringify(patch.conventions)), drop(LEGACY_CONVENTIONS_KEY));
  }
  if (ops.length) await prisma.$transaction(ops);
}
