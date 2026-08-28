/**
 * Regenerate a value chain's diagram prompts from the master template, in place.
 *
 * Replaces an onerous manual loop: open the Generate Repository Prompts page,
 * upload the `.md`, pick a chain, wait, Copy all, paste somewhere, splice it
 * back — once per chain, nine times. Everything that page does is already a
 * library, so this joins them up and runs headless.
 *
 *   npx tsx scripts/regenerate-chain-prompts.ts --chains V01 --dry-run
 *   npx tsx scripts/regenerate-chain-prompts.ts --chains V01,V02 --concurrency 4
 *   npx tsx scripts/regenerate-chain-prompts.ts --all --types bpmn
 *
 * SAFETY. Each chain is written as it finishes, so a crash keeps completed work
 * and a re-run resumes by naming the chains still to do. Every generated block is
 * parsed back with `parseValueChainMd` before it is stored, and a chain whose
 * prompts do not all parse is REPORTED AND SKIPPED rather than written — a prompt
 * the batch tool cannot read is worse than the old one it would replace.
 *
 * COST. One AI call per prompt: ~15 per chain with every type, ~11 with BPMN
 * only. The eight chains other than V03 are ~93 calls. Concurrency is per-chain
 * across prompts; 4 is a reasonable default against a single API key.
 *
 * The audit line after each chain is the evidence the master template is landing
 * — loop-backs should be 0 and data objects should be non-zero, which is exactly
 * what the template fix in 2.2.2332 was for.
 */
// Load .env the way the app does, so the DATABASE_URL is present and the stored
// template additions are read. Without it the briefing silently falls back to the
// built-in, which is a DIFFERENT prompt than the UI would send.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { chainCodes, chainSection, chainTitle, subprocessHeadings, chainNarrative } from "../app/lib/valueChain/chainSource";
import { type MdPromptType, MD_PROMPT_TYPES, mdPromptCategory, buildMdPromptBriefing, renderPromptBlock } from "../app/lib/valueChain/promptTemplates";
import { generateMdPrompt, targetsFor, type PromptTarget } from "../app/lib/valueChain/generatePrompt";
import { findBlocks, blockKey, blocksOfChain, applyEdits, insertPointFor, auditPrompts, type Edit } from "../app/lib/valueChain/spliceBlocks";
import { parseValueChainMd } from "../app/lib/valueChain/parseValueChainMd";

const REPO_MD = path.join(process.cwd(), "new features", "Process Repository Final.md");
const DEFAULT_MODEL = "claude-sonnet-4-6";

/** Run `jobs` with at most `limit` in flight. Order of results is preserved. */
async function pooled<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * The briefing for a type: the built-in template plus any stored additions.
 *
 * Read from the DB so this produces exactly what the UI would. If the database is
 * unreachable — a laptop without Postgres running — it falls back to the built-in
 * and SAYS SO, rather than silently generating against a different briefing than
 * the app uses.
 */
async function briefings(types: MdPromptType[]): Promise<{ map: Map<MdPromptType, string>; source: string }> {
  const map = new Map<MdPromptType, string>();
  try {
    const { prisma } = await import("../app/lib/db");
    for (const t of types) {
      const row = await prisma.diagramRules.findFirst({
        where: { category: mdPromptCategory(t), isDefault: true }, select: { rules: true },
      });
      map.set(t, buildMdPromptBriefing(t, row?.rules));
    }
    return { map, source: "built-in + stored additions (database)" };
  } catch {
    for (const t of types) map.set(t, buildMdPromptBriefing(t, null));
    return { map, source: "BUILT-IN ONLY — the database was unreachable" };
  }
}

async function run() {
  const argv = process.argv.slice(2);
  const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const dryRun = argv.includes("--dry-run");
  const mdPath = arg("--md") ?? REPO_MD;
  const model = arg("--model") ?? DEFAULT_MODEL;
  const concurrency = Math.max(1, Number(arg("--concurrency") ?? 4));
  const types = (arg("--types") ?? "bpmn").split(",").map((t) => t.trim())
    .filter((t): t is MdPromptType => (MD_PROMPT_TYPES as string[]).includes(t));
  if (types.length === 0) { console.error(`--types must name some of: ${MD_PROMPT_TYPES.join(", ")}`); process.exit(1); }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.error("ANTHROPIC_API_KEY is not set (it is in diagramatix/.env)"); process.exit(1); }

  let doc = fs.readFileSync(mdPath, "utf8");
  // Inserted blocks must match the document's own line endings, or the next
  // findBlocks pass reads them differently from the ones already there.
  const EOL = doc.includes("\r\n") ? "\r\n" : "\n";
  const all = chainCodes(doc);
  const chains = argv.includes("--all") ? all : (arg("--chains") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (chains.length === 0) {
    console.log(`chains in ${path.basename(mdPath)}: ${all.join(" ")}`);
    console.log("pass --chains V01,V02 or --all");
    return;
  }
  const unknown = chains.filter((c) => !all.includes(c));
  if (unknown.length) { console.error(`not in the document: ${unknown.join(", ")}`); process.exit(1); }

  const { map: brief, source } = await briefings(types);
  console.log(`model ${model} · types ${types.join(",")} · concurrency ${concurrency}`);
  console.log(`briefing: ${source}`);
  console.log(`chains: ${chains.join(" ")}${dryRun ? "  (dry run — nothing written)" : ""}\n`);

  let totalCalls = 0, totalWritten = 0;
  for (const chain of chains) {
    const section = chainSection(doc, chain);
    if (!section) { console.error(`${chain}: section not found — skipped`); continue; }
    const title = chainTitle(section);
    const narrative = chainNarrative(section);
    const subs = subprocessHeadings(section, chain);
    if (!narrative.trim()) { console.error(`${chain}: no narrative to generate from — skipped`); continue; }

    // Every prompt of the requested types that the chain SHOULD have. A block
    // that already exists is replaced; one that does not is inserted, so a chain
    // whose prompts have never been generated is handled by the same run.
    const existing = blocksOfChain(findBlocks(doc), chain);
    const have = new Map(existing.map((b) => [blockKey(b), b]));
    const wanted = targetsFor(chain, title, subs, types);
    if (wanted.length === 0) { console.log(`${chain}: nothing to generate for those types — skipped`); continue; }
    const newCount = wanted.filter((t) => !have.has(t.type === "bpmn" ? `BPMN|${t.code}` : labelOf(t))).length;

    const t0 = Date.now();
    process.stdout.write(`${chain} ${title} — ${wanted.length} prompt(s)${newCount ? ` (${newCount} new)` : ""} `);
    const results = await pooled(wanted, concurrency, async (target) => {
      const res = await generateMdPrompt({
        apiKey, model, briefing: brief.get(target.type)!,
        chainCode: chain, chainTitle: title, narrative, subs, target,
      });
      process.stdout.write(res.ok ? (res.roundTrips ? "." : "?") : "x");
      return { target, res };
    });
    totalCalls += wanted.length;

    const failed = results.filter((r) => !r.res.ok);
    const noParse = results.filter((r) => r.res.ok && !r.res.roundTrips);
    console.log(` ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    if (failed.length) console.log(`  FAILED: ${failed.map((f) => f.target.code).join(", ")}`);
    if (noParse.length) console.log(`  DID NOT PARSE BACK: ${noParse.map((f) => f.target.code).join(", ")}`);
    if (failed.length || noParse.length) {
      console.log(`  ${chain} NOT WRITTEN — fix or re-run this chain.\n`);
      continue;
    }

    // Replace where a block exists; insert where it does not. An anchor that
    // cannot be found is REPORTED, never guessed at — a block written to the
    // wrong offset is the failure mode this whole script is careful about.
    const edits: Edit[] = [];
    const written: string[] = [];
    let anchorMissing = 0;
    for (const { target, res } of results) {
      if (!res.ok) continue;
      const key = target.type === "bpmn" ? `BPMN|${target.code}` : labelOf(target);
      const block = have.get(key);
      if (block) {
        edits.push({ start: block.start, end: block.end, text: res.prompt });
      } else {
        const at = insertPointFor(doc, chain, target.type === "bpmn" ? target.code : undefined);
        if (at === null) { console.log(`  no anchor for ${key} — skipped`); anchorMissing++; continue; }
        const body = renderPromptBlock(target.type, res.prompt).replace(/\n/g, EOL);
        edits.push({ start: at, end: at, text: `${EOL}${EOL}${body}${EOL}` });
      }
      written.push(res.prompt);
    }
    if (anchorMissing) { console.log(`  ${chain} NOT WRITTEN — ${anchorMissing} anchor(s) missing.
`); continue; }

    const next = applyEdits(doc, edits);
    const before = parseValueChainMd(doc), after = parseValueChainMd(next);

    // No OTHER chain may change — that is the guard against an edit landing at
    // the wrong offset. THIS chain is expected to change when blocks are being
    // inserted, so its count is checked against what was actually written rather
    // than against what it had.
    const others = after.filter((c) => c.code !== chain
      && (before.find((b) => b.code === c.code)?.diagrams.length ?? -1) !== c.diagrams.length);
    if (others.length) {
      console.log(`  ${chain} NOT WRITTEN — it changed the diagram count of ${others.map((d) => d.code).join(", ")}\n`);
      continue;
    }
    const mineBefore = before.find((c) => c.code === chain)?.diagrams.length ?? 0;
    const mineAfter = after.find((c) => c.code === chain)?.diagrams.length ?? 0;
    const expected = mineBefore + edits.filter((e) => e.start === e.end).length;
    if (mineAfter !== expected) {
      console.log(`  ${chain} NOT WRITTEN — expected ${expected} prompts after the edit, parsed ${mineAfter}\n`);
      continue;
    }
    const emptyAfter = (after.find((c) => c.code === chain)?.diagrams ?? []).filter((d) => !d.prompt.trim());
    if (emptyAfter.length) {
      console.log(`  ${chain} NOT WRITTEN — ${emptyAfter.length} prompt(s) parsed back empty\n`);
      continue;
    }

    const a = auditPrompts(written.join("\n"));
    console.log(`  loop-backs ${a.loopBacks} · standard loops ${a.standardLoops} · merges ${a.mergeGateways}`
      + ` · waits ${a.waitEvents} · section 7 ${a.dataSections} · data objects ${a.dataObjects}`);

    // A loop-back is not a style preference — `R3.14` forbids it and the layout
    // code PRUNES it, so a prompt asking for one produces a diagram whose
    // repetition has silently vanished. The template says so plainly and the
    // model still writes one about once in a hundred prompts, which is exactly
    // the rate that slips through a human reading 93 of them. Refusing the chain
    // costs a re-run; letting it through costs a wrong diagram nobody notices.
    if (a.loopBacks > 0) {
      const offenders = written.filter((t) => auditPrompts(t).loopBacks > 0).length + " prompt(s)";
      console.log(`  ${chain} NOT WRITTEN — ${a.loopBacks} loop-back(s) in ${offenders}. Re-run this chain.\n`);
      continue;
    }

    if (!dryRun) { fs.writeFileSync(mdPath, next); doc = next; }
    totalWritten += written.length;
    console.log(`  ${dryRun ? "would write" : "written"} ${written.length} prompt(s)\n`);
  }

  console.log(`${totalCalls} AI call(s); ${totalWritten} prompt(s) ${dryRun ? "would be " : ""}written.`);
  if (!dryRun) console.log("Review with git diff, then npx tsx scripts/splice-chain-prompts.ts --verify <chain>.");
}

/** The block key for a chain-level target — its label, as the document writes it. */
const labelOf = (t: PromptTarget): string =>
  ({ "value-chain": "Value Chain", context: "Context", "process-context": "Process Context", archimate: "ArchiMate", bpmn: "BPMN" })[t.type];

run().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
