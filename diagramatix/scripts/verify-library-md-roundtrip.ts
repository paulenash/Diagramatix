/**
 * Prove the .md carries the whole library before trusting it to move one.
 *
 *   npx tsx scripts/verify-library-md-roundtrip.ts
 *
 * Renders THIS environment's library to markdown with the same code the export
 * route uses, parses it straight back, and reports anything that changed on the
 * way. Read-only: it writes nothing to the database and no file.
 *
 * Written when Paul asked how to move the Process Repository from prod to local
 * "intact and not requiring regeneration". The .md is the supported route, and a
 * route nobody has measured is a hope rather than a procedure.
 */
import "dotenv/config";
import { prisma } from "../app/lib/db";
import { renderLibraryMd, parseLibraryFromMd, type ImportedChain } from "../app/lib/valueChain/library";
import type { MdPromptType } from "../app/lib/valueChain/promptTemplates";

async function main() {
  const rows = await prisma.valueChainLibrary.findMany({
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: { processes: { orderBy: { sortOrder: "asc" } }, prompts: true },
  });
  if (rows.length === 0) { console.log("This library is empty."); await prisma.$disconnect(); return; }

  const before: ImportedChain[] = rows.map((c) => ({
    code: c.code, title: c.title, groupName: c.groupName, sortOrder: c.sortOrder,
    narrative: c.narrative,
    processes: c.processes.map((p) => ({ code: p.code, title: p.title, sortOrder: p.sortOrder })),
    prompts: c.prompts.map((p) => ({
      type: p.type as MdPromptType, processCode: p.processCode, name: p.name, prompt: p.prompt,
      model: p.model, generatedAt: p.generatedAt ? p.generatedAt.toISOString() : null,
    })),
  }));

  const after = parseLibraryFromMd(renderLibraryMd(before));

  const problems: string[] = [];
  const say = (s: string) => problems.push(s);

  if (after.length !== before.length) say(`chains: ${before.length} -> ${after.length}`);
  const afterByCode = new Map(after.map((c) => [c.code, c]));
  for (const b of before) {
    const a = afterByCode.get(b.code);
    if (!a) { say(`${b.code} did not come back at all`); continue; }
    if (a.title !== b.title) say(`${b.code} title: "${b.title}" -> "${a.title}"`);
    if (a.processes.length !== b.processes.length) say(`${b.code} processes: ${b.processes.length} -> ${a.processes.length}`);
    if (a.prompts.length !== b.prompts.length) say(`${b.code} prompts: ${b.prompts.length} -> ${a.prompts.length}`);
    for (const bp of b.prompts) {
      const ap = a.prompts.find((x) => x.type === bp.type && x.processCode === bp.processCode);
      if (!ap) { say(`${b.code} ${bp.type} ${bp.processCode || "(chain)"} missing`); continue; }
      // The prompt TEXT is what a diagram is generated from — nothing else here
      // matters if this differs.
      // Line endings are normalised on the way out (renderPromptBlock does it
      // deliberately) and a prompt imported from a Windows file carries CRLF, so
      // comparing them raw reports every prompt as changed and hides a real one.
      const same = (x: string) => x.replace(/\r\n/g, "\n").trim();
      if (same(ap.prompt) !== same(bp.prompt)) say(`${b.code} ${bp.type} ${bp.processCode || "(chain)"} TEXT CHANGED`);
      // The name becomes the diagram's name, and the link scan matches
      // subprocess labels against it.
      if (ap.name !== bp.name) say(`${b.code} name: "${bp.name}" -> "${ap.name}"`);
      if ((ap.model ?? null) !== (bp.model ?? null)) say(`${b.code} ${bp.processCode || "(chain)"} model: ${bp.model} -> ${ap.model}`);
      if ((ap.generatedAt ?? null) !== (bp.generatedAt ?? null)) say(`${b.code} ${bp.processCode || "(chain)"} date: ${bp.generatedAt} -> ${ap.generatedAt}`);
    }
  }

  const totals = (cs: ImportedChain[]) => ({
    chains: cs.length,
    processes: cs.reduce((t, c) => t + c.processes.length, 0),
    prompts: cs.reduce((t, c) => t + c.prompts.length, 0),
    attributed: cs.reduce((t, c) => t + c.prompts.filter((p) => p.model).length, 0),
    dated: cs.reduce((t, c) => t + c.prompts.filter((p) => p.generatedAt).length, 0),
  });
  console.log("before:", JSON.stringify(totals(before)));
  console.log("after: ", JSON.stringify(totals(after)));
  console.log(problems.length === 0
    ? "\nThe .md carries the library exactly. Safe to move an environment with it."
    : `\n${problems.length} difference(s):\n  ` + problems.slice(0, 40).join("\n  "));

  // The one thing the .md CANNOT carry, said plainly rather than discovered later.
  const published = rows.filter((c) => c.publishedAt).length;
  console.log(`\nNOT carried by the .md: published state (${published} of ${rows.length} chains are published here).`
    + "\nAfter importing, press \"Publish every chain\" — the diagram generator reads published prompts only.");
  await prisma.$disconnect();
}

void main();
