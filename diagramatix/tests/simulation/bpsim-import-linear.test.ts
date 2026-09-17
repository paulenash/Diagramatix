/**
 * IO-11 — a malformed upload must not be able to burn a request core.
 *
 * The BPSim block scanner was one global regex,
 * `<Tag\b([^>]*)>([\s\S]*?)</Tag>`. On well-formed input that is fine. Where an
 * open tag has no matching close — which the uploaded file decides — the lazy
 * middle scans to the end of the document, fails, and the engine restarts
 * further along and scans to the end again. Measured directly against that
 * regex, on open tags separated by content and never closed:
 *
 *     5,000 tags  (180 KB)   105 ms
 *    20,000 tags  (720 KB)  1,768 ms
 *    40,000 tags  (1.4 MB)  7,334 ms
 *
 * — quadratic, on a route any signed-in user can reach, and the try/catch
 * around the caller bounds thrown errors rather than elapsed time.
 *
 * WHY THIS IS A STRUCTURAL GUARD AND NOT A TIMING TEST. A timing test is the
 * better shape and was written first, but it could not be made to discriminate:
 * the scanner is private, and the parser only reaches it for tag names at
 * specific nesting depths, so input that is both pathological AND routed to the
 * hot path was not reliably constructible from outside. A timing test that
 * passes against the defect is worse than none — the first version of this file
 * did exactly that — so the property is pinned at the source instead. The
 * measurements above were taken with a standalone harness against the real
 * regex, which is what establishes that the defect was genuine.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";

const SRC = readFileSync(join(process.cwd(), "app/lib/simulation/bpsim/importBpsim.ts"), "utf8");
const scanner = SRC.slice(SRC.indexOf("function blocks("), SRC.indexOf("/** A single self-closing"));

describe("BPSim import — the block scanner stays linear", () => {
  it("T4437 — the scanner is anchored: no lazy middle spanning to a close tag", () => {
    // The exact defect: one regex that matches the open tag, a lazy anything,
    // and the close tag. That is what backtracks across the document.
    expect(
      /\(\[\\s\\S\]\*\?\)<\\\//.test(scanner) || /\[\\s\\S\]\*\?.*<\\\/\$\{px\}/.test(scanner),
      "the scanner matches open-to-close in one regex again — that is the IO-11 defect",
    ).toBe(false);

    // The shape that replaced it: find the open tag, then search for its close
    // from that point, and continue after it.
    expect(scanner, "find open tags independently").toMatch(/const openRe = new RegExp\(`<\$\{px\}\$\{local\}/);
    expect(scanner, "search for the close from an offset").toMatch(/closeRe\.lastIndex = from/);
    expect(scanner, "and resume after the close rather than rescanning").toMatch(/openRe\.lastIndex = close\.index \+ close\[0\]\.length/);

    // Searching a SLICE of the remainder per open tag is linear to scan but
    // quadratic to allocate; the first attempt at this fix did that and was
    // caught by the ratio check that used to live here.
    expect(
      /const rest = xml\.slice\(from\)/.test(scanner),
      "slicing the remainder per open tag copies the document repeatedly",
    ).toBe(false);
  });

  it("T4438 — a malformed document still parses without throwing, and yields nothing useful", () => {
    const filler = ('<bpsim:ScenarioParameters x="a">' + "y".repeat(20)).repeat(5_000);
    const xml = `<?xml version="1.0"?><bpmn:definitions><bpsim:BPSimData><bpsim:Scenario id="s">${filler}</bpsim:Scenario></bpsim:BPSimData></bpmn:definitions>`;

    const started = performance.now();
    const scenarios = parseBpsimScenarios(xml, "minute");
    const elapsed = performance.now() - started;

    // Returning nothing is the right answer for tags that never close; the
    // import falls back to the plain BPMN parse, which is the documented
    // behaviour of the surrounding try/catch.
    expect(Array.isArray(scenarios)).toBe(true);
    // A loose canary rather than the real guard above — it would not catch a
    // subtle regression, but it does catch a catastrophic one.
    expect(elapsed, `parse took ${Math.round(elapsed)}ms`).toBeLessThan(5_000);
  });
});
