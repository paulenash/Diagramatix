/**
 * Rewrite the generated tables in docs/eEPC-specification.md from the live code.
 *
 *   npm run spec:epc
 *
 * The prose is hand-written and untouched; only the blocks between
 * `<!-- GENERATED:name -->` and `<!-- /GENERATED:name -->` are replaced.
 *
 * `tests/epc/spec-doc.test.ts` fails when the committed document does not match
 * what this produces, so a symbol added without regenerating is caught rather
 * than leaving a specification that quietly disagrees with the product.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  renderCoreSymbolTable,
  renderDescriptiveSymbolTable,
  renderConversionTable,
} from "../app/lib/diagram/epcSpecTables";

export const SPEC_PATH = "docs/eEPC-specification.md";

/** Name → the markdown that belongs between its markers. */
export function generatedBlocks(): Record<string, string> {
  return {
    "core-symbols": renderCoreSymbolTable(),
    "descriptive-symbols": renderDescriptiveSymbolTable(),
    conversion: renderConversionTable(),
  };
}

/**
 * Splice the generated blocks into `doc`. Throws when a marker is missing —
 * silently producing a document with a table absent is exactly the failure this
 * whole arrangement exists to prevent.
 */
export function applyBlocks(doc: string, blocks: Record<string, string>): string {
  let out = doc;
  for (const [name, body] of Object.entries(blocks)) {
    const open = `<!-- GENERATED:${name} -->`;
    const close = `<!-- /GENERATED:${name} -->`;
    const start = out.indexOf(open);
    const end = out.indexOf(close);
    if (start < 0 || end < 0 || end < start) {
      throw new Error(`${SPEC_PATH}: missing or malformed markers for "${name}"`);
    }
    out = out.slice(0, start + open.length) + "\n" + body + "\n" + out.slice(end);
  }
  return out;
}

function main() {
  const before = readFileSync(SPEC_PATH, "utf8");
  const crlf = before.includes("\r\n");
  const normalised = crlf ? before.replace(/\r\n/g, "\n") : before;
  const after = applyBlocks(normalised, generatedBlocks());
  if (after === normalised) {
    console.log(`${SPEC_PATH} is already current.`);
    return;
  }
  writeFileSync(SPEC_PATH, crlf ? after.replace(/\n/g, "\r\n") : after);
  console.log(`${SPEC_PATH} regenerated.`);
}

// Only when run directly, so the test can import the helpers above.
if (process.argv[1] && /generate-epc-spec/.test(process.argv[1])) main();
