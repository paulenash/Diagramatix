/**
 * T2874 — every `Tnnnn` in the test tree has a row in TESTS_SUMMARY.md.
 *
 * The summary is hand-maintained and, by design, sits OUTSIDE the release
 * procedure: `schema/UPDATE_EVERYTHING.md` explicitly excludes it ("the
 * append-only Tnnnn numbering is an orthogonal system, not the version"). That
 * is the right call for versioning and it means no step ever checked the file —
 * which is how sixty-eight entries came to be missing without anyone noticing.
 *
 * A document that is mostly complete is worse than one known to be partial: it
 * reads as authoritative. So the check lives here, where it runs on every suite.
 *
 * One-directional on purpose: the summary may describe a test that has since
 * been renamed or removed, and pruning that is an editorial decision, not a
 * build failure. What must never happen is a test the document has never heard
 * of.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const TESTS = path.join(ROOT, "tests");
const ID_RE = /T\d{4}/g;

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.isFile() && e.name.endsWith(".ts") ? [full] : [];
  });
}

describe("TESTS_SUMMARY.md coverage", () => {
  it("lists every test id present in the tree", () => {
    const doc = fs.readFileSync(path.join(TESTS, "TESTS_SUMMARY.md"), "utf8");
    const recorded = new Set(doc.match(ID_RE) ?? []);

    const byId = new Map<string, string>();
    for (const file of walk(TESTS)) {
      for (const id of fs.readFileSync(file, "utf8").match(ID_RE) ?? []) {
        if (!byId.has(id)) byId.set(id, path.relative(ROOT, file).split(path.sep).join("/"));
      }
    }

    const missing = [...byId.entries()].filter(([id]) => !recorded.has(id)).sort();
    expect(
      missing.map(([id, file]) => `${id} (${file})`),
      "test ids with no row in tests/TESTS_SUMMARY.md — add one line each describing what the test pins",
    ).toEqual([]);
  });

  it("is itself covered, so the guard cannot pass by finding nothing", () => {
    // If the walk ever silently stopped matching files, `missing` above would be
    // empty and the test would pass while checking nothing.
    const ids = walk(TESTS).flatMap((f) => fs.readFileSync(f, "utf8").match(ID_RE) ?? []);
    expect(new Set(ids).size).toBeGreaterThan(100);
  });

  /**
   * The header and the numbering note both state the highest ref by hand, in two
   * places, and the executive summary states the suite size in a third. They had
   * drifted into disagreeing with each other AND with the tree — 820 tests in the
   * header, 436 in the summary, T0676 vs T0650 vs "the next becomes T0377" — none
   * of which matched reality. Nothing checked any of them, so nothing objected.
   */
  it("states the highest allocated ref, and states it correctly", () => {
    const doc = fs.readFileSync(path.join(TESTS, "TESTS_SUMMARY.md"), "utf8");
    const inTree = [...new Set(walk(TESTS).flatMap((f) => fs.readFileSync(f, "utf8").match(ID_RE) ?? []))].sort();
    const highest = inTree[inTree.length - 1];

    const header = doc.match(/\*\*Highest ref:\*\*\s*(T\d{4})/)?.[1];
    const note = doc.match(/Highest ref allocated:\s*`(T\d{4})`/)?.[1];
    expect(header, "the header's **Highest ref:** must match the tree").toBe(highest);
    expect(note, "the numbering note's `Highest ref allocated` must match the tree").toBe(highest);

    // ...and the "next number" advice must follow from it, not from a number
    // frozen years ago.
    const next = doc.match(/next test added anywhere becomes \*\*(T\d{4})\*\*/)?.[1];
    const expected = "T" + String(Number(highest.slice(1)) + 1).padStart(4, "0");
    expect(next, "the stated next ref must be highest + 1").toBe(expected);
  });
});
