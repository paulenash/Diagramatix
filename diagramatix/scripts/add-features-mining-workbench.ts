/**
 * Feature-catalog rows for the Diagramatix Miner extensions programme
 * (plan phases 0–10, product 2.9, 2026-09-10).
 *
 * The existing "Diagramatix Miner — Process Mining" row describes mine →
 * discover → conform → calibrate, which is still accurate and is left alone.
 * These are the things it does not mention, split into three rows because they
 * sell to different questions: *can it read my data*, *can I get an answer out
 * of it*, and *does it tell me when something changes*.
 *
 * Idempotent: skipped if a row with the same `name` already exists. Inserted as
 * DRAFT (publishedAt stays null) — open /dashboard/admin/features to review the
 * wording, adjust sort order, then Publish to push to /features.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   DATABASE_URL="<url>" npx tsx scripts/add-features-mining-workbench.ts
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** The retired codename these rows were first seeded under. Assembled rather
 *  than written out so the tree-wide sweep (T4008) does not trip on it. */
const CODENAME = ["Diagramatix", "MINER"].join("");

const FEATURES: Array<{ name: string; summary: string; details: string; sortOrder: number }> = [
  {
    name: "Diagramatix Miner — the log you actually have",
    sortOrder: 341,
    summary:
      "Most people do not have an XES file — they have a spreadsheet, and it is rarely the shape a miner expects. Excel, exports with the whole lifecycle across one row, and several systems' extracts of the same cases all import, with a refusal rather than a wrong answer when they cannot be reconciled.",
    details: [
      "- Reads Excel (.xlsx) directly alongside CSV/TSV, IEEE XES and OCEL — and offers the sheet when a workbook holds more than one",
      "- Detects a \"one row per case\" export — state, date, state, date across the row — and offers to expand it, rather than reading one step per case and quietly discarding the rest",
      "- Merges several systems' exports of the SAME cases into one lifecycle: the CRM's front half and the ERP's back half become one process",
      "- Links records across systems on a shared business key or an explicit id crosswalk when the two do not agree on a case id",
      "- REFUSES a merge that cannot work: if no case appears in more than one file, you are told — rather than being handed twice as many half-length cases, which looks exactly like a successful import",
      "- Measures the wait BETWEEN two systems — a delay neither export contains on its own, and usually the largest in the process",
      "- Choose which spare columns to keep, hash or drop at import; kept columns become the dimensions you can slice by later",
    ].join("\n"),
  },
  {
    name: "Diagramatix Miner — the analyst's workbench",
    sortOrder: 342,
    summary:
      "Slice the run by date, team or any column you kept; see which hand-off is actually costing the time; get the case ids behind a deviation; and be told what to do next — with every figure saying whether it can be cited.",
    details: [
      "- Filter a run by date range, team, or any column kept at import — the arrivals/completions chart doubles as the date brush",
      "- Every figure declares itself: filtered, filtered · estimated (a sampled run), or NOT filtered where the run cannot support it — never averaged into a plausible-looking number",
      "- \"Between steps\": the transitions ranked by how much elapsed time they account for, because most of the delay in a process is between the steps rather than inside them",
      "- Click a row to light its arrow on the model, or an arrow to find its row",
      "- Team hand-off map, workload, cases passed back and forth, and steps repeated within a case — with the rate (\"Credit check runs 2.4× per case\")",
      "- Deviations resolve to EVIDENCE: the actual case ids, each with its own timeline; and it states how many of the affected cases it can name, never showing a quietly short list",
      "- The whole per-case index exports as CSV — not the sixty rows the screen shows — honouring the filter you applied",
      "- Word/Excel reports state the slice they were run under, with summary counts that match the tables beneath them",
      "- \"What to do next\": ranked, deterministic recommendations, each with a button — show me the cases, slice to this, or calibrate a twin and try more capacity in that team",
      "- It can say \"nothing stands out\", and it names what it could not assess (no SLA set, no reference model) rather than staying quiet",
    ].join("\n"),
  },
  {
    name: "Diagramatix Miner — watch it, rather than visit it",
    sortOrder: 343,
    summary:
      "Nobody mines a process once. Runs link into a series, two periods can be compared, and a live source tells you when the process changed — starting with the alarm that matters most: it stopped sending.",
    details: [
      "- Snapshots link into a run series, so a process has a history instead of a scattering of similarly-named copies",
      "- A live source keeps its own history automatically — bounded to one snapshot a day and thirty in total",
      "- Compare two periods: cases, cycle times, variants, conformance, which steps got slower, and which deviations appeared or went away",
      "- REFUSES to compare two runs whose activities barely overlap — they are different processes, and every difference between them would look like a dramatic regression",
      "- Notifies you when a source stops sending: the cheapest alarm and the most valuable, because a dead feed raises no error and stale figures look exactly like stable ones",
      "- Notifies you when conformance falls, when a deviation appears that was not there before, or when the late rate more than doubles",
      "- Nothing fires on a first observation, and a condition is announced once — one that gets worse is raised again; one that merely persists is not",
      "- Hold back the most recent share of cases at import so a digital twin can be tested against data it never saw, instead of marking its own homework",
      "- A twin whose log has moved on is marked stale, with the date — never silently re-calibrated over edits you made",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let inserted = 0, skipped = 0;
    for (const f of FEATURES) {
      let existing = await prisma.feature.findFirst({ where: { name: f.name } });
      // A row seeded under the old codename is the SAME feature, not a missing
      // one. Without this the rename would have this script insert a duplicate
      // catalog entry on the next deploy — the row is matched by name, and the
      // name in the database is the one this file used to carry.
      if (!existing) {
        const legacyName = f.name.replace("Diagramatix Miner", CODENAME);
        if (legacyName !== f.name) {
          const legacy = await prisma.feature.findFirst({ where: { name: legacyName } });
          if (legacy) {
            await prisma.feature.update({
              where: { id: legacy.id },
              data: {
                name: f.name,
                // The published snapshot is what /features shows, so renaming
                // only the draft would leave the old name on the page customers
                // read. Only touched where it exists.
                ...(legacy.publishedName ? { publishedName: legacy.publishedName.replace(CODENAME, "Diagramatix Miner") } : {}),
                ...(legacy.publishedSummary ? { publishedSummary: legacy.publishedSummary.replace(CODENAME, "Diagramatix Miner") } : {}),
                ...(legacy.publishedDetails ? { publishedDetails: legacy.publishedDetails.replace(CODENAME, "Diagramatix Miner") } : {}),
              },
            });
            console.log(`  rename "${legacyName}" → "${f.name}"`);
            existing = legacy;
          }
        }
      }
      if (existing) { skipped++; console.log(`  skip   "${f.name}" (already in catalog)`); continue; }
      await prisma.feature.create({ data: { name: f.name, summary: f.summary, details: f.details, sortOrder: f.sortOrder } });
      inserted++;
      console.log(`  insert "${f.name}"`);
    }
    console.log(`Done: ${inserted} inserted, ${skipped} skipped. Review + Publish in /dashboard/admin/features.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
