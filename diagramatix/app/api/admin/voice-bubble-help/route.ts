/**
 * The Voice Assist Bubble Help tile's data — SuperAdmin only.
 *
 *   GET                       → everything the tile shows: the switch, the patterns and
 *                               conventions in force, the shipped ones (for Reset and "changed"),
 *                               the word lists, and why a saved edit is NOT in use, if it is not
 *   PUT { enabled?, patterns?, conventions? }
 *                             → save. The patterns must compile with the conventions that
 *                               would be in force, or nothing is saved and the problems come
 *                               back line by line. Saving the shipped text stores nothing.
 *   DELETE ?reset=patterns|conventions|all
 *                             → back to the shipped default
 *
 * The editor reads the result through `app/api/voice-bubble-help/route.ts`.
 * Plan: new features/voice-assist-bubble-help-plan-2026-10-01.md
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import {
  MAX_PATTERNS_CHARS, readVoiceBubbleHelp, writeVoiceBubbleHelp,
} from "@/app/lib/voice/voiceBubbleHelpSetting";
import {
  compileTree, DEFAULT_CONVENTIONS, DEFAULT_LISTS, DEFAULT_PATTERNS, isDefaultConventions, isDefaultPatterns,
  resolveBubbleHelp, validateConventions, type Conventions,
} from "@/app/lib/assist/commandTree";

const forbidden = () => NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSuperuser(session)) return forbidden();

  const stored = await readVoiceBubbleHelp();
  const cfg = resolveBubbleHelp(stored);
  return NextResponse.json({
    enabled: stored.enabled,
    patterns: cfg.patterns,
    conventions: cfg.conventions,
    defaultPatterns: DEFAULT_PATTERNS,
    defaultConventions: DEFAULT_CONVENTIONS,
    lists: cfg.lists,
    usingPatternsOverride: cfg.usingPatternsOverride,
    usingConventionsOverride: cfg.usingConventionsOverride,
    fallback: cfg.fallback,
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const readOnly = await blockReadOnlyImpersonation(session);
  if (readOnly) return readOnly;
  if (!isSuperuser(session)) return forbidden();

  let body: { enabled?: unknown; patterns?: unknown; conventions?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Send JSON" }, { status: 400 }); }

  const patch: { enabled?: boolean; patterns?: string | null; conventions?: Conventions | null } = {};
  const stored = await readVoiceBubbleHelp();

  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
    patch.enabled = body.enabled;
  }

  let conventions = stored.conventions ?? DEFAULT_CONVENTIONS;
  if (body.conventions !== undefined) {
    const v = validateConventions(body.conventions);
    if (!v.ok) return NextResponse.json({ error: "The conventions have problems", problems: v.errors }, { status: 400 });
    conventions = v.conventions;
    patch.conventions = isDefaultConventions(v.conventions) ? null : v.conventions;
  }

  let patterns = stored.patterns ?? DEFAULT_PATTERNS;
  if (body.patterns !== undefined) {
    if (typeof body.patterns !== "string") return NextResponse.json({ error: "patterns must be text" }, { status: 400 });
    if (body.patterns.length > MAX_PATTERNS_CHARS) return NextResponse.json({ error: `The patterns are too long (${MAX_PATTERNS_CHARS} characters at most)` }, { status: 400 });
    patterns = body.patterns;
    patch.patterns = isDefaultPatterns(body.patterns) ? null : body.patterns;
  }

  // Whatever would be in force after this save must compile — checked here, so a broken
  // edit is never stored (and if one somehow is, the resolver falls back to the shipped tree).
  if (body.patterns !== undefined || body.conventions !== undefined) {
    const tree = compileTree(patterns, conventions, DEFAULT_LISTS);
    if (tree.errors.length) {
      return NextResponse.json({ error: "The patterns have problems — nothing was saved", problems: tree.errors.map((e) => (e.line ? `line ${e.line}: ` : "") + e.message) }, { status: 400 });
    }
  }

  await writeVoiceBubbleHelp(patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const readOnly = await blockReadOnlyImpersonation(session);
  if (readOnly) return readOnly;
  if (!isSuperuser(session)) return forbidden();

  const what = new URL(req.url).searchParams.get("reset");
  if (what !== "patterns" && what !== "conventions" && what !== "all") {
    return NextResponse.json({ error: "reset must be patterns, conventions or all" }, { status: 400 });
  }
  await writeVoiceBubbleHelp({
    ...(what === "patterns" || what === "all" ? { patterns: null } : {}),
    ...(what === "conventions" || what === "all" ? { conventions: null } : {}),
  });
  return NextResponse.json({ ok: true });
}
