/**
 * Remove every Data Store from the generated BPMN prompts.
 *
 *   npx tsx --env-file=.env scripts/strip-data-stores.ts            # dry run
 *   npx tsx --env-file=.env scripts/strip-data-stores.ts --write    # apply
 *
 * Paul, 2026-08-29: "Data Stores, in general, are duplicating Black-box pools. I
 * think that we should not use them in generated diagrams."
 *
 * He is right, and the master template now says so. This clears the instruction
 * out of the 26 chains' existing prompts too, WITHOUT the ~277 AI calls a full
 * regeneration would cost — the Data Store bullets are a fixed shape inside the
 * "Data objects" section, so the edit is deterministic:
 *
 *     Data Store "<name>" — <read/written> by "<task>".
 *
 * possibly wrapped over the following indented lines.
 *
 * The .md and the database library are edited together, because the .md is the
 * interchange format and a drift between the two is exactly what the round-trip
 * test exists to catch.
 *
 * REPORTS WHAT MIGHT BE LOST. A Data Store whose name does not resemble any IT
 * system pool in the same prompt was carrying information nothing else carries —
 * deleting it silently would quietly drop a system from the diagram. Those are
 * listed so they can be judged, not guessed at.
 */
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../app/lib/db";

const WRITE = process.argv.includes("--write");
const MD = path.join(process.cwd(), "new features", "Process Repository Final.md");

/** A "Data Store …" bullet plus any wrapped continuation lines. */
const DATA_STORE_BULLET = /^([ \t]*[-*]?[ \t]*)Data Stores?\b[^\n]*(?:\n(?![ \t]*(?:[-*]|\d+\.)|\s*$)[ \t]+[^\n]*)*\n?/gim;

/** Names of black-box / IT-system pools the prompt already declares. */
function systemsIn(prompt: string): string[] {
  const out: string[] = [];
  for (const m of prompt.matchAll(/(?:black[- ]box|IT system|system)\s+pool[^\n"]*"([^"]+)"/gi)) out.push(m[1]);
  for (const m of prompt.matchAll(/"([^"]+)"\s*\(\s*(?:black[- ]box|IT system)/gi)) out.push(m[1]);
  return out;
}

const words = (s: string) => new Set(
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2),
);

/** Does any declared system plausibly cover this store's name? */
function covered(storeName: string, systems: string[]): boolean {
  const a = words(storeName);
  if (a.size === 0) return true;
  return systems.some((s) => {
    const b = words(s);
    let hit = 0;
    for (const w of a) if (b.has(w)) hit++;
    return hit / a.size >= 0.4;
  });
}

interface Report { where: string; removed: number; uncovered: string[] }

function strip(prompt: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const text = prompt.replace(DATA_STORE_BULLET, (block) => {
    const name = /"([^"]+)"/.exec(block)?.[1] ?? block.trim().slice(0, 60);
    removed.push(name);
    return "";
  });
  return { text, removed };
}

/**
 * A "Data objects" section left with NO content must say "None." — the template
 * asks for that explicitly, and a bare heading reads as an omission.
 *
 * Done line by line, not by regex. The regex version matched the heading plus
 * the blank line that follows it and inserted "None." above content that was
 * still there, producing "Data objects / None. / Data Object …" in 266 prompts.
 */
function tidyEmptySection(text: string): string {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const isHeading = (l: string) => /^\s*\d+\.\s+\S/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\d+\.\s*Data objects\b/i.test(lines[i])) continue;
    let j = i + 1;
    let hasContent = false;
    for (; j < lines.length && !isHeading(lines[j]); j++) {
      if (lines[j].trim()) { hasContent = true; break; }
    }
    if (hasContent) continue;
    // Replace the run of blank lines with "None." followed by one blank line.
    let k = i + 1;
    while (k < lines.length && !lines[k].trim() && !isHeading(lines[k])) k++;
    lines.splice(i + 1, k - (i + 1), "None.", "");
  }
  return lines.join(nl);
}

(async () => {
  const reports: Report[] = [];

  // ── 1. the markdown ──────────────────────────────────────────────────────
  const before = fs.readFileSync(MD, "utf8");
  const { text: mdStripped, removed: mdRemoved } = strip(before);
  const after = tidyEmptySection(mdStripped);
  console.log(`markdown: ${mdRemoved.length} Data Store bullet(s) removed`);
  if (WRITE && after !== before) {
    fs.writeFileSync(MD, after);
    console.log(`  written: ${MD}`);
  }

  // ── 2. the library (draft AND published, both must move together) ────────
  const rows = await prisma.valueChainPrompt.findMany({
    where: { type: "bpmn" },
    select: { id: true, name: true, prompt: true, publishedPrompt: true },
  });
  let touched = 0, bullets = 0;
  for (const r of rows) {
    const draft = r.prompt ?? "";
    const pub = r.publishedPrompt ?? "";
    const d = strip(draft), p = strip(pub);
    if (d.removed.length === 0 && p.removed.length === 0) continue;
    touched++;
    bullets += d.removed.length + p.removed.length;

    const systems = systemsIn(pub || draft);
    const uncovered = [...new Set([...d.removed, ...p.removed])].filter((n) => !covered(n, systems));
    reports.push({ where: r.name, removed: d.removed.length + p.removed.length, uncovered });

    if (WRITE) {
      await prisma.valueChainPrompt.update({
        where: { id: r.id },
        data: {
          prompt: draft ? tidyEmptySection(d.text) : draft,
          publishedPrompt: pub ? tidyEmptySection(p.text) : pub,
        },
      });
    }
  }
  console.log(`library:  ${bullets} bullet(s) across ${touched} of ${rows.length} BPMN prompts`);

  // ── 3. what may have been lost ───────────────────────────────────────────
  const risky = reports.filter((r) => r.uncovered.length > 0);
  console.log(`\n${risky.length} prompt(s) named a Data Store that NO declared IT system pool covers.`);
  console.log("These were the only mention of that system — worth a look before publishing:\n");
  for (const r of risky.slice(0, 40)) console.log(`  ${r.where}\n      ${r.uncovered.join("\n      ")}`);
  if (risky.length > 40) console.log(`  … and ${risky.length - 40} more`);

  if (!WRITE) console.log("\nDRY RUN — nothing written. Re-run with --write to apply.");
  await prisma.$disconnect();
})();
