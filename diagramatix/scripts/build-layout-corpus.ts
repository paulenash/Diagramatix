/**
 * Build the layout regression corpus: real AI plans, captured once, replayed free.
 *
 * Paul, 2026-09-03, on scanning whatever happened to be in Downloads: "Many are
 * superseded and not retestable because the version and prompt structure has
 * changed." He was right, and the deeper problem is that a number measured over
 * a mixed-vintage set cannot tell you whether it moved because of your change or
 * because of which files were in the set.
 *
 * So: generate from the CURRENT repository prompts, once, and store the AI
 * PLANS. The plan is the expensive half; the layout is the half under test.
 * Everything afterwards — every re-scan, every attempt at a placement rule —
 * replays those plans offline, in seconds, for nothing, and compares like with
 * like.
 *
 *   npx tsx scripts/build-layout-corpus.ts --list          # what it would do
 *   npx tsx scripts/build-layout-corpus.ts --all           # one process per chain
 *   npx tsx scripts/build-layout-corpus.ts --chains V01,V02
 *
 * Writes tests/fixtures/layout-corpus/<code>.plan.json. Regenerate deliberately
 * when the prompt structure changes — that is the point at which the corpus
 * would otherwise start drifting out of date the way Downloads did.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../app/lib/db";
import { planBpmn } from "../app/lib/ai/planBpmn";
import { loadAiRulesForType } from "../app/lib/ai/loadAiRules";
import { splitRulesByEnforcement } from "../app/lib/ai/splitRules";
import { aiApiKey } from "../app/lib/ai/anthropicClient";

const OUT_DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const listOnly = argv.includes("--list");
  const chosen = (arg("--chains") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  // --list with no selection means "show me everything you would do".
  const wanted = argv.includes("--all") || (listOnly && chosen.length === 0) ? null : chosen;
  if (!listOnly && wanted && wanted.length === 0) {
    console.log("pass --all, --chains V01,V02, or --list");
    process.exit(1);
  }

  // One BPMN prompt per chain — the FIRST process, so the choice is stable and
  // nobody has to curate a list. Breadth across 26 chains beats depth in one.
  const chains = await prisma.valueChainLibrary.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      code: true, title: true,
      prompts: { where: { type: "bpmn" }, orderBy: { processCode: "asc" },
                 select: { processCode: true, name: true, prompt: true } },
    },
  });
  const picks = chains
    .filter((c) => c.prompts.length > 0)
    .filter((c) => !wanted || wanted.includes(c.code))
    .map((c) => ({ chain: c.code, ...c.prompts[0] }));

  if (picks.length === 0) {
    console.log("nothing to do — is the repository imported into this database?");
    process.exit(1);
  }
  console.log(`${picks.length} prompt(s), one per chain:`);
  for (const p of picks) console.log(`   ${p.processCode.padEnd(8)} ${p.name}`);
  if (listOnly) { console.log("\n--list only, nothing generated."); return; }

  const model = process.env.LAYOUT_CORPUS_MODEL ?? "claude-sonnet-4-6";
  const apiKey = aiApiKey(model);
  if (!apiKey) { console.error(`no API key for ${model}`); process.exit(1); }
  const rules = splitRulesByEnforcement(await loadAiRulesForType("bpmn")).aiRules;

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let ok = 0, failed = 0;
  for (const p of picks) {
    const t0 = Date.now();
    try {
      const res = await planBpmn({ apiKey, prompt: p.prompt, rules, model });
      if (!res.ok) { console.log(`  ${p.processCode} FAILED — ${res.error}`); failed++; continue; }
      const file = path.join(OUT_DIR, `${p.processCode}.plan.json`);
      fs.writeFileSync(file, JSON.stringify({
        processCode: p.processCode, name: p.name, chain: p.chain,
        model: res.model, capturedAt: new Date().toISOString(),
        plan: res.plan,
      }, null, 2));
      ok++;
      console.log(`  ${p.processCode} ${String(res.plan.elements.length).padStart(3)} el / ${String(res.plan.connections.length).padStart(3)} conn  ${Date.now() - t0}ms`);
    } catch (e) {
      failed++;
      console.log(`  ${p.processCode} ERROR — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\n${ok} captured, ${failed} failed → ${path.relative(process.cwd(), OUT_DIR)}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
