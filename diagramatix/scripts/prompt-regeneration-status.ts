/**
 * Where did the regeneration get to?
 *
 *   npx tsx scripts/prompt-regeneration-status.ts
 *
 * Written when Paul's run stopped part way through the 277 repository prompts on
 * a spend cap. Nothing is lost — every prompt already written is in the database
 * — but "which ones" is not a question the screen answers across 26 chains at
 * once, and the answer decides what to re-run when access comes back.
 *
 * Reads only. Judges by the current master template, so a prompt written to an
 * older one counts as still owing.
 */
import "dotenv/config";
import { prisma } from "../app/lib/db";
import { promptIsStale, latestTemplateVersion, type MdPromptType } from "../app/lib/valueChain/promptTemplates";

async function main() {
  const v = latestTemplateVersion("bpmn");
  console.log(`Master BPMN template v${v.version}, shipped ${v.shippedAt}\n`);

  const chains = await prisma.valueChainLibrary.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { processes: true, prompts: true },
  });

  let done = 0, owing = 0;
  const rows: string[] = [];
  for (const c of chains) {
    const bpmn = c.prompts.filter((p) => p.type === "bpmn");
    const current = bpmn.filter((p) => !promptIsStale("bpmn", p.generatedAt));
    const behind = bpmn.length - current.length;
    const missing = c.processes.length - bpmn.length;
    done += current.length;
    owing += behind + Math.max(0, missing);
    const models = [...new Set(current.map((p) => p.model ?? "unattributed"))].join(", ") || "—";
    rows.push(`${c.code}  ${String(current.length).padStart(2)}/${String(c.processes.length).padStart(2)} current`
      + `${behind ? `  ${behind} on an older template` : ""}`
      + `${missing > 0 ? `  ${missing} never written` : ""}`
      + `  [${models}]${c.publishedAt ? "" : "  UNPUBLISHED"}`);
  }
  rows.forEach((r) => console.log(r));

  // The chain-level prompts too — they are regenerated alongside and are easy to
  // forget, because the screen counts them separately from the per-process ones.
  const chainLevel = chains.flatMap((c) => c.prompts.filter((p) => !p.processCode)
    .map((p) => ({ code: c.code, type: p.type as MdPromptType, at: p.generatedAt })));
  const clBehind = chainLevel.filter((p) => promptIsStale(p.type, p.at)).length;

  console.log(`\nBPMN prompts current: ${done}. Still owing: ${owing}.`);
  console.log(`Chain-level prompts still owing: ${clBehind} of ${chainLevel.length}.`);
  console.log(owing + clBehind === 0
    ? "\nEverything is written to the current template."
    : "\nRe-run the owing chains when API access returns — everything already written is kept.");
  await prisma.$disconnect();
}

void main();
