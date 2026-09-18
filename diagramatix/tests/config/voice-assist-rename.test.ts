/**
 * T4553-T4554 — Abracadabra is Voice Assist, and Assist is available to every
 * subscription level.
 *
 * Paul, 2026-09-19: "Change Abracadabra to Voice Assist everywhere and make
 * normal Assist available to all Subscription levels. Update Feature
 * Availability." and "Update User Guide, Technical Notes, Features and
 * Comparison documents to reflect change".
 *
 * A rename is the kind of change that is 95% done and looks finished, so this
 * sweeps the tree rather than trusting a grep done once. The content half —
 * the Features catalogue and the Guide / Notes chapters — lives in the
 * database, so what is checked here is that the SQL which moves it exists, is
 * idempotent by construction, and carries the feature states across.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { FEATURES } from "@/app/lib/features/registry";

const ROOT = process.cwd();
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

/**
 * Records of what happened keep the name the thing had when it happened —
 * renaming a release note would misreport what shipped and when. The migration
 * and this test have to name the old thing to do their jobs at all.
 */
const HISTORY = [
  "VERSION_HISTORY.md",
  join("schema", "SCHEMA_CHANGELOG.md"),
  join("scripts", "sql", "rename-abracadabra-to-voice-assist.sql"),
  join("tests", "config", "voice-assist-rename.test.ts"),
];
const HISTORY_DIRS = ["audit"];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "generated", "scratchpad"]);
const CODE_EXT = new Set([".ts", ".tsx", ".json", ".prisma", ".md"]);

function sweep(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    const rel = relative(ROOT, full);
    if (HISTORY.includes(rel) || HISTORY_DIRS.some((d) => rel.startsWith(d + sep))) continue;
    if (e.isDirectory()) { sweep(full, out); continue; }
    if (!CODE_EXT.has(full.slice(full.lastIndexOf(".")))) continue;
    if (statSync(full).size > 2_000_000) continue;
    if (/abracadabra/i.test(readFileSync(full, "utf8"))) out.push(rel);
  }
  return out;
}

describe("T4553 — nothing still says Abracadabra", () => {
  it("not in any source, doc, seed or test file", () => {
    // The two history files and audit/** are excluded by name above: renaming
    // a release note would misreport what shipped and when.
    expect(sweep(ROOT)).toEqual([]);
  });

  it("not in a file or directory NAME either", () => {
    const names: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name)) continue;
        const rel = relative(ROOT, join(dir, e.name));
      if (/abracadabra/i.test(e.name) && !HISTORY.includes(rel)) names.push(rel);
        if (e.isDirectory()) walk(join(dir, e.name));
      }
    };
    walk(ROOT);
    expect(names).toEqual([]);
  });

  it("carries the new name through the registry, the gate and the bar", () => {
    const keys = FEATURES.map((f) => f.key);
    expect(keys).toContain("voice-assist");
    expect(keys, "the old key is gone from code").not.toContain("abracadabra");
    expect(FEATURES.find((f) => f.key === "voice-assist")?.label).toBe("Voice Assist");

    expect(read("app", "api", "ai", "command", "route.ts")).toContain('gateFeature(session.user.id, "voice-assist")');
    expect(read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx")).toContain('useFeatureState("voice-assist")');
    // The bar moved file as well as name.
    expect(() => read("app", "components", "canvas", "VoiceAssistBar.tsx")).not.toThrow();
  });
});

describe("T4554 — Assist at every level, Voice Assist where it was", () => {
  const seed = JSON.parse(read("menus_and_features", "feature-availability.seed.json")) as {
    levels: string[];
    rows: { key: string; states: Record<string, string> }[];
  };
  const rowFor = (key: string) => seed.rows.find((r) => r.key === key);

  it("offers Assist on every subscription level", () => {
    const row = rowFor("nl-assist");
    expect(row, "the Assist row must exist").toBeTruthy();
    for (const level of seed.levels) {
      expect(row!.states[level], `${level} must have Assist`).toBe("available");
    }
  });

  it("leaves Voice Assist where Paul had it — Expert and above", () => {
    // He asked to rename it, not to re-price it.
    const row = rowFor("voice-assist");
    expect(row, "renamed, not dropped").toBeTruthy();
    expect(row!.states["expert"]).toBe("available");
    expect(row!.states["enterprise"]).toBe("available");
    expect(row!.states["free"]).toBe("hidden");
    expect(rowFor("abracadabra"), "the old key is gone from the seed").toBeUndefined();
  });

  it("names both features plainly in the matrix", () => {
    const labels = Object.fromEntries(FEATURES.map((f) => [f.key, f.label]));
    expect(labels["nl-assist"]).toBe("Assist");
    expect(labels["voice-assist"]).toBe("Voice Assist");
  });

  it("every seeded row is a key the registry knows", () => {
    // A rename that misses one end leaves a row nothing can ever read.
    const known = new Set(FEATURES.map((f) => f.key));
    expect(seed.rows.filter((r) => !known.has(r.key)).map((r) => r.key)).toEqual([]);
  });
});

describe("T4555 — the database half of the rename", () => {
  const sql = read("scripts", "sql", "rename-abracadabra-to-voice-assist.sql");

  it("carries the feature states across rather than dropping them", () => {
    // isFeatureAvailable fails CLOSED, so a key renamed without its rows would
    // switch Voice Assist off for everyone who has it today.
    expect(sql).toContain(`SET "featureKey" = 'voice-assist'`);
    expect(sql).toContain(`WHERE a."featureKey" = 'abracadabra'`);
  });

  it("can be run twice", () => {
    // The unique (levelId, featureKey) index is the thing a re-run would hit,
    // so the update skips any level that already has the new key.
    expect(sql).toMatch(/AND NOT EXISTS \(\s*\n?\s*SELECT 1 FROM "FeatureAvailability" b/);
    expect(sql).toContain(`DELETE FROM "FeatureAvailability" WHERE "featureKey" = 'abracadabra'`);
  });

  it("makes Assist available on levels that have no row at all", () => {
    expect(sql).toContain(`INSERT INTO "FeatureAvailability"`);
    expect(sql).toContain(`'nl-assist', 'available'`);
  });

  it("renames the published copy, not just the draft", () => {
    // /features renders the published columns; leaving them keeps the old name
    // on the public page.
    // The column must be SET, not merely named — it appears in the WHERE
    // clause too, which is enough to satisfy a bare "does it mention it".
    for (const col of ["name", "summary", "details", "publishedName", "publishedSummary", "publishedDetails"]) {
      expect(sql, `${col} must actually be rewritten`)
        .toMatch(new RegExp(`"${col}"\\s*=\\s*REPLACE\\(`));
    }
  });

  it("covers the Guide and the Notes, which share their tables", () => {
    expect(sql).toContain(`UPDATE "HelpChapter"`);
    expect(sql).toContain(`UPDATE "HelpSection"`);
    // Again the SET, not the mention: the body is where the prose lives, so
    // renaming only the headings would leave the chapters talking about a
    // feature that no longer has that name.
    for (const col of ["title", "heading", "bodyMarkdown"]) {
      expect(sql, `${col} must actually be rewritten`)
        .toMatch(new RegExp(`"${col}"\\s*=\\s*REPLACE\\(`));
    }
  });

  it("replaces the longer phrase first", () => {
    // 'Abracadabra Mode' → 'Voice Assist' before the bare word, or every title
    // would be left reading "Voice Assist Mode".
    const first = sql.indexOf("'Abracadabra Mode'");
    const bare = sql.indexOf("'Abracadabra', 'Voice Assist'");
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(bare);
  });
});
