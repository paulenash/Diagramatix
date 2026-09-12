/**
 * Give every shipped example named people with skills — step 3.
 *
 * Paul: "These need to be filled by for all simulation examples, but not used in
 * the existing examples yet so they all work as they currently do without any
 * skills constraints."
 *
 * So this names PEOPLE and gives them skills. It never writes a task's
 * `requiredSkills`, which is the half that would constrain anything. Hire &
 * Onboard is left entirely alone: its 2-of-4 accreditation gate IS the example,
 * and Paul chose to keep it.
 *
 * WHY THIS IS SAFE. Naming anybody flips ResourcePool off its counted path
 * (`if (!this.skilled)`) and onto `pickUnits`, which picks named individuals
 * least-flexible-first. That is a different code path, so "it shouldn't matter"
 * was not good enough — scratchpad/probe-naming-members.ts ran every example
 * both ways and every figure was identical, because with no requirement to
 * match, any free unit qualifies. T4264 keeps it that way.
 *
 * AUTOMATION POOLS ARE LEFT COUNTED. Naming twelve AI agents individually says
 * something untrue: they hold no distinguishable competencies, and the whole
 * point of naming is that it makes a distinction. Same rule the Hire & Onboard
 * generator states — name people only where naming does something.
 *
 *   npx tsx scripts/fill-example-skills.ts --dry-run
 *   npx tsx scripts/fill-example-skills.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "app/lib/simulation/exampleData.json");

/** Left alone: it already names everybody, and its constraints are the point. */
const SKIP_EXAMPLES = new Set(["hire-and-onboard"]);

/** A pool of interchangeable machines is not a roster. */
const isAutomation = (team: string) => /\b(ai|agent|bot|robot|automation|system)\b/i.test(team);

/**
 * Which skill each team's people hold. Every name here must exist in the master
 * Skills list (scripts/seed-skills.ts) — T4258 ties the two together, so a skill
 * invented here would fail the build rather than quietly become an orphan.
 */
const TEAM_SKILL: { match: RegExp; skills: string[] }[] = [
  { match: /underwrit/i,                     skills: ["Underwriting"] },
  { match: /title|research|analyst/i,        skills: ["Data Analysis"] },
  { match: /market/i,                        skills: ["Data Analysis"] },
  { match: /enquir|front office|customer/i,  skills: ["Customer Contact"] },
  { match: /sales/i,                         skills: ["Customer Contact"] },
  { match: /loan officer|loan-officer/i,     skills: ["Case Assessment"] },
  { match: /specialist/i,                    skills: ["Underwriting"] },
  { match: /loans?\b|assessment/i,           skills: ["Case Assessment"] },
  { match: /repair|workshop|team/i,          skills: ["Quality Review"] },
];

const skillsFor = (team: string): string[] =>
  TEAM_SKILL.find((r) => r.match.test(team))?.skills ?? ["Case Assessment"];

/** Plain, obviously-fictional names: a roster is illustrative, not a cast list. */
const FIRST = ["Alex", "Sam", "Jo", "Riley", "Casey", "Morgan", "Jamie", "Drew", "Taylor", "Quinn", "Reese", "Avery"];
const nameFor = (team: string, i: number) => `${FIRST[i % FIRST.length]} (${team})`;

interface Team { name: string; capacity: number; members?: { name: string; skills: string[] }[] }
interface Example { slug: string; package?: { teams?: Team[] } }

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const doc = JSON.parse(readFileSync(DATA, "utf8")) as { examples: Example[] };

  let filled = 0, skipped = 0;
  for (const ex of doc.examples) {
    if (SKIP_EXAMPLES.has(ex.slug)) { console.log(`  skip  ${ex.slug} — keeps its own constraints`); skipped++; continue; }
    const teams = ex.package?.teams ?? [];
    if (!teams.length) { skipped++; continue; }

    const touched: string[] = [];
    for (const t of teams) {
      if (t.members?.length) continue;                 // already named — leave it
      if (isAutomation(t.name)) continue;              // a counted pool of machines
      const skills = skillsFor(t.name);
      // Name up to the capacity: more would imply a roster bigger than the
      // number who can work at once, which is true in life and confusing here.
      const n = Math.max(1, Math.min(t.capacity, 12));
      t.members = Array.from({ length: n }, (_, i) => ({ name: nameFor(t.name, i), skills: [...skills] }));
      touched.push(`${t.name}×${n} [${skills.join(", ")}]`);
    }
    if (touched.length) { console.log(`  fill  ${ex.slug}: ${touched.join("; ")}`); filled++; }
    else { console.log(`  skip  ${ex.slug} — nothing to name`); skipped++; }
  }

  if (!dryRun) writeFileSync(DATA, JSON.stringify(doc, null, 2) + "\n");
  console.log(`\n${dryRun ? "[dry run] " : ""}${filled} example(s) filled, ${skipped} left alone.`);
}

main();
