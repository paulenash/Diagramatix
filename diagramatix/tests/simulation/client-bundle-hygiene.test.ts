/**
 * Nothing reachable from a client component may import the database.
 *
 * `nextSteps.ts` is imported by StudyManager, a client component, so everything
 * it pulls in transitively is bundled for the browser. One DB import anywhere in
 * that graph drags Prisma — and through it `node:module` — into the client, and
 * the production build fails with "the chunking context does not support
 * external modules".
 *
 * This is not hypothetical: it shipped and broke a deploy. `loadStudyRuns` was
 * written into `studyRuns.ts`, `nextSteps.ts` imported a pure helper from that
 * same file, and StudyManager imported a constant from `nextSteps`. Three
 * innocuous-looking imports and Prisma was in the browser bundle.
 *
 * NEITHER `tsc` NOR THE UNIT SUITE CATCHES THIS. Both were fully green. Only
 * `npm run build` bundles, and by then it is a failed deploy. So the invariant is
 * pinned here, where it costs a second.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const LIB = path.join(process.cwd(), "app", "lib");

/** Import forms that pull the database in. Plain strings, not patterns — the
 *  point is to be obvious, and these are the only two spellings in use. */
const DB_IMPORTS = ['from "@/app/lib/db"', 'from "@prisma/'];

/** Entry points that a client component imports as VALUES (a type-only import is
 *  erased at build time and cannot pull anything into the bundle). */
const CLIENT_REACHABLE = [
  { entry: path.join(LIB, "simulation", "nextSteps.ts"), importedBy: "StudyManager.tsx" },
  { entry: path.join(LIB, "simulation", "runTrend.ts"), importedBy: "RunTrend.tsx / RunHistory.tsx" },
  { entry: path.join(LIB, "simulation", "rework.ts"), importedBy: "SimDataPanel / StudyManager" },
  { entry: path.join(LIB, "simulation", "significance.ts"), importedBy: "CompareView.tsx" },
  { entry: path.join(LIB, "simulation", "warmup.ts"), importedBy: "the run dialog" },
  { entry: path.join(LIB, "simulation", "sweep.ts"), importedBy: "SweepPanel.tsx / StudyManager" },
  { entry: path.join(LIB, "simulation", "validate.ts"), importedBy: "ValidateTwinPanel.tsx" },
  { entry: path.join(LIB, "simulation", "skillsFromArchimate.ts"), importedBy: "the skills fill UI (slice 3)" },
];

/** Relative import specifiers in a source file. Deliberately string-based: this
 *  file is about build hygiene, and a subtly wrong regex would silently pass. */
function relativeImports(src: string): string[] {
  const out: string[] = [];
  for (const line of src.split("\n")) {
    const at = line.indexOf('from "');
    if (at < 0) continue;
    const rest = line.slice(at + 6);
    const close = rest.indexOf('"');
    if (close < 0) continue;
    const spec = rest.slice(0, close);
    if (spec.startsWith(".")) out.push(spec);
  }
  return out;
}

/** Every file reachable from `entry` by following relative imports. */
function graphFrom(entry: string): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const spec of relativeImports(fs.readFileSync(file, "utf8"))) {
      const resolved = path.resolve(path.dirname(file), spec);
      for (const candidate of [resolved + ".ts", path.join(resolved, "index.ts")]) {
        if (fs.existsSync(candidate)) { stack.push(candidate); break; }
      }
    }
  }
  return [...seen];
}

const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");

describe("client-reachable simulation modules are free of the database", () => {
  for (const { entry, importedBy } of CLIENT_REACHABLE) {
    it(`T3387 - ${rel(entry)} pulls in no DB import (bundled via ${importedBy})`, () => {
      const graph = graphFrom(entry);
      // A leaf module legitimately has a graph of one — itself. The walker is
      // proven to actually walk by the dedicated test below, not by demanding
      // every entry have dependencies.
      expect(graph.map(rel), "the entry itself must be in its own graph").toContain(rel(entry));

      const offenders = graph
        .filter((f) => DB_IMPORTS.some((needle) => fs.readFileSync(f, "utf8").includes(needle)))
        .map(rel);
      expect(offenders, `these reach the browser bundle via ${importedBy}`).toEqual([]);
    });
  }

  it("T3441 - the walker really follows relative imports (so a clean result means something)", () => {
    // Self-cover, done properly: assert a KNOWN multi-file chain is discovered.
    // Without this, a walker that silently resolved nothing would report every
    // module clean while checking none of them.
    const graph = graphFrom(path.join(LIB, "simulation", "nextSteps.ts")).map(rel);
    expect(graph).toContain("app/lib/simulation/nextSteps.ts");
    expect(graph).toContain("app/lib/simulation/studyRuns.ts");
    expect(graph).toContain("app/lib/simulation/significance.ts");
    expect(graph.length).toBeGreaterThan(3);
  });

  it("T3388 - the check can fail: loadStudyRuns.ts does import the DB, and is kept out of that graph", () => {
    const loader = path.join(LIB, "simulation", "loadStudyRuns.ts");
    const src = fs.readFileSync(loader, "utf8");
    // If this ever stops being true the guard above has nothing to catch, and
    // this test says so rather than quietly weakening.
    expect(DB_IMPORTS.some((needle) => src.includes(needle)), "loadStudyRuns should import the DB").toBe(true);

    const graph = graphFrom(path.join(LIB, "simulation", "nextSteps.ts")).map(rel);
    expect(graph).not.toContain("app/lib/simulation/loadStudyRuns.ts");
  });
});
