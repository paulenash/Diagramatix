/**
 * What the editor needs to draw the Voice Assist Bubble Help — any signed-in user.
 *
 *   GET → { enabled, patterns, conventions }
 *
 * `enabled` is the SuperAdmin's global switch (off until Paul turns it on). The patterns and
 * conventions are the ones in force: the SuperAdmin's saved edit, or — if that edit does not
 * compile — the shipped default (`resolveBubbleHelp`). They are only command words; the
 * Voice Assist feature gate itself is applied by the editor, which draws nothing without it.
 *
 * The tile that changes them is `app/api/admin/voice-bubble-help/route.ts`.
 * Plan: new features/voice-assist-bubble-help-plan-2026-10-01.md
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { readVoiceBubbleHelp } from "@/app/lib/voice/voiceBubbleHelpSetting";
import { resolveBubbleHelp } from "@/app/lib/assist/commandTree";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const stored = await readVoiceBubbleHelp();
  if (!stored.enabled) return NextResponse.json({ enabled: false });
  const cfg = resolveBubbleHelp(stored);
  return NextResponse.json({ enabled: true, patterns: cfg.patterns, conventions: cfg.conventions });
}
