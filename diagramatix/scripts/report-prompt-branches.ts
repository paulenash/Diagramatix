/**
 * Which Process Repository prompts leave a gateway branch unterminated?
 *
 * Reads the repository markdown (default) or the ValueChainPrompt rows, and
 * reports every branch that never says where it goes. Deterministic; no AI
 * call, no writes.
 *
 *   npx tsx scripts/report-prompt-branches.ts [path/to/Repository.md]
 */
import * as fs from "fs";
import { checkPromptBranches } from "@/app/lib/valueChain/checkPromptBranches";

const path = process.argv[2] ?? "new features/Process Repository Final.md";
const doc = fs.readFileSync(path, "utf8");
const lines = doc.split(/\r?\n/);

// Attribute each issue to the nearest heading above it, so the report says
// WHICH process to regenerate rather than only how many are wrong.
const headings: { line: number; text: string }[] = [];
lines.forEach((l, i) => {
  const m = l.match(/^#{1,4}\s+(.*)$/);
  if (m) headings.push({ line: i + 1, text: m[1].trim() });
});
const headingFor = (line: number) => {
  let best = "(top of document)";
  for (const h of headings) { if (h.line <= line) best = h.text; else break; }
  return best;
};

const issues = checkPromptBranches(doc);
const total = (doc.match(/^\s*-\s*branch\s*"/gm) ?? []).length;

const byHeading = new Map<string, typeof issues>();
for (const it of issues) {
  const h = headingFor(it.line);
  const arr = byHeading.get(h) ?? [];
  arr.push(it);
  byHeading.set(h, arr);
}

console.log(`${path}`);
console.log(`branches ${total} | unterminated ${issues.length} (${(100 * issues.length / (total || 1)).toFixed(1)}%) | across ${byHeading.size} processes\n`);
const ranked = [...byHeading.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [h, list] of ranked) {
  console.log(`${String(list.length).padStart(3)}  ${h}`);
  for (const it of list.slice(0, 3)) {
    console.log(`       line ${String(it.line).padStart(5)}  "${it.condition}"  ->  ${it.body.slice(0, 64) || "(nothing)"}`);
  }
  if (list.length > 3) console.log(`       … and ${list.length - 3} more`);
}
