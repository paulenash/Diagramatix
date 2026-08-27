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
import { chainSection, chainCodes } from "../app/lib/valueChain/chainSource";

const REPO_MD = path.join(process.cwd(), "new features", "Process Repository Final.md");

/** A prompt block found in a document: its label, its fenced text, and where it sits. */
interface Block {
  label: string;          // "BPMN", "Value Chain", …
  /** For BPMN, the `### V03.02 — …` heading it sits under; null for chain-level. */
  under: string | null;
  /** Absolute offsets of the fence BODY within the source string. */
  start: number;
  end: number;
  text: string;
}

const LABEL_RE = /^\*\*(Value Chain|Context|Process Context|ArchiMate|BPMN) diagram prompt\.\*\*[ \t]*$/gm;

/**
 * Every prompt block in a stretch of markdown, with the subprocess heading each
 * BPMN block belongs to.
 *
 * The heading is what makes BPMN blocks addressable: a chain has one Value Chain
 * prompt but eleven BPMN prompts, and they are told apart only by the `###`
 * heading above them.
 */
function findBlocks(src: string): Block[] {
  const out: Block[] = [];
  const headings: { index: number; text: string }[] = [];
  const h3 = /^###[ \t]+(.+?)[ \t]*$/gm;
  let hm: RegExpExecArray | null;
  while ((hm = h3.exec(src)) !== null) headings.push({ index: hm.index, text: hm[1].trim() });

  LABEL_RE.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LABEL_RE.exec(src)) !== null) {
    const label = lm[1];
    const after = src.slice(lm.index);
    const fence = after.match(/```text[ \t]*\n([\s\S]*?)\n?```/);
    if (!fence || fence.index === undefined) continue;
    const bodyStart = lm.index + fence.index + fence[0].indexOf("\n") + 1;
    const bodyEnd = bodyStart + fence[1].length;
    // The nearest `###` heading ABOVE this label, if any.
    let under: string | null = null;
    for (const h of headings) if (h.index < lm.index) under = h.text; else break;
    out.push({ label, under: label === "BPMN" ? under : null, start: bodyStart, end: bodyEnd, text: fence[1] });
  }
  return out;
}

/** The key a block is matched on: its type, plus the subprocess for BPMN. */
const keyOf = (b: Block): string => (b.label === "BPMN" ? `BPMN|${(b.under ?? "").split(/[—–-]/)[0].trim()}` : b.label);

/** Replace block bodies in `src`, back to front so earlier offsets stay valid. */
function spliceBlocks(src: string, replacements: { block: Block; text: string }[]): string {
  let out = src;
  for (const r of [...replacements].sort((a, z) => z.block.start - a.block.start)) {
    out = out.slice(0, r.block.start) + r.text + out.slice(r.block.end);
  }
  return out;
}

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

  const section = chainSection(doc, chain);
  if (!section) { console.error(`chain ${chain} not found in ${mdPath}`); process.exit(1); }
  const sectionStart = doc.indexOf(section);
  const targets = findBlocks(section).map((b) => ({ ...b, start: b.start + sectionStart, end: b.end + sectionStart }));
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

  const byKey = new Map(targets.map((b) => [keyOf(b), b]));
  const matched: { block: Block; text: string }[] = [];
  const unmatched: string[] = [];
  for (const inc of incoming) {
    const target = byKey.get(keyOf(inc));
    if (!target) { unmatched.push(keyOf(inc)); continue; }
    matched.push({ block: target, text: inc.text });
  }
  const missing = targets.filter((t) => !matched.some((m) => m.block === t)).map(keyOf);

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
