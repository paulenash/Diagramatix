/**
 * Attribute the existing repository prompts to the model that wrote them.
 *
 *   npx tsx scripts/backfill-prompt-model.ts --list      # what it would do
 *   npx tsx scripts/backfill-prompt-model.ts --apply
 *
 * `ValueChainPrompt.model` records which AI model wrote a prompt. It arrived
 * after the prompts did, so every existing row is null — and null means
 * genuinely unknown, which for an imported chain it will always be.
 *
 * Paul, 2026-09-06: "Assume Opus 5 for all currently published Value Chains."
 * That is his call and it is a sound one: the default was set to Opus 5 for both
 * prompts and diagrams after Haiku was measured giving about a third of the
 * content, and everything currently PUBLISHED was regenerated after that.
 *
 * Deliberately narrow, and it is the narrowness that makes the claim honest:
 *
 *   - published chains only — an unpublished draft has no such guarantee;
 *   - null models only — never overwrites an actual recorded attribution;
 *   - anything imported later stays null, because a .md carries the prompt text
 *     and nothing about what wrote it.
 *
 * Run once per environment. It is idempotent: a second run finds nothing.
 */
import "dotenv/config";
import { prisma } from "../app/lib/db";

const ASSUMED = "claude-opus-5";

async function main() {
  const apply = process.argv.includes("--apply");

  const chains = await prisma.valueChainLibrary.findMany({
    where: { publishedAt: { not: null } },
    select: { id: true, code: true, publishedAt: true, _count: { select: { prompts: true } } },
    orderBy: { code: "asc" },
  });
  if (chains.length === 0) {
    console.log("No published chains — nothing to attribute.");
    await prisma.$disconnect();
    return;
  }

  let total = 0;
  for (const c of chains) {
    const n = await prisma.valueChainPrompt.count({ where: { chainId: c.id, model: null } });
    if (n === 0) continue;
    total += n;
    console.log(`${c.code}  ${n} of ${c._count.prompts} prompt(s) unattributed`
      + `  (published ${c.publishedAt!.toISOString().slice(0, 10)})`);
    if (apply) {
      await prisma.valueChainPrompt.updateMany({
        where: { chainId: c.id, model: null },
        data: { model: ASSUMED },
      });
    }
  }

  console.log(total === 0
    ? "\nEvery published prompt is already attributed."
    : `\n${apply ? "Set" : "Would set"} model = "${ASSUMED}" on ${total} prompt(s) across ${chains.length} published chain(s).`
      + (apply ? "" : "\nRe-run with --apply to write it."));
  await prisma.$disconnect();
}

void main();
