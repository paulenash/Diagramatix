/**
 * Extend the "DiagramatixMINER — Process Mining" User Guide chapter with the
 * workbench the extensions programme added (plan phases 0–10, product 2.9).
 *
 * The original chapter documents mine → discover → conform → calibrate. It says
 * nothing about slicing, the cases behind a deviation, where the elapsed time
 * actually goes, who hands work to whom, what to do next, or being told when the
 * process changes — all of which now exist.
 *
 * APPENDS rather than rewrites: the existing sections keep their order and
 * wording, and these are added after them. Idempotent — re-running upserts each
 * section by heading, so it is safe on every deploy.
 *
 * DB-backed guide → NOT bundled in the build:
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-guide-mining-workbench.ts                             # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-guide-mining-workbench.ts   # prod
 */

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const SLUG = "process-mining";
const COLLECTION = "user-guide";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "Getting your log in — spreadsheets, wide exports, and several systems",
    body: [
      "Most people do not have an XES file. They have **a spreadsheet**, and it is usually not shaped the way a miner expects. The importer now takes what you actually have.",
      "",
      "- **Excel** (`.xlsx`) is read directly, alongside CSV/TSV, XES and OCEL. A workbook with several sheets of data offers you the choice rather than silently importing the first one.",
      "- **One row per case.** Plenty of exports put the whole lifecycle *across* the row — `Raised, 3 Jan, Approved, 5 Jan, Closed, 9 Jan`. Read as an ordinary log that gives you one step per case and quietly discards the rest of the row. The importer spots this shape, tells you exactly what it found, and offers to **expand it to one row per event**. It never does it silently — you press the button.",
      "- **Several systems, one process.** The CRM holds the front half of a case and the ERP the back half. Add each export in turn and they are merged into a single lifecycle. If the two systems use different ids (`OPP-123` and `SO-456`), link them on a **shared key column** or attach a two-column **crosswalk file**.",
      "",
      "**It will refuse a merge that cannot work.** If no case appears in more than one file, the two exports either describe different cases or the ids do not line up — and merging them would double your case count and halve every trace, which looks exactly like a successful import. You are told instead.",
      "",
      "The merge also measures something neither export contains on its own: **how long cases sit between the two systems**. That gap is usually the largest single delay in a process and belongs to nobody.",
    ].join("\n"),
  },
  {
    heading: "Slicing a run — turning a finding into a cause",
    body: [
      "*\"Invoices take nine days\"* is an observation. *\"Invoices from the North over £10,000 take nine days and everything else takes two\"* is a cause. The **filter bar** above the Insights tabs is the difference.",
      "",
      "You can narrow a run by **date**, by **team**, and by any column you chose to **keep** at import.",
      "",
      "- **The chart is the date control.** Arrivals and completions are drawn across the life of the log — drag across it to narrow the range, click once to clear. The bars always show the whole run, so the picture cannot move under your hand while you drag.",
      "- **Keep the columns you want to slice by.** At import, every column the miner does not need for itself is listed, and each is *dropped* by default. Set one to **keep** and it becomes a dimension you can filter on later; set it to **hash** if it identifies a person. A column you dropped cannot be recovered without re-importing, because the raw rows are not stored.",
      "",
      "**Every figure tells you what it is entitled to claim.** A chip beside the tabs reads *filtered*, *filtered · estimated*, or *not filtered*:",
      "",
      "- **filtered** — exact for the cases you selected.",
      "- **filtered · estimated** — this run stores a sample of its cases (very large logs are strided), so the slice is scaled from that sample.",
      "- **not filtered** — this run cannot narrow *timings* at all, so what you are seeing is the whole-run figure, said out loud. Counts still filter. Nothing is ever averaged into a plausible-looking number.",
      "",
      "A slice with only a handful of cases reports its **counts** and refuses to quote distributions. A median over three cases is not a median.",
      "",
      "**Reports follow the filter.** Export to Word or Excel while a slice is active and the document says *\"Filtered to: region = North\"* on its first page, with its summary counts describing the slice — not the whole run.",
    ].join("\n"),
  },
  {
    heading: "Where the elapsed time actually goes",
    body: [
      "The **Activities** tab tells you which step consumes the most time. The **⏳ Between steps** tab breaks that down by *where the case was going next*.",
      "",
      "\"Check takes eight hours\" is not one fact. Three quarters of it may be the wait before *Approve* and a quarter the wait before *Reject* — and that is the difference between fixing the check and fixing the approval queue.",
      "",
      "The transitions are ranked by **how much total elapsed time they account for**, not by how often they happen: a two-day wait occurring twice matters less than a two-hour wait occurring four hundred times.",
      "",
      "**One thing worth knowing about the numbers.** An event log records a single timestamp per event, so the gap between two steps is one number and nothing in the data says how much of it was work and how much was waiting. These are therefore the *same* milliseconds the Activities table charges to the step they leave — a breakdown of that figure, not an addition to it. The tab says so on screen, because summing the two tables would double the elapsed time of your process.",
      "",
      "The discovered model is shown alongside. **Click a row to light up its arrow, or click an arrow to find its row.** Only the steps your log actually contains are clickable; gateways and the start and end events have no measured gap.",
      "",
      "The model's arrows now carry both facts at once — a **badge** for how often a path was taken and a **label** for how long it typically waits, with thickness following the total time.",
      "",
      "**Detail slider.** Real logs are noisy. When you discover the process, the *Detail* slider drops the rarest paths so the model shows the dominant flow rather than everything that ever happened. Leave it at *all paths* for the full picture.",
    ].join("\n"),
  },
  {
    heading: "Who hands work to whom",
    body: [
      "If your log names a **resource** — a team, a queue, a person — the **👥 Teams** tab shows what happens between them.",
      "",
      "- **Hand-offs**, ranked by what they *cost* rather than how often they happen. The wait between one team's last step and the next team's first is the part of the process nobody owns, and it is usually the largest.",
      "- **Workload** — each team's share of the recorded time.",
      "- **Passed back and forth** — cases that return to a team that had already finished with them. Every return is a queue the case joins twice.",
      "- **Done more than once** — steps that repeat within a case, with the rate: *\"Credit check runs 2.4× per case\"*. Work repeated is work that did not stick the first time.",
      "",
      "**If your run does not store per-event teams**, the map is built from each activity's most frequent team and is labelled **approximate** — along with how many activities more than one team performs, because those are exactly where the approximation is wrong. Cases passing back and forth cannot be measured that way at all, so that panel is left empty rather than showing a zero, which would be a claim that your process does not bounce.",
      "",
      "On the **Activities** tab, a step performed by more than one team is flagged amber and can now be opened to see the split.",
    ].join("\n"),
  },
  {
    heading: "Fourteen cases skipped the credit check — here they are",
    body: [
      "A conformance percentage is a metric. The first thing anybody asks is *which ones*, and a tool that cannot answer gets treated as an opinion.",
      "",
      "The **⚖ Deviations** tab lists every deviation from your reference model. **Select one and it names the cases behind it. Select a case and you get its path**, step by step, with how long each step took and which team did it.",
      "",
      "**It will always tell you how complete the list is.** On a very large run the case index is a sample, so fourteen offending cases may resolve to nine that can be named — and it says exactly that: *\"14 cases · 9 identifiable in the stored sample\"*. You will never be shown a quietly short list presented as the list.",
      "",
      "If a run was conformance-checked before this feature existed, it has no record of *which* cases deviated. That is reported as unknown — not as an empty list — with a **Re-check now** button that works out the attribution from data already stored. **No re-import is needed.**",
      "",
      "**The whole case index exports as CSV.** The on-screen list stops at sixty rows, which is right for reading and useless if you want to check the work — and checking the work is exactly what a sceptical reader wants to do. The file carries every stored case, its path, its timings and any columns you kept, and it honours the filter you have applied.",
    ].join("\n"),
  },
  {
    heading: "What to do next",
    body: [
      "A screen full of correct findings is still homework. The **What to do next** panel sits above the workbench and answers the question you actually have.",
      "",
      "It reports what stands out — the bottleneck, the slowest hand-off, rework, cross-team bouncing, the steps that drive lateness, deviations, a growing backlog — each with its own number and **a button**: *show me the cases*, *see where the time goes*, or **calibrate a twin and try more capacity in that team**, which closes the loop the product is built around: mine → calibrate → simulate → re-mine.",
      "",
      "**Two things about it are deliberate.**",
      "",
      "First, **\"nothing stands out\" is a real answer.** If no step, hand-off or team dominates by enough to be worth acting on, it says so. A tool that always produces a top recommendation eventually recommends noise, and the first time it does you stop believing the next one.",
      "",
      "Second, **it says what it could not assess.** No SLA set means no lateness advice — stated, not silently omitted. No reference model means no conformance advice. A run without per-event detail gets no hand-off or rework advice at all: an approximation is fine to look at and is not a safe basis for telling you what to do.",
      "",
      "The ranking is **computed, never a model's opinion**. Where your organisation allows AI, it may rewrite the findings into prose — it is not permitted to reorder them or to add one, and it never sees the underlying data.",
    ].join("\n"),
  },
  {
    heading: "Mining the same process twice — comparison and alerts",
    body: [
      "Nobody mines a process once. A run is a photograph, and the question you ask second is whether things got better or worse.",
      "",
      "**Snapshots now link into a series.** Taking a snapshot records where it came from, so a run has a history rather than a scattering of similarly-named copies. A **live source** keeps its own history automatically — bounded to one snapshot a day and thirty in total, so it never becomes a pile of rows nobody can read.",
      "",
      "The two most recent observations can be compared: cases, cycle times, variants, conformance, which steps got slower, and which deviations **appeared** or **went away** since last time.",
      "",
      "**It refuses to compare two things that are not the same process.** If the activity vocabularies barely overlap, the two runs describe different processes and every difference between them would be arithmetic on unrelated numbers — which looks exactly like a dramatic regression. You are told instead. A process that gained or retired a step is still the same process and compares normally.",
      "",
      "**Being told, rather than having to look.** For a live source, the Miner now watches and puts a message in your notifications when:",
      "",
      "- **the source stopped sending** — the cheapest and most valuable alarm there is, because a feed that dies produces no error anywhere and a dashboard of stale numbers looks exactly like a dashboard of stable ones;",
      "- **conformance fell**, with both figures;",
      "- **a deviation appeared** that was not there before;",
      "- **the late rate more than doubled**.",
      "",
      "**Nothing fires on a first observation.** A process mined once has no trend, and a conformance of 71% on your first run is simply what your process does. A condition is announced **once** — one that gets worse is announced again; one that merely persists is not, until a fortnight has passed.",
    ].join("\n"),
  },
  {
    heading: "Testing the twin honestly — the hold-back",
    body: [
      "A digital twin fitted on every case and then checked against those same cases is marking its own homework. It is still a useful sanity check, and it is not a test.",
      "",
      "At import you can now **hold back the most recent 10%, 20% or 30% of cases**. The twin is then fitted on the earlier cases only, and *Does the model match reality?* checks it against the ones it never saw. The split is by **date**, not at random — a random split leaks the future into the fit. Your Insights views still cover every case; only the twin's fit is narrowed.",
      "",
      "It is off by default: holding data back is a deliberate choice.",
      "",
      "**A twin also knows when it has gone stale.** If new events arrive after a twin was calibrated, the validation panel says so, with the date the log moved on. Nothing is silently re-calibrated for you — that would rewrite a study you may have edited by hand.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const chapter = await prisma.helpChapter.findFirst({
      where: { slug: SLUG, collection: COLLECTION },
      include: { sections: true },
    });
    if (!chapter) {
      // Loud rather than silent: the base chapter is seeded by
      // add-guide-process-mining.ts and this only ever extends it.
      console.error(`No "${SLUG}" chapter in the ${COLLECTION} collection. Run scripts/add-guide-process-mining.ts first.`);
      process.exit(1);
    }

    // Append AFTER whatever is already there, so the original sections keep
    // their order and this can run repeatedly without shuffling them.
    let next = chapter.sections.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;

    for (const s of SECTIONS) {
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body } });
        console.log(`  update "${s.heading}"`);
      } else {
        await prisma.helpSection.create({
          data: { chapterId: chapter.id, heading: s.heading, bodyMarkdown: s.body, sortOrder: next++ },
        });
        console.log(`  insert "${s.heading}"`);
      }
    }
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
