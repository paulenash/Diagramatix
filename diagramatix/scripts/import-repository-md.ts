/**
 * Load the Process Repository markdown into a database.
 *
 * The `.md` under `new features/` is the SOURCE: `regenerate-chain-prompts.ts`
 * writes the prompts into it, and this puts that result into a DB. The admin
 * screen's Import button does the same thing over HTTP; this is the headless
 * equivalent, so a fresh local database can be filled in one command and prod
 * can be updated without driving a browser through 26 chains.
 *
 *   npx tsx scripts/import-repository-md.ts --dry-run
 *   npx tsx scripts/import-repository-md.ts --chains V01,V02
 *   npx tsx scripts/import-repository-md.ts --all --replace
 *
 * REPLACE IS DESTRUCTIVE, AND DELIBERATELY EXPLICIT. Without `--replace` a
 * chain that already exists is left alone, so the default is additive and a
 * mistyped command cannot overwrite a catalogue. With it, the chain's processes
 * and prompts are deleted and rewritten — an import is a restatement of the
 * chain, and a half-merged chain (old processes, new prompts) would be worse
 * than either version on its own. That is the same rule the route follows.
 *
 * The target is whatever DATABASE_URL points at, so check it before running
 * against production.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../app/lib/db";
import { parseLibraryFromMd } from "../app/lib/valueChain/library";
import { checkPromptBranches } from "../app/lib/valueChain/checkPromptBranches";

const REPO_MD = path.join(process.cwd(), "new features", "Process Repository Final.md");

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const dryRun = argv.includes("--dry-run");
  const replace = argv.includes("--replace");
  const file = arg("--file") ?? REPO_MD;

  if (!fs.existsSync(file)) { console.error(`not found: ${file}`); process.exit(1); }
  const md = fs.readFileSync(file, "utf8");
  const parsed = parseLibraryFromMd(md);
  if (parsed.length === 0) { console.error("no value chains found in that file"); process.exit(1); }

  const wanted = argv.includes("--all")
    ? parsed.map((c) => c.code)
    : (arg("--chains") ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  if (wanted.length === 0) { console.log("pass --chains V01,V02 or --all"); process.exit(1); }

  const target = (process.env.DATABASE_URL ?? "").replace(/:[^:@/]*@/, ":***@");
  console.log(`source ${path.basename(file)} · target ${target || "(DATABASE_URL unset)"}`);
  console.log(`${wanted.length} chain(s)${replace ? " · REPLACE" : " · additive (existing chains skipped)"}${dryRun ? " · dry run" : ""}\n`);

  let created = 0, updated = 0, skipped = 0, prompts = 0, openBranches = 0;
  for (const code of wanted) {
    const c = parsed.find((x) => x.code === code);
    if (!c) { console.log(`${code} — not in the file, skipped`); skipped++; continue; }
    const open = c.prompts.reduce((s, p) => s + checkPromptBranches(p.prompt).length, 0);
    openBranches += open;
    const existing = await prisma.valueChainLibrary.findUnique({ where: { code: c.code } });
    const verb = existing ? (replace ? "replace" : "skip") : "create";
    console.log(`${code} ${c.title} — ${c.processes.length} process(es), ${c.prompts.length} prompt(s)`
      + `${open ? `, ${open} OPEN BRANCH(ES)` : ""} · ${verb}`);
    if (existing && !replace) { skipped++; continue; }
    if (dryRun) { existing ? updated++ : created++; prompts += c.prompts.length; continue; }

    if (existing) {
      await prisma.valueChainProcess.deleteMany({ where: { chainId: existing.id } });
      await prisma.valueChainPrompt.deleteMany({ where: { chainId: existing.id } });
    }
    const chain = existing
      ? await prisma.valueChainLibrary.update({
          where: { id: existing.id },
          data: { title: c.title, groupName: c.groupName, sortOrder: c.sortOrder, narrative: c.narrative },
        })
      : await prisma.valueChainLibrary.create({
          data: { code: c.code, title: c.title, groupName: c.groupName, sortOrder: c.sortOrder, narrative: c.narrative },
        });
    existing ? updated++ : created++;
    for (const p of c.processes) {
      await prisma.valueChainProcess.create({
        data: { chainId: chain.id, code: p.code, title: p.title, sortOrder: p.sortOrder },
      });
    }
    for (const p of c.prompts) {
      await prisma.valueChainPrompt.create({
        data: {
          chainId: chain.id, type: p.type, processCode: p.processCode, name: p.name,
          prompt: p.prompt, roundTripsOk: true, generatedAt: new Date(),
        },
      });
      prompts++;
    }
  }

  console.log(`\ncreated ${created} · replaced ${updated} · skipped ${skipped} · ${prompts} prompt(s)`);
  console.log(openBranches === 0
    ? "every gateway branch states where it goes."
    : `${openBranches} branch(es) still state no destination — run scripts/report-prompt-branches.ts for the list.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
