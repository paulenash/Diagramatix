import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  findBlocks, blockKey, blocksOfChain, spliceBlocks, auditPrompts,
} from "@/app/lib/valueChain/spliceBlocks";

const REPO_MD = path.join(process.cwd(), "new features", "Process Repository Final.md");

/** A miniature repository document, in whichever line ending is asked for. */
const doc = (eol: string) => [
  "## V10 — Market to Lead",
  "",
  "**Teams and roles involved.**",
  "Marketing and Sales.",
  "",
  "**Value Chain diagram prompt.**",
  "",
  "```text",
  "Value Chain V10 - Market to Lead",
  "V10.01. Plan Campaign",
  "```",
  "",
  "### V10.01 — Plan Campaign",
  "",
  "**BPMN diagram prompt.**",
  "",
  "```text",
  "BPMN: V10.01 Plan Campaign.",
  "",
  "1. Pools & Lanes",
  "```",
  "",
  "### V10.02 — Capture Response",
  "",
  "**BPMN diagram prompt.**",
  "",
  "```text",
  "BPMN: V10.02 Capture Response.",
  "```",
  "",
  "## V11 — Sign to Onboard",
  "",
  "**BPMN diagram prompt.**",
  "",
  "```text",
  "BPMN: V11 something else entirely.",
  "```",
  "",
].join(eol);

/**
 * T2899 — the splice that rewrites the repository document.
 *
 * This is the code that edits a 9,500-line file in place, and its failures are
 * SILENT: a block written a character out of position still produces a file of
 * the same length that mostly looks right, and the batch tool simply stops seeing
 * that prompt. So the guarantee it has to carry is an identity: replacing every
 * block with its OWN text must return the file byte-for-byte.
 *
 * Both line endings are exercised deliberately. The repository `.md` is LF in the
 * repo and git's autocrlf rewrites the working copy to CRLF, so both are real —
 * and the bug this test was written for was exactly that. `chainSection()`
 * normalises endings, so on a CRLF copy its return value did not occur in the
 * document, `indexOf` gave -1, and every offset shifted by minus one.
 */
describe("Repository prompt blocks", () => {
  for (const [name, eol] of [["LF", "\n"], ["CRLF", "\r\n"]] as const) {
    describe(name, () => {
      const src = doc(eol);

      it(`finds every block and tags it with its chain (${name})`, () => {
        const blocks = findBlocks(src);
        expect(blocks.map(blockKey)).toEqual([
          "Value Chain", "BPMN|V10.01", "BPMN|V10.02", "BPMN",
        ]);
        expect(blocks.map((b) => b.chain)).toEqual(["V10", "V10", "V10", "V11"]);
      });

      it(`extracts the prompt text without the fence (${name})`, () => {
        const bpmn = findBlocks(src).find((b) => blockKey(b) === "BPMN|V10.01")!;
        expect(bpmn.text).toContain("BPMN: V10.01 Plan Campaign.");
        expect(bpmn.text).toContain("1. Pools & Lanes");
        expect(bpmn.text).not.toContain("```");
        expect(bpmn.text).not.toContain("diagram prompt");
      });

      it(`replacing every block with its own text is byte-identical (${name})`, () => {
        const blocks = findBlocks(src);
        const same = spliceBlocks(src, blocks.map((b) => ({ block: b, text: b.text })));
        expect(same).toBe(src);
      });

      it(`replaces only the named chain, leaving the rest untouched (${name})`, () => {
        const blocks = findBlocks(src);
        const target = blocksOfChain(blocks, "V10").find((b) => blockKey(b) === "BPMN|V10.01")!;
        const next = spliceBlocks(src, [{ block: target, text: "REPLACED" }]);
        expect(next).toContain("REPLACED");
        expect(next).toContain("BPMN: V10.02 Capture Response.");
        expect(next).toContain("BPMN: V11 something else entirely.");
        expect(next).toContain("Marketing and Sales.");
        // Every block still parses out, and only the one changed.
        const after = findBlocks(next);
        expect(after.map(blockKey)).toEqual(blocks.map(blockKey));
        expect(after.find((b) => blockKey(b) === "BPMN|V10.01")!.text).toBe("REPLACED");
      });

      it(`splices several blocks at once without disturbing each other's offsets (${name})`, () => {
        const blocks = findBlocks(src);
        const next = spliceBlocks(src, blocks.map((b, i) => ({ block: b, text: `NEW ${i} ${"x".repeat(i * 40)}` })));
        const after = findBlocks(next);
        expect(after.map(blockKey)).toEqual(blocks.map(blockKey));
        after.forEach((b, i) => expect(b.text).toBe(`NEW ${i} ${"x".repeat(i * 40)}`));
      });
    });
  }

  it("is lossless over every chain of the real repository document", () => {
    // The document as it actually sits on disk, whatever git left its endings as.
    const src = fs.readFileSync(REPO_MD, "utf8");
    const blocks = findBlocks(src);
    expect(blocks.length, "the real document must have prompts to check").toBeGreaterThan(100);
    expect(new Set(blocks.map((b) => b.chain)).size).toBe(26);
    for (const chain of new Set(blocks.map((b) => b.chain))) {
      const own = blocksOfChain(blocks, chain!);
      const same = spliceBlocks(src, own.map((b) => ({ block: b, text: b.text })));
      expect(same, `re-splicing ${chain}'s own prompts must change nothing`).toBe(src);
    }
  });

  it("audits the signals the master-template fix was for", () => {
    const a = auditPrompts([
      'Expanded Subprocess "Repeat Until Done" (standard loop) containing:',
      'Exclusive merge gateway "Order complete"',
      'Intermediate message catch event "Customer responds"',
      "7. Data objects",
      'Data Object "Order" — written by "Capture order"',
      'Data Store "Ledger" — read by "Post entry"',
    ].join("\n"));
    expect(a).toEqual({
      loopBacks: 0, standardLoops: 1, mergeGateways: 1,
      waitEvents: 1, dataSections: 1, dataObjects: 2,
    });
    // And it still notices the shape the template used to ask for.
    expect(auditPrompts('then back to "Capture order details"').loopBacks).toBe(1);
  });
});
