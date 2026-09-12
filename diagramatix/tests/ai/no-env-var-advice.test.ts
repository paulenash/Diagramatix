/**
 * User-facing text must not name a server environment variable.
 *
 * Paul, 2026-09-13: "The Process AI-curate hover text: Remove reference to
 * ANTHROPIC_API_KEY."
 *
 * It was wrong twice over. There are seven providers now, so naming two of them
 * is stale — and since bring-your-own keys shipped, the actionable step for most
 * users is their OWN key in Account Settings, which they can add without an
 * administrator. Telling somebody to set a server env var is advice they cannot
 * follow, on a screen where a thing they CAN do exists.
 *
 * Scanned over the whole tree rather than the one string he saw, because the
 * same sentence had been copied into eleven error messages.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");

/** Every .ts/.tsx under app/, minus the places that legitimately read env. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated") continue;
      sourceFiles(full, out);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

/**
 * Files allowed to name the variables: the code that READS them, and the
 * catalogue that documents them. Naming a variable in `process.env.X` is not
 * advice to a user; naming it in a title= or an error message is.
 */
const READS_ENV = /anthropicClient\.ts|models\.ts|userAiKey\.ts|aiModelSetting\.ts/;

/**
 * Screens whose READER can act on it.
 *
 * The rule is not "never write the name" — it is "do not give advice the reader
 * cannot follow". The SuperAdmin AI Model screen is read by the person who sets
 * deployment environment variables, so telling them which one makes Kimi appear
 * is among the most useful sentences on the page. The mining hover text was read
 * by everybody, which is what made it wrong.
 */
const ADMIN_CONFIG = /dashboard[\\/]admin[\\/]ai-model[\\/]/;

describe("no user-facing text names an env var", () => {
  it("T4310 — no title, label or error message tells a user to set ANTHROPIC_API_KEY", () => {
    const offenders: string[] = [];
    for (const f of sourceFiles(path.join(ROOT, "app"))) {
      if (READS_ENV.test(f) || ADMIN_CONFIG.test(f)) continue;
      const src = fs.readFileSync(f, "utf8");
      for (const line of src.split(/\r?\n/)) {
        if (!/ANTHROPIC_API_KEY|MOONSHOT_API_KEY/.test(line)) continue;
        // Reading the variable is fine; telling somebody to set it is not.
        if (/process\.env\./.test(line)) continue;
        offenders.push(`${path.relative(ROOT, f)}: ${line.trim().slice(0, 90)}`);
      }
    }
    expect(offenders, "user-facing text naming a server env var").toEqual([]);
  });

  it("T4311 — the advice points at something the reader can actually do", () => {
    // A message that only says "not configured" leaves a non-admin stuck. Since
    // bring-your-own keys shipped there is always a next step for them.
    const plan = fs.readFileSync(path.join(ROOT, "app/api/ai/bpmn/plan/route.ts"), "utf8");
    expect(plan).toMatch(/add your own under Account Settings/);
    expect(plan, "and the administrator route is still named").toMatch(/administrator can add a key/);
  });
});
