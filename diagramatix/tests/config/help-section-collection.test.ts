/**
 * T4578-T4579 — a HelpSection's denormalised `collection` must match its
 * chapter's, and every seed that creates one must say so.
 *
 * WHY THIS IS NOT COSMETIC. `HelpSection.collection` is a copy of the
 * chapter's, kept so the bulk-save PUT can scope its delete without a join:
 *
 *     app/api/admin/user-guide/route.ts
 *       await tx.helpSection.deleteMany({ where: { collection: COLLECTION } });
 *
 * The column defaults to "user-guide". Five `add-tech-notes-*.ts` seeds
 * created their sections without it, so 33 sections belonging to `tech-design`
 * chapters carried `collection = "user-guide"`. Saving the User Guide in the
 * Document Editor would have deleted the Technical Notes with it — silently,
 * and only noticed the next time someone opened /tech-notes.
 *
 * Found on 2026-09-20 while checking what the Voice Assist seeds had actually
 * written. The data is repaired by `scripts/sql/seed-voice-assist-content.sql`;
 * this keeps the code from writing it wrong again.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SCRIPTS = join(process.cwd(), "scripts");

/** Every `prisma.helpSection.create({ data: { … } })` call, with its data object. */
function sectionCreates(src: string): string[] {
  const out: string[] = [];
  const re = /helpSection\.create\(\s*\{\s*data:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    // Walk braces from the `{` that opened `data:` so a nested object cannot
    // truncate the slice — `data: { a: { b: 1 }, collection: x }` is one call.
    let depth = 1;
    let i = re.lastIndex;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    out.push(src.slice(re.lastIndex, i - 1));
  }
  return out;
}

const seeds = readdirSync(SCRIPTS)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({ file: f, src: readFileSync(join(SCRIPTS, f), "utf8") }))
  .filter((s) => s.src.includes("helpSection.create"));

describe("T4578 — every seed that creates a HelpSection sets its collection", () => {
  it("finds the seeds at all, so an empty sweep cannot pass vacuously", () => {
    expect(seeds.length, "no scripts create HelpSections — has the sweep broken?")
      .toBeGreaterThan(5);
  });

  it("passes `collection` in every create", () => {
    const missing: string[] = [];
    for (const { file, src } of seeds) {
      const calls = sectionCreates(src);
      expect(calls.length, `${file}: the brace walk found no create`).toBeGreaterThan(0);
      for (const data of calls) {
        if (!/\bcollection\s*:/.test(data)) missing.push(file);
      }
    }
    expect(
      [...new Set(missing)],
      "these seeds let `collection` default to 'user-guide', which a User Guide save would then delete",
    ).toEqual([]);
  });

  it("sets it to the chapter's own collection, not just any collection", () => {
    // Passing the field is not enough — hard-coding "user-guide" into a
    // tech-design chapter's sections satisfies the rule above and is the exact
    // bug it exists to prevent. Compare against whatever collection the script
    // writes on its CHAPTER, whether that is a const or a literal.
    let checked = 0;
    for (const { file, src } of seeds) {
      const chapterCollection =
        /const COLLECTION = "([^"]+)"/.exec(src)?.[1] ??
        /helpChapter\.create\([\s\S]{0,200}?collection:\s*"([^"]+)"/.exec(src)?.[1];
      if (!chapterCollection) continue;
      for (const data of sectionCreates(src)) {
        const literal = /\bcollection\s*:\s*"([^"]+)"/.exec(data)?.[1];
        if (!literal) continue;                       // a const — covered above
        checked++;
        expect(literal, `${file}: section collection disagrees with the chapter's`)
          .toBe(chapterCollection);
      }
    }
    expect(checked, "no literal-collection create was reached — the sweep is vacuous")
      .toBeGreaterThan(0);
  });
});

describe("T4579 — the repair ships with the seed that needs it", () => {
  const sql = readFileSync(join(process.cwd(), "scripts", "sql", "seed-voice-assist-content.sql"), "utf8");

  it("repairs any row whose collection disagrees with its chapter", () => {
    // Asserting the CLAIM — sections are realigned to their chapter — rather
    // than the exact statement text, so a rewrite that still repairs passes.
    const repair = /UPDATE\s+"HelpSection"[\s\S]{0,400}?WHERE[\s\S]{0,200}?collection\s*<>\s*c\.collection/i;
    expect(sql, "the seed must fix the rows already written wrong").toMatch(repair);
    expect(sql).toMatch(/SET\s+collection\s*=\s*c\.collection/i);
  });

  it("writes its own sections with the right collection", () => {
    // Two inserts, one per collection. Each must name its own.
    expect(sql).toMatch(/INSERT INTO "HelpSection"[\s\S]{0,600}?'user-guide'/);
    expect(sql).toMatch(/INSERT INTO "HelpSection"[\s\S]{0,600}?'tech-design'/);
  });

  it("runs the repair inside the same transaction as the seed", () => {
    // A repair that is committed separately can leave the database half-fixed
    // if the seed below it fails.
    const begin = sql.indexOf("BEGIN;");
    const repair = sql.search(/UPDATE\s+"HelpSection"\s+s/);
    const commit = sql.indexOf("COMMIT;");
    expect(begin).toBeGreaterThan(-1);
    expect(repair).toBeGreaterThan(begin);
    expect(commit).toBeGreaterThan(repair);
  });
});
