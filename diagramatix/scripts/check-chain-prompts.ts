/**
 * Are a value chain's stored BPMN prompts drawable?
 *
 * The Process Repository screen shows this per prompt as a badge, but the badge
 * is easy to misread against the regeneration table beside it: that table's
 * "ok" means the prompt PARSES BACK, which is a different question from whether
 * what it asks for can be drawn. A prompt can round-trip perfectly and still
 * mount a boundary event on an event (Paul, 2026-09-03, V22.07).
 *
 * So this reads the rows the generator actually wrote and runs both
 * deterministic checkers over them. No AI call, no writes, no cost.
 *
 *   npx tsx scripts/check-chain-prompts.ts V22
 *   npx tsx scripts/check-chain-prompts.ts            # every chain, one line each
 *
 * It reports on WHICHEVER DATABASE `DATABASE_URL` names, which is the point of
 * running it: a chain regenerated on prod leaves the local copy stale, and the
 * two then disagree silently.
 */
import * as fs from "fs";
import { checkPromptShapes } from "@/app/lib/valueChain/checkPromptShapes";
import { checkPromptBranches } from "@/app/lib/valueChain/checkPromptBranches";
import { looksTruncated } from "@/app/lib/valueChain/checkPromptTruncated";

// `.env` by hand — dotenv is not a dependency, and adding one for a diagnostic
// script would be the wrong trade.
if (!process.env.DATABASE_URL && fs.existsSync(".env")) {
  const m = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (m) process.env.DATABASE_URL = m[1];
}

async function main() {
  const { prisma } = await import("@/app/lib/db");
  const only = process.argv[2];
  const chains = await prisma.valueChainLibrary.findMany({
    where: only ? { code: only } : undefined,
    orderBy: { code: "asc" },
    include: { prompts: { orderBy: { processCode: "asc" } } },
  });
  if (chains.length === 0) { console.log(only ? `no ${only} in this database` : "no chains"); return; }

  let grand = 0;
  for (const chain of chains) {
    const bpmn = chain.prompts.filter((p) => p.type === "bpmn");
    const found = bpmn.map((p) => ({
      code: p.processCode ?? "",
      chars: p.prompt.length,
      at: p.generatedAt ? new Date(p.generatedAt).toISOString().slice(0, 16).replace("T", " ") : "—",
      shapes: checkPromptShapes(p.prompt),
      branches: checkPromptBranches(p.prompt),
      cut: looksTruncated(p.prompt),
    }));
    const bad = found.reduce((n, f) => n + f.shapes.length + f.branches.length + (f.cut ? 1 : 0), 0);
    grand += bad;

    if (only) {
      console.log(`${chain.code} — ${chain.title}   ${bpmn.length} BPMN prompts`);
      for (const f of found) {
        const flag = f.cut ? "TRUNCATED"
          : f.shapes.length + f.branches.length === 0
          ? "clean" : `${f.shapes.length} undrawable, ${f.branches.length} open`;
        console.log(`  ${f.code.padEnd(7)} ${String(f.chars).padStart(6)} ch  ${f.at}  ${flag}`);
        if (f.cut) console.log(`        ! truncated: ${f.cut}`);
        for (const s of f.shapes) console.log(`        ! ${s.kind}: ${s.detail.slice(0, 100)}`);
        for (const b of f.branches) console.log(`        ! branch "${b.condition}" -> ${b.body.slice(0, 70) || "(nothing)"}`);
      }
    } else {
      const newest = found.map((f) => f.at).sort().pop() ?? "—";
      console.log(`${chain.code}  ${String(bpmn.length).padStart(2)} prompts  last generated ${newest}  ${bad === 0 ? "clean" : `${bad} issue(s)`}`);
    }
  }
  console.log(grand === 0 ? "\nALL CLEAN" : `\n${grand} issue(s) across ${chains.length} chain(s)`);
  await prisma.$disconnect();
}
main();
