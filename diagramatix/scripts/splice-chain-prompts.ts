/**
 * Splice regenerated diagram prompts back into a Process Repository `.md`.
 *
 * The manual half of the loop that "Generate Repository Prompts" leaves open:
 * that tool produces a chain's prompt blocks, and until the library lands in the
 * database (Phase 4) somebody has to paste 15 of them into a 9,500-line file.
 * Doing that by hand is where a stray fence or a half-replaced block gets in, and
 * the failure is SILENT — the batch tool simply stops seeing that prompt.
 *
 * WHAT IT REPLACES, AND WHAT IT WILL NOT TOUCH. Only the fenced block under a
 * `**<Type> diagram prompt.**` label inside the named chain's section. Narrative,
 * headings, every other chain, and the labels themselves are left byte-identical.
 * A prompt in the input with no matching block in the document is REPORTED, never
 * appended — appending would put a prompt somewhere the parser reads it as
 * belonging to the wrong diagram.
 *
 * HOW IT IS PROVED. `--verify` re-assembles the document's OWN existing prompts
 * in the generator's output format and splices them back: the result must be
 * byte-identical to the file it started from. That is a real test of the splice
 * rather than an inspection of one diff — if the matcher is off by a line, or a
 * fence boundary is wrong, the bytes differ and it says so.
 *
 *   npx tsx scripts/splice-chain-prompts.ts --verify V03
 *   npx tsx scripts/splice-chain-prompts.ts --chain V03 --in ~/Downloads/V03-prompts.md --dry-run
 *   npx tsx scripts/splice-chain-prompts.ts --chain V03 --in ~/Downloads/V03-prompts.md
 */
import fs from "node:fs";
import path from "node:path";
import { parseValueChainMd } from "../app/lib/valueChain/parseValueChainMd";
import { chainCodes } from "../app/lib/valueChain/chainSource";
import {
  type PromptBlock, findBlocks, blockKey, blocksOfChain, spliceBlocks,
} from "../app/lib/valueChain/spliceBlocks";

const REPO_MD = path.join(process.cwd(), "new features", "Process Repository Final.md");

function run() {
  const argv = process.argv.slice(2);
  const arg = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const verifyChain = argv.includes("--verify") ? argv[argv.indexOf("--verify") + 1] : undefined;
  const chain = verifyChain ?? arg("--chain");
  const dryRun = argv.includes("--dry-run");
  const mdPath = arg("--md") ?? REPO_MD;

  const doc = fs.readFileSync(mdPath, "utf8");
  if (!chain) {
    console.log(`chains in ${path.basename(mdPath)}: ${chainCodes(doc).join(" ")}`);
    console.log("pass --chain V03 --in <generated.md>, or --verify V03");
    return;
  }

  // Blocks are found over the WHOLE document and filtered — never over a sliced
  // section, whose offsets cannot be mapped back reliably (see findBlocks).
  const targets = blocksOfChain(findBlocks(doc), chain);
  if (targets.length === 0) {
    console.error(`chain ${chain} has no prompt blocks in ${mdPath} — chains present: ${chainCodes(doc).join(" ")}`);
    process.exit(1);
  }
  console.log(`${chain}: ${targets.length} existing prompt block(s) in the document`);

  // Where the incoming prompts come from: a generated file, or — for --verify —
  // the document's own blocks re-emitted in the generator's output format.
  let incomingSrc: string;
  if (verifyChain) {
    incomingSrc = targets.map((b) =>
      (b.label === "BPMN" ? `### ${b.under}\n\n` : "") +
      `**${b.label} diagram prompt.**\n\n\`\`\`text\n${b.text}\n\`\`\``).join("\n\n");
  } else {
    const inPath = arg("--in");
    if (!inPath) { console.error("--in <generated .md> is required"); process.exit(1); }
    // Normalise the INCOMING file only. Text copied out of a browser arrives
    // CRLF, and the label/fence regexes are line-anchored, so without this every
    // block silently fails to match and the splice reports "incoming: 0" — which
    // looks like an empty clipboard rather than a line-ending mismatch. The
    // DOCUMENT is deliberately left untouched: its byte offsets are what the
    // splice writes against, and normalising it would shift every one of them.
    incomingSrc = fs.readFileSync(inPath.replace(/^~/, process.env.USERPROFILE ?? "~"), "utf8")
      .replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  const incoming = findBlocks(incomingSrc);
  console.log(`incoming: ${incoming.length} prompt block(s)`);

  const byKey = new Map(targets.map((b) => [blockKey(b), b]));
  const matched: { block: PromptBlock; text: string }[] = [];
  const unmatched: string[] = [];
  for (const inc of incoming) {
    const target = byKey.get(blockKey(inc));
    if (!target) { unmatched.push(blockKey(inc)); continue; }
    matched.push({ block: target, text: inc.text });
  }
  const missing = targets.filter((t) => !matched.some((m) => m.block === t)).map(blockKey);

  console.log(`matched ${matched.length}`);
  if (unmatched.length) console.log(`  NOT IN THE DOCUMENT (skipped, never appended): ${unmatched.join(", ")}`);
  if (missing.length) console.log(`  IN THE DOCUMENT BUT NOT REGENERATED (left as-is): ${missing.join(", ")}`);

  const next = spliceBlocks(doc, matched);

  if (verifyChain) {
    const identical = next === doc;
    console.log(identical
      ? `\nVERIFY PASSED — splicing ${chain}'s own prompts back in is byte-identical.`
      : `\nVERIFY FAILED — the splice is not lossless (${doc.length} -> ${next.length} bytes).`);
    process.exit(identical ? 0 : 1);
  }

  // The prompts must still be readable by the batch tool afterwards.
  const before = parseValueChainMd(doc);
  const after = parseValueChainMd(next);
  console.log(`\nparse check: ${before.length} chains before, ${after.length} after`);
  for (const c of after) {
    const b = before.find((x) => x.code === c.code);
    const flag = b && b.diagrams.length !== c.diagrams.length ? "  <-- COUNT CHANGED" : "";
    console.log(`  ${c.code} ${c.diagrams.length} diagram prompt(s)${flag}`);
  }
  const empty = after.flatMap((c) => c.diagrams.filter((d) => !d.prompt.trim()).map((d) => d.name));
  if (empty.length) { console.error(`\nREFUSING TO WRITE — empty prompts after splice: ${empty.join(", ")}`); process.exit(1); }

  if (dryRun) { console.log(`\n--dry-run — nothing written (${doc.length} -> ${next.length} bytes).`); return; }
  fs.writeFileSync(mdPath, next);
  console.log(`\nWritten: ${path.basename(mdPath)} (${doc.length} -> ${next.length} bytes). Review with git diff.`);
}

run();
