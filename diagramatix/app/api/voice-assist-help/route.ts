/**
 * What the editor needs to draw the Voice Assist Help — any signed-in user.
 *
 *   GET → { enabled, repair, patterns, conventions }   (the patterns are sent when the panel OR the repair is on)
 *
 * `enabled` is the SuperAdmin's global switch (off until Paul turns it on). The patterns and
 * conventions are the ones in force: the SuperAdmin's saved edit, or — if that edit does not
 * compile — the shipped default (`resolveAssistHelp`). They are only command words; the
 * Voice Assist feature gate itself is applied by the editor, which draws nothing without it.
 *
 * The tile that changes them is `app/api/admin/voice-assist-help/route.ts`.
 * Plan: new features/voice-assist-help-plan-2026-10-01.md
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readVoiceAssistHelp } from "@/app/lib/voice/voiceAssistHelpSetting";
import { resolveAssistHelp } from "@/app/lib/assist/commandTree";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stored = await readVoiceAssistHelp();
  // The tree is needed by the panel (enabled) AND by position-aware repair (repair, on by default).
  if (!stored.enabled && !stored.repair) return NextResponse.json({ enabled: false, repair: false });
  const cfg = resolveAssistHelp(stored);
  return NextResponse.json({ enabled: stored.enabled, repair: stored.repair, patterns: cfg.patterns, conventions: cfg.conventions });
}
