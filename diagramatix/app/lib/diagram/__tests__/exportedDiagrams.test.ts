/**
 * Checks real exported diagrams.
 *
 * WORKFLOW: export a diagram from the app (File → Export JSON), drop the
 * `.json` into  app/lib/diagram/__tests__/fixtures/  and run `npm test`.
 * Every diagram in every fixture is run through the structural checker and
 * the test fails listing any violations — a fast way to vet AI-generated
 * output without the app or the API.
 *
 * The folder may be empty (this suite then simply passes). Fixtures are git-
 * ignored by default — see fixtures/README.md.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractDiagrams } from "../checks/loadExport";
import { checkDiagram, formatViolations } from "../checks/diagramChecks";

const FIXTURE_DIR = join(__dirname, "fixtures");

function jsonFixtures(): string[] {
  try {
    return readdirSync(FIXTURE_DIR).filter((f) => f.toLowerCase().endsWith(".json"));
  } catch {
    return [];
  }
}

const files = jsonFixtures();

describe("exported diagram fixtures", () => {
  if (files.length === 0) {
    it("no fixtures to check (drop a .json export into fixtures/)", () => {
      expect(true).toBe(true);
    });
    return;
  }

  for (const file of files) {
    const diagrams = extractDiagrams(JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")));
    for (const d of diagrams) {
      it(`${file} → "${d.name}" has no structural violations`, () => {
        const violations = checkDiagram(d);
        expect(violations.length, `\n${file} → ${d.name}:\n${formatViolations(violations)}\n`).toBe(0);
      });
    }
  }
});
