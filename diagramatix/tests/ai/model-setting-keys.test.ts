/**
 * Every AppSetting key that selects a model must be accounted for when the
 * default is changed.
 *
 * There are two — `ai.generate.model` and `ai.vision.model` — and the second is
 * easy to miss, because nothing fails when you do. Set the main model and images
 * keep generating on whatever the vision override names: no error, no warning,
 * just one path quietly still on the old model while everything else has moved.
 * That is the same failure mode as the constant-versus-row confusion that made
 * "the default is Kimi K3" survive a week past being true.
 *
 * So the check is DERIVED: it reads the key constants out of the module that
 * owns them, and fails if the prod script does not mention one. A third key
 * added later is caught by construction rather than by someone remembering.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { AI_MODEL_KEY, AI_VISION_MODEL_KEY } from "@/app/lib/ai/aiModelSetting";

const ROOT = path.resolve(__dirname, "..", "..");
const SETTING_SRC = fs.readFileSync(path.join(ROOT, "app/lib/ai/aiModelSetting.ts"), "utf8");
const SCRIPT = fs.readFileSync(path.join(ROOT, "scripts/set-default-ai-model.sql"), "utf8");

/** The `ai.*` setting keys this module declares, read from the source. */
function declaredKeys(): string[] {
  return [...SETTING_SRC.matchAll(/export const \w*MODEL_KEY\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
}

describe("model setting keys", () => {
  it("T4233 — the prod script accounts for every model setting key that exists", () => {
    const keys = declaredKeys();

    // The scan must actually find something, or it passes by finding nothing —
    // which is how this kind of guard usually fails to be a guard.
    expect(keys.length, "no *_MODEL_KEY constants found — the regex has gone stale").toBeGreaterThanOrEqual(2);
    expect(keys).toContain(AI_MODEL_KEY);
    expect(keys).toContain(AI_VISION_MODEL_KEY);

    for (const k of keys) {
      expect(SCRIPT, `scripts/set-default-ai-model.sql never mentions "${k}"`).toContain(k);
    }
  });

  it("T4234 — the script REPORTS the vision override rather than silently deleting it", () => {
    // An override somebody set deliberately (a cheap text model as the default,
    // a vision-capable one for images) is not a migration script's to discard.
    // It has to be visible and left alone.
    expect(SCRIPT).toMatch(/SELECT key, value[\s\S]*ai\.vision\.model/);
    const statements = SCRIPT.split("\n").filter((l) => !l.trim().startsWith("--"));
    expect(statements.join("\n"), "the script must not DELETE the vision override unprompted")
      .not.toMatch(/DELETE\s+FROM\s+"AppSetting"/i);
  });

  it("T4235 — only the row decides, and the script writes the row", () => {
    // The constant is the fallback; the row overrides it. The script exists
    // because changing the constant alone changes nothing where a row is set.
    expect(SCRIPT).toMatch(/INSERT INTO "AppSetting"[\s\S]*ON CONFLICT[\s\S]*DO UPDATE/i);
    expect(SCRIPT).toContain("claude-opus-5");
  });
});
