/**
 * Wave G batch 3b — three defects whose symptom appears somewhere else.
 *
 * DATA-33  `version` is the compare-and-swap that protects a diagram's data
 *          (DATA-32). Every server-side writer EXCEPT the editor's own save
 *          left it unchanged — history restore, mining re-discovery on ingest,
 *          project renumber, scan-links, fill-skills, match-lanes, the PCF
 *          upgrade, archive and unarchive, imports. So the work landed, and
 *          the next save from an editor that still held the old version
 *          number passed the CAS and reverted it, silently. The user sees
 *          their own save succeed; the server-side change simply vanishes.
 *
 * ENG-20   The reproduce-original-layout branch returns before the
 *          `containmentCycles` passes, so an image-import plan naming an
 *          expanded subprocess as its own parent was saved with
 *          `parentId === id` — the exact shape those passes exist to break.
 *
 * CANVAS-10 `canvasMemoEqual` skips function props by design, and pan/zoom live
 *          only in Canvas state, so a pan or zoom changes nothing the
 *          comparator inspects: memoised elements keep a closure built with the
 *          previous viewport. The symptoms look like unrelated bugs — a header
 *          click landing on the wrong element, a group drag moving at the wrong
 *          rate after a zoom.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Every .ts under app/, excluding generated client code. */
function sources(dir = join(process.cwd(), "app"), acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "generated" || name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (/\.tsx?$/.test(name)) acc.push(relative(process.cwd(), full).split(sep).join("/"));
  }
  return acc;
}

describe("Wave G — writes that quietly undo each other", () => {
  it("T4439 — DATA-33: every raw SQL writer of Diagram.data also bumps version", () => {
    const offenders: string[] = [];
    for (const file of sources()) {
      const src = read(file);
      if (!/UPDATE "Diagram"/.test(src)) continue;
      // Each UPDATE statement that touches `data` must carry the bump. Split on
      // the statement keyword so one file with several statements is checked
      // per statement rather than as a whole.
      for (const stmt of src.split(/UPDATE "Diagram"/).slice(1)) {
        const head = stmt.slice(0, 400);
        const touchesData = /SET\s+(")?data("| )[^,]*=|"data"\s*=/.test(head);
        if (!touchesData) continue;
        if (!/version = version \+ 1/.test(head)) offenders.push(file);
      }
    }
    expect(
      [...new Set(offenders)],
      "these write Diagram.data without bumping version, so an open editor's next save reverts them",
    ).toEqual([]);
  });

  it("T4440 — DATA-33: the ORM writers of Diagram.data increment version too", () => {
    for (const file of [
      "app/lib/diagram/publishVersion.ts",
      "app/api/import/bpmn/route.ts",
      "app/api/import/visio-v3/route.ts",
      "app/api/ai/generate-bpmn/compare/route.ts",
    ]) {
      const src = read(file);
      expect(src, `${file} sets data through Prisma without incrementing version`).toMatch(
        /version: \{ increment: 1 \}/,
      );
    }
  });

  it("T4441 — ENG-20: the preserved-layout path refuses an element that is its own parent", () => {
    const src = read("app/lib/diagram/bpmnLayout.ts");
    const epParent = src.slice(src.indexOf("const epParent ="), src.indexOf("const epParent =") + 400);
    expect(
      epParent,
      "this branch returns before containmentCycles runs, so it must reject a self-parent itself",
    ).toMatch(/ai\.parentSubprocess !== ai\.id/);
  });

  it("T4442 — CANVAS-10: the coordinate helper and group drag read live pan/zoom, not a captured one", () => {
    const src = read("app/components/canvas/Canvas.tsx");
    const helper = src.slice(src.indexOf("const svgToWorld = useCallback"), src.indexOf("const clientToWorld"));
    expect(helper, "read the current viewport through the refs").toMatch(/panRef\.current/);
    expect(helper, "and the current zoom").toMatch(/zoomRef\.current/);
    expect(helper, "with no dependency on pan/zoom — the comparator skips functions anyway").toMatch(/\[\]\s*\)/);

    // Group drag divides client-pixel deltas by zoom; a captured zoom moves the
    // selection at the wrong rate after the user zooms.
    expect(
      /dx \/ zoom, dy \/ zoom/.test(src),
      "a group-move handler still divides by a captured zoom",
    ).toBe(false);
    expect((src.match(/dx \/ zoomRef\.current, dy \/ zoomRef\.current/g) ?? []).length).toBeGreaterThanOrEqual(8);
  });
});
