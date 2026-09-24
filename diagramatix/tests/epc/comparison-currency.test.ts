/**
 * The competitor comparison is a SALES document, and a sales document that
 * overstates is a liability rather than an embarrassment — somebody quotes it in
 * a room where being wrong costs the deal.
 *
 * Most of it is prose and judgement and cannot be tested. Three things in it are
 * FACTS ABOUT THE CODEBASE, though, and those went stale without anyone noticing:
 * it claimed "all 7 notations" when there were nine, and named a product version
 * two releases behind. This file pins exactly those.
 *
 * It deliberately does NOT police the argument. A test that graded the
 * positioning would only make it timid, and the positioning is the part a person
 * has to own.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PRODUCT_VERSION, SCHEMA_VERSION } from "@/app/lib/diagram/types";
import { PALETTE_BY_DIAGRAM_TYPE } from "@/app/lib/diagram/symbols/definitions";
import { EDITABLE_DIAGRAM_TYPE_KEYS } from "@/app/lib/diagram/diagramTypeStyles";

/**
 * The CURRENT edition. The folder keeps the older ones (2026-07, 2026-08 and the
 * three-competitor 2026-09) as dated archives, and this guard deliberately
 * follows the live document rather than the archive — a stale claim only costs a
 * deal in the version somebody is quoting from. Re-point this when a new edition
 * supersedes it. (2026-09-24: Pega, Appian and Microsoft added, so the file name
 * changed.)
 */
const DOC = "../competitors/diagramatix-vs-signavio-aris-primebpm-pega-appian-microsoft-2026-09-24.md";
const doc = () => readFileSync(DOC, "utf8");
/** The feature guide is the same kind of document and makes the same claim, so it is pinned too. */
const FEATURES_DOC = "../competitors/diagramatix-features-2026-09.md";
const featuresDoc = () => readFileSync(FEATURES_DOC, "utf8");

/** Spelled out, because that is how the document writes it. */
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven",
  "eight", "nine", "ten", "eleven", "twelve"] as const;

describe("the comparison's claims about US are current", () => {
  it("T4151 - the notation count matches the diagram types that exist", () => {
    // This is the one that was already wrong: "all 7 notations" survived the
    // flowchart shipping and then EPC shipping, because nothing looked.
    //
    // Count the CANONICAL types, not the palette. `basic` is a retired type
    // kept only as an alias so diagrams saved under it still open — it maps to
    // `context` (canonicalDiagramTypeKey), has no entry of its own in the type
    // styles, and must never be offered or counted as a notation we sell
    // (Paul, 2026-09-16). Counting palette keys said ten and made the document
    // overstate by one. The palette is still cross-checked below, so a genuinely
    // new notation cannot ship without this count moving.
    const count = EDITABLE_DIAGRAM_TYPE_KEYS.length;
    expect(
      Object.keys(PALETTE_BY_DIAGRAM_TYPE).filter((k) => k !== "basic").sort(),
      "every canonical diagram type has a palette, and the palette has no type the styles do not know",
    ).toEqual([...EDITABLE_DIAGRAM_TYPE_KEYS].sort());
    const word = WORDS[count] ?? String(count);
    const d = doc();
    expect(
      d,
      `the comparison should say "${word} notations" — there are ${count} diagram types`,
    ).toContain(`${word} notations`);
    // …and no OTHER count may be claimed anywhere in it, SPELLED OUT OR IN
    // DIGITS. The first version looked only for words, and a second stale
    // claim ("Text → 7 notations") sat two sections away unnoticed. Only
    // NUMBER words count — "Target notations from AI" is a table header, not
    // a claim about how many there are.
    const numberish = new RegExp(`\\b(${WORDS.join("|")}|\\d+) notations`, "gi");
    const claimed = [...d.matchAll(numberish)].map((m) => m[1].toLowerCase());
    const wrong = [...new Set(claimed)].filter((c) => c !== word && c !== String(count));
    expect(wrong, "the comparison claims a notation count that is not the real one")
      .toEqual([]);

    // The feature guide is the same liability and went out with the same wrong
    // number (2026-09-16). Pin it the same way, in both spellings.
    const f = featuresDoc();
    expect(f, `the feature guide should say "${word} notations" — there are ${count}`)
      .toContain(`${word} notations`);
    const fClaimed = [...f.matchAll(numberish)].map((m) => m[1].toLowerCase());
    const fWrong = [...new Set(fClaimed)].filter((c) => c !== word && c !== String(count));
    expect(fWrong, "the feature guide claims a notation count that is not the real one")
      .toEqual([]);
    // And it must not list the retired `basic` type among the notations it sells.
    expect(f, "the feature guide still lists the retired Basic type")
      .not.toMatch(/Process Context and Basic|Context · Basic|and \*\*Basic\*\* diagrams/);
  });

  it("T4152 - the version stamp is the version that shipped", () => {
    const d = doc();
    expect(d, `the stamp should read product ${PRODUCT_VERSION}`)
      .toContain(`product ${PRODUCT_VERSION}`);
    expect(d, `the stamp should read SCHEMA_VERSION ${SCHEMA_VERSION}`)
      .toContain(`SCHEMA_VERSION ${SCHEMA_VERSION}`);

    // The document names the version in TWO places — the header and the
    // sources. `toContain` is satisfied by either, so updating one and missing
    // the other passed. Every claim has to agree.
    const versions = [...d.matchAll(/product (\d+\.\d+)/g)].map((m) => m[1]);
    expect([...new Set(versions)], "the comparison claims more than one product version")
      .toEqual([PRODUCT_VERSION]);
    const schemas = [...d.matchAll(/SCHEMA_VERSION (\d+)/g)].map((m) => m[1]);
    expect([...new Set(schemas)], "the comparison claims a schema version that did not ship")
      .toEqual([SCHEMA_VERSION]);
  });

  it("T4153 - EPC is claimed on our side of the table, not ARIS's alone", () => {
    // The row that moved. A comparison still listing EPC as a reason to stay on
    // ARIS is the most expensive kind of stale: it argues the customer out of
    // the thing we just built.
    const d = doc();
    expect(d).toContain("**EPC (eEPC)**");
    expect(d).toContain("**ARIS AML** model import");
    expect(d, "EPC must be gone from ARIS's 'where they still win' line")
      .not.toMatch(/- \*\*ARIS:\*\* EPC \+ broad notation set/);
    expect(d, "EPC must be gone from 'where not to compete'")
      .not.toContain("**EPC + EA repository breadth**");
  });
});
