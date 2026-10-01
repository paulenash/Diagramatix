/**
 * Voice Assist Bubble Help — what the SuperAdmin tile stores. Server-only.
 *
 *   `voiceBubbleHelp.enabled`      the global switch. Missing means OFF (Paul turns it on).
 *   `voiceBubbleHelp.patterns`     the SuperAdmin's edit of the command patterns (text).
 *   `voiceBubbleHelp.conventions`  the SuperAdmin's edit of the conventions (JSON).
 *
 * A missing patterns / conventions row means "the shipped default" — there is nothing to
 * seed and "Reset to default" is a delete. This is the same shape as Text to Speech
 * (`ttsSettings.ts`): the default lives in code, the override in `AppSetting`.
 *
 * Separate from the existing canvas Bubble Help (`bubbleHelp.enabled`, `bubbleHelpSetting.ts`).
 * Plan: new features/voice-assist-bubble-help-plan-2026-10-01.md
 */
import { prisma } from "@/app/lib/db";
import { validateConventions } from "@/app/lib/assist/commandTree/validate";
import type { Conventions } from "@/app/lib/assist/commandTree/conventions";

export const VBH_ENABLED_KEY = "voiceBubbleHelp.enabled";
export const VBH_PATTERNS_KEY = "voiceBubbleHelp.patterns";
export const VBH_CONVENTIONS_KEY = "voiceBubbleHelp.conventions";

/** A guard against someone pasting a novel. The shipped patterns are ~9 KB. */
export const MAX_PATTERNS_CHARS = 60_000;

export interface StoredVoiceBubbleHelp {
  enabled: boolean;
  /** The stored edit, or null when there is none (the shipped default applies). */
  patterns: string | null;
  conventions: Conventions | null;
}

/** Pure: the stored settings from whatever AppSetting rows exist. A conventions row that does not validate is ignored. */
export function parseStoredVoiceBubbleHelp(rows: ReadonlyArray<{ key: string; value: string }>): StoredVoiceBubbleHelp {
  const get = (k: string) => rows.find((r) => r.key === k)?.value;
  const patterns = get(VBH_PATTERNS_KEY);
  let conventions: Conventions | null = null;
  const rawConv = get(VBH_CONVENTIONS_KEY);
  if (rawConv) {
    try {
      const v = validateConventions(JSON.parse(rawConv));
      if (v.ok) conventions = v.conventions;
    } catch { /* an unreadable row is no override */ }
  }
  return {
    enabled: get(VBH_ENABLED_KEY) === "true",
    patterns: patterns && patterns.trim() ? patterns : null,
    conventions,
  };
}

export async function readVoiceBubbleHelp(): Promise<StoredVoiceBubbleHelp> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [VBH_ENABLED_KEY, VBH_PATTERNS_KEY, VBH_CONVENTIONS_KEY] } },
    select: { key: true, value: true },
  });
  return parseStoredVoiceBubbleHelp(rows);
}

/** `null` for patterns / conventions means "no override" — the row is deleted. */
export async function writeVoiceBubbleHelp(patch: { enabled?: boolean; patterns?: string | null; conventions?: Conventions | null }): Promise<void> {
  const ops = [];
  const put = (key: string, value: string) => prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  const drop = (key: string) => prisma.appSetting.deleteMany({ where: { key } });
  if (patch.enabled !== undefined) ops.push(put(VBH_ENABLED_KEY, patch.enabled ? "true" : "false"));
  if (patch.patterns !== undefined) ops.push(patch.patterns === null ? drop(VBH_PATTERNS_KEY) : put(VBH_PATTERNS_KEY, patch.patterns));
  if (patch.conventions !== undefined) ops.push(patch.conventions === null ? drop(VBH_CONVENTIONS_KEY) : put(VBH_CONVENTIONS_KEY, JSON.stringify(patch.conventions)));
  if (ops.length) await prisma.$transaction(ops);
}
