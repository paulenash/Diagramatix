/**
 * The voice session hook the behaviour tests run (Stage 4 of mobile voice).
 *
 * Until the move: the block cut out of TODAY's DiagramEditor.tsx and wrapped by
 * buildHookSource() — written to tests/voice-session/.generated/ (gitignored)
 * and imported. After the move: app/hooks/useVoiceSession.ts itself, which the
 * move writes with the same buildHookSource(). Same tests, both sides.
 *
 * The generated file is named by a hash of its text and written atomically
 * (a temp file in the same folder, then a rename), so two test processes
 * running at once — worktrees, a watch run beside a full run — never import a
 * half-written file, and one that already exists is simply reused.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildHookSource } from "./voiceSessionFrame.mjs";
import type { useVoiceSession as UseVoiceSession } from "./voiceSessionTypes";

const ROOT = process.cwd();
export const HOOK_PATH = join(ROOT, "app", "hooks", "useVoiceSession.ts");
const EDITOR_PATH = join(ROOT, "app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");

/** Which text the tests are running: the moved hook, or the block still in the editor. */
export const runningAgainst = (): "hook" | "editor-block" => (existsSync(HOOK_PATH) ? "hook" : "editor-block");

/** A slice untouched this long belongs to an earlier editor text that no run can still be loading. */
const STALE_MS = 10 * 60_000;

/** The generated slice for this editor text: written once (atomically) per distinct text, reused after. */
function sliceFile(src: string): string {
  const dir = join(ROOT, "tests", "voice-session", ".generated");
  mkdirSync(dir, { recursive: true });
  const hash = createHash("sha1").update(src).digest("hex").slice(0, 8);
  const name = `useVoiceSession.slice.${hash}.ts`;
  const file = join(dir, name);
  // Earlier texts' slices would pile up (and `tsc -p .` checks every .ts here):
  // remove the stale ones. The one in use is touched below, so it is never stale.
  for (const f of readdirSync(dir)) {
    if (f === name || !/^\.?useVoiceSession\.slice\./.test(f)) continue;
    try { if (Date.now() - statSync(join(dir, f)).mtimeMs > STALE_MS) rmSync(join(dir, f), { force: true }); } catch { /* another run got there first */ }
  }
  if (existsSync(file)) {
    try { const now = new Date(); utimesSync(file, now, now); } catch { /* only for the pruning above */ }
    return file;
  }
  // Not a .ts name, so nothing globs it up while it is being written.
  const tmp = join(dir, `.useVoiceSession.slice.${hash}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmp, src);
  try {
    renameSync(tmp, file);
  } catch (e) {
    // Another process renamed its copy in first (Windows refuses to replace a
    // file that is open) — same hash, same text: use theirs.
    rmSync(tmp, { force: true });
    if (!existsSync(file)) throw e;
  }
  return file;
}

export async function loadVoiceSession(): Promise<{ useVoiceSession: typeof UseVoiceSession }> {
  if (runningAgainst() === "hook") return import(/* @vite-ignore */ HOOK_PATH);
  const src: string = buildHookSource(readFileSync(EDITOR_PATH, "utf8"));
  return import(/* @vite-ignore */ sliceFile(src));
}
