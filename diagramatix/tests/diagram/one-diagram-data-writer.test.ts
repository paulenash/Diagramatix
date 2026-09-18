/**
 * DATA-40 — there is one writer of `Diagram.data`, and new code has to use it.
 *
 * Thirteen hand-rolled UPDATEs, each deciding for itself what to set and whether
 * to guard anything. The audit's point was not the thirteen, it was that "any
 * new server-side mutation inherits the same defect by default" — so the fix is
 * only worth anything if a fourteenth cannot quietly appear.
 *
 * This is a tree scan, the same technique as the DATA-33 version-bump guard next
 * door, and it has the same limitation: it reads source text, not behaviour. It
 * catches the thing that actually happens, which is somebody writing the
 * statement out again because it was easier than finding the helper.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const APP = join(process.cwd(), "app");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (/\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const rel = (p: string) => p.slice(process.cwd().length + 1).replace(/\\/g, "/");

/** Files that write `Diagram.data` with their own SQL rather than the helper. */
const handRolled = walk(APP)
  .map((p) => ({ path: rel(p), text: readFileSync(p, "utf8") }))
  .filter(({ text }) =>
    text.includes('UPDATE "Diagram"')
    && /SET\s+("?data"?)\s*=|SET\s+data\s*=/.test(text));

/**
 * The two that keep their own statement, each for a stated reason. Anything else
 * appearing here means a writer went around the helper.
 */
const ALLOWED = new Set([
  // The helper itself.
  "app/lib/diagram/updateDiagramData.ts",
  // Sets `name` in the SAME statement as `data`, inside its own transaction, so
  // the rename and the contents cannot be observed apart.
  "app/api/projects/[id]/renumber/route.ts",
  // Surgical `jsonb_set` of one key: it re-reads the row at write time and so
  // preserves a concurrent editor save of everything else. Stronger than the
  // whole-blob helper, not weaker.
  "app/api/projects/[id]/sop/route.ts",
  // Same reason, and it is where that technique came from — the DATA-05 fix.
  // Archiving merges one `_archive` key and restoring strips it, both in the
  // database, so neither ever holds a copy of the diagram to lose.
  "app/lib/archive.ts",
]);

describe("T4527 — nobody writes Diagram.data by hand any more", () => {
  it("has no hand-rolled writer outside the short allow-list", () => {
    const rogue = handRolled.map((f) => f.path).filter((p) => !ALLOWED.has(p));
    expect(rogue, "use updateDiagramData / setDiagramData / diagramDataSql instead").toEqual([]);
  });

  it("keeps the allow-list honest", () => {
    // An entry that no longer writes the column is a stale exemption, and the
    // next writer to be added to that file inherits it silently.
    const writing = new Set(handRolled.map((f) => f.path));
    for (const p of ALLOWED) {
      expect(writing.has(p), `${p} is exempted but no longer writes Diagram.data`).toBe(true);
    }
  });

  it("still finds writers at all", () => {
    // If the detector stopped matching, every assertion above would pass while
    // proving nothing.
    expect(handRolled.length).toBeGreaterThan(0);
  });
});

describe("T4528 — every write of the column sets the same three things", () => {
  const statements = handRolled.flatMap(({ path, text }) =>
    text.split('UPDATE "Diagram"').slice(1).map((s) => ({ path, sql: s.slice(0, 400) })),
  ).filter(({ sql }) => /^\s*SET\s+("?data"?)\s*=/.test(sql));

  it("bumps the version", () => {
    // DATA-33's rule, kept here so the two guards cannot disagree.
    for (const { path, sql } of statements) {
      expect(sql, `${path}: a write that does not bump version defeats the editor's CAS`)
        .toMatch(/version\s*=\s*version\s*\+\s*1/);
    }
  });

  it("touches updatedAt", () => {
    // Five of the thirteen were skipping this, so a diagram could change without
    // anything that sorts or displays by modification date noticing.
    for (const { path, sql } of statements) {
      expect(sql, `${path}: set "updatedAt" = NOW() as well`).toMatch(/"updatedAt"\s*=\s*NOW\(\)/);
    }
  });

  it("passes the blob as a parameter, never interpolated", () => {
    for (const { path, sql } of statements) {
      expect(sql, `${path}: a label can contain anything at all`).toMatch(/\$\d/);
    }
  });
});
