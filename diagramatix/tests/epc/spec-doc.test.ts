/**
 * The eEPC specification cannot quietly disagree with the product.
 *
 * A specification is the one document a reader TRUSTS, which makes a stale one
 * worse than none at all: it does not merely fail to help, it asserts something
 * false with authority. So the tables in it are generated from the live code and
 * this file fails the moment the committed copy stops matching.
 *
 * The prose is hand-written and deliberately unchecked — it is argument and
 * rationale, not data, and a test that policed it would only make it timid.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyBlocks, generatedBlocks, SPEC_PATH } from "@/scripts/generate-epc-spec";
import { EPC_DIAGNOSTIC_KINDS } from "@/app/lib/diagram/epcSpecTables";
import { EPC_DESCRIPTIVE_SYMBOLS, PALETTE_BY_DIAGRAM_TYPE } from "@/app/lib/diagram/symbols/definitions";

const doc = () => readFileSync(SPEC_PATH, "utf8").replace(/\r\n/g, "\n");

describe("the specification matches the code", () => {
  it("T4147 - the generated tables are current", () => {
    // The whole arrangement in one assertion: regenerate, and nothing moves.
    const current = doc();
    expect(
      applyBlocks(current, generatedBlocks()),
      `${SPEC_PATH} is stale — run \`npm run spec:epc\``,
    ).toBe(current);
  });

  it("T4148 - every EPC symbol appears in it", () => {
    // A symbol added to the palette and not to the spec is the exact drift this
    // exists to catch, and the generated table makes it impossible — this
    // asserts the table is actually SPLICED IN rather than the markers sitting
    // empty, which is the one way the generator could silently do nothing.
    const d = doc();
    // The palette list also carries the pain-point and review markers every
    // diagram type gets — those are annotations on the canvas, not part of the
    // notation, so the spec has nothing to say about them.
    for (const t of [...PALETTE_BY_DIAGRAM_TYPE.epc, ...EPC_DESCRIPTIVE_SYMBOLS,
                     "epc-xor", "epc-and", "epc-or"].filter((x) => x.startsWith("epc-"))) {
      expect(d, `${t} is missing from the specification`).toContain(`\`${t}\``);
    }
  });

  it("T4149 - the rules table names every diagnostic the layout can report", () => {
    // Both directions. A rule the code checks but the spec omits leaves a reader
    // surprised by a diagnostic they were never told about; a rule the spec
    // claims but the code does not check is a promise nothing keeps — and that
    // one is worse, because it reads as a guarantee.
    const d = doc();
    for (const kind of EPC_DIAGNOSTIC_KINDS) {
      expect(d, `the spec does not mention the "${kind}" diagnostic`).toContain(`\`${kind}\``);
    }
    const layout = readFileSync("app/lib/diagram/layoutEpc.ts", "utf8");
    for (const kind of EPC_DIAGNOSTIC_KINDS) {
      expect(layout, `the spec claims "${kind}" but the layout never reports it`)
        .toContain(`"${kind}"`);
    }
    // And the list itself must be complete: anything layoutEpc reports and this
    // list does not know about would escape both checks above.
    const reported = new Set(
      [...layout.matchAll(/kind: "(epc-[a-z-]+)"/g)].map((m) => m[1]),
    );
    expect([...reported].sort(), "layoutEpc reports a diagnostic the spec list has never heard of")
      .toEqual([...EPC_DIAGNOSTIC_KINDS].sort());
  });

  it("T4154 - the User Guide chapter is seeded on deploy", () => {
    // The chapter lives in the DATABASE, not in the build, so writing the
    // script is only half of shipping it — a seed script that is not in the
    // deploy never reaches prod, and nothing anywhere reports that.
    //
    // The EPC rules had exactly that problem and it went unnoticed:
    // seed-diagram-rules.cjs had never been in the deploy at all, so the "epc"
    // rule set could not reach production however many times it was seeded
    // locally.
    const deploy = readFileSync("../.github/workflows/azure-deploy.yml", "utf8");
    expect(deploy, "add-guide-epc.ts is not run on deploy").toContain("scripts/add-guide-epc.ts");
    expect(deploy, "the default diagram rules are not seeded on deploy").toContain("scripts/seed-diagram-rules.cjs");
    // …and the scripts the deploy names must exist, or the step is a no-op that
    // logs "skipped" and looks fine.
    expect(() => readFileSync("scripts/add-guide-epc.ts", "utf8")).not.toThrow();
    expect(() => readFileSync("scripts/seed-diagram-rules.cjs", "utf8")).not.toThrow();
  });

  it("T4150 - it says the tables are generated, and how to regenerate them", () => {
    // Without this a reader edits a table by hand and their work is silently
    // overwritten on the next run.
    const d = doc();
    expect(d).toMatch(/GENERATED from the code/);
    expect(d).toContain("npm run spec:epc");
  });
});
