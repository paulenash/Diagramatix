/**
 * Add a "Diagramatix Miner — the extensions programme" chapter to the SuperAdmin
 * **Technical Design Notes** (`tech-design` collection, /tech-notes).
 *
 * Records the non-obvious engineering behind plan phases 0–10 (product 2.9,
 * 2026-09-10) — specifically the decisions that are invisible in the diff and
 * expensive to rediscover: what the storage constraint forces, why several
 * things REFUSE rather than approximate, and the two classes of defect the
 * programme kept finding.
 *
 * Idempotent: upserts the chapter + each section by heading; appended after the
 * last tech-design chapter.
 *
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   cd diagramatix
 *   npx tsx scripts/add-tech-notes-mining-workbench.ts                          # local
 *   DATABASE_URL="<prod url>" npx tsx scripts/add-tech-notes-mining-workbench.ts # prod
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";
const SLUG = "mining-workbench";
const TITLE = "Diagramatix Miner — the extensions programme (phases 0–10)";

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: "The constraint everything else follows from",
    body: [
      "**The importer is the only moment the truth exists.** `import/route.ts` says so in as many words: *\"Performance + analytics + governance aggregates must be computed NOW — raw events are transient.\"* `buildEventLog` produces traces, four functions aggregate them, and the events are then gone.",
      "",
      "So the governing rule of the whole programme is **store at import or never**. A field not captured at import is unavailable to that run *forever* — not \"until we add a recompute\". Every phase states which side of that line each new field falls on.",
      "",
      "Two consequences that shaped the sequencing:",
      "",
      "- **Phase 1 stored per-case `durs` (per-event sojourn) and `res` (per-event resource, as indices into a dictionary) before anything read them.** Without those vectors a filtered activity table, a filtered heat map and a filtered transitions table are all impossible — the case index carried a cycle time and nothing else. The review's claim that activity metrics could be recomputed browser-side from the filtered set was simply false against the shipped schema.",
      "- **A run that predates a field can never gain it.** Every reader therefore tolerates absence and says so, rather than reporting a zero. `AnalyticsDetail` is three-valued for exactly this reason: `\"full\"`, `\"counts\"`, and ABSENT — which means *unknown*, not *none*.",
    ].join("\n"),
  },
  {
    heading: "The seam: why one hook made a filter cheap",
    body: [
      "`useRunView` was introduced in Phase 1 as an **identity view** — a hook that returned exactly what was passed to it — with one rule attached: *no panel reads the fetched `analytics` directly; every panel reads the run view.*",
      "",
      "That cost an hour and converted Phase 5 (filtering) from a retrofit of eight panels into a **one-line change**: the call that passes the filter into the seam. Nothing else in the panel body moved.",
      "",
      "The rule is now enforced by test rather than documented (`tests/mining/insights-seam.test.ts`). It reads the panel's own render and fails if any tab is handed the unfiltered `analytics` or `variants`. This is the one defect in that phase no unit test could catch: every panel would be individually correct, both figures would render, both would be plausible, and only somebody who already knew the answer would notice one number was whole-run while its neighbour was sliced. The moment that happens, every figure in the workbench becomes uncitable.",
      "",
      "**`FilterBar` is the documented exception** — it takes the whole-run analytics deliberately, because it shows the vocabulary you can filter BY and the unchanging chart you brush over.",
    ].join("\n"),
  },
  {
    heading: "Exactness: the vocabulary a figure may use about itself",
    body: [
      "Four states, not two, because a run without per-event vectors cannot honour a time-shaped filter and must say so rather than showing a whole-run number in a filtered context:",
      "",
      "- **`whole`** — no filter active. The ordinary case, and it wears no chip: an unfiltered run should not be littered with labels.",
      "- **`filtered`** — exact for the slice.",
      "- **`estimated`** — filtered, but the case index is a 1-in-N stride of a large run. Both numbers are returned (the raw matched count and the scaled estimate) from ONE stride, so no two figures on the page can disagree with each other.",
      "- **`unfiltered`** — this panel cannot honour the filter. The WHOLE-RUN number is shown, labelled in rose. Never averaged, never scaled, never quietly narrowed.",
      "",
      "The split matters: **counts filter from the case index alone; timings need the per-event vectors.** A run with `detail: \"counts\"` narrows its case counts and cycle times exactly, and hands back whole-run activity and edge figures untouched. That distinction is the phase.",
      "",
      "`filterAnalytics` proves its own exactness: `T3800` asserts that a filtered rebuild equals what `computeAnalytics` produces when only those cases were ever in the log. Not approximately — equal.",
    ].join("\n"),
  },
  {
    heading: "What the data cannot say, and the refusals that follow",
    body: [
      "Several features in this programme are defined as much by what they decline to compute. Each of these would have produced a confident, plausible, wrong number.",
      "",
      "**In-step vs between-step time does not exist.** An event log records ONE timestamp per event, so the interval between two events is a single number and nothing says how much was work and how much was waiting. Worse, `computeAnalytics` pushes that same interval into both the from-activity's `totalTimeMs` and the edge's samples — *the same milliseconds under two names*. The transitions table is therefore presented as a DECOMPOSITION of the bottleneck figure, not an addition to it, and `T3777` pins the arithmetic. Without that, a reader summing both tables doubles the elapsed time of their own process.",
      "",
      "**`pingPongFromVariants` returns 0 on any business log.** It reads app names out of `\"Switch to X\"` / `\"Open X\"` / `\"X:\"` labels. The review proposed widening its trigger to business processes, which would have shipped a confident ZERO on every one of them. Team ping-pong is a different function over different data — A→B→A across the per-event `res` vectors.",
      "",
      "**A dominant-team handover map is wrong exactly where it matters** — on the activities more than one team performs, which is precisely what the Activities tab flags amber. Where the per-event vectors are missing the fallback is computed, labelled `approximate`, and reports HOW MANY multi-team activities make it a guess. Ping-pong is omitted entirely rather than shown as zero, because a zero is a claim that the process does not bounce.",
      "",
      "**Two runs whose vocabularies barely overlap are not comparable.** Link January's *Order to Cash* to February's *Complaints Handling* and every delta is arithmetic on unrelated numbers — indistinguishable from a dramatic regression. The threshold is a deliberately generous 60%: a process genuinely changes between periods.",
      "",
      "**Phase 8 is stricter than Phase 7 on purpose.** The handover map will show an approximation with a label on it; the recommendations engine will not ADVISE from one. An approximation is fine to look at and is not a safe basis for telling somebody what to do.",
    ].join("\n"),
  },
  {
    heading: "Compute first, narrate second",
    body: [
      "`findActions()` ranks findings deterministically by share of total elapsed time. The AI narration route (`runs/[runId]/next-steps`) runs it FIRST, unconditionally, on the server, and hands the model **only the ranked findings as text** — no analytics, no variants, no case index.",
      "",
      "The model therefore cannot reorder them, cannot add one, and cannot reach past them to invent a different reading of the data, because it never sees the data. `T3875` reads the route and fails if anything else joins the prompt.",
      "",
      "All three exits — nothing to say, AI disabled, AI unreachable — return the computed findings. The list is the product; the prose is a garnish.",
      "",
      "**A threshold bug worth remembering.** The first version used a flat *\"a step holding 20% of elapsed time is a bottleneck\"*. A process of five equal steps gives every one of them exactly 20%, so a perfectly even process reported a bottleneck — the exact noise the phase exists to avoid. Thresholds are now relative to an EVEN share (1.5× what an even split would give) with an absolute floor underneath.",
    ].join("\n"),
  },
  {
    heading: "One writer per JSON column, and why",
    body: [
      "Prisma 7 omits JSON fields from a model's update input, so every write to `ProcessMiningRun`'s JSON columns is raw SQL. There were **eleven** such statements (the plan estimated six), each spelling its own column names in a string literal, lining up its own `$n` placeholders, and `JSON.stringify`-ing by hand. Nothing checked any of it.",
      "",
      "`runStore.ts` replaces them with a patch object. The column list is the type, so a misspelling is a compile error; the SQL is generated from the keys present, so **a column omitted from a patch is genuinely left alone** rather than overwritten with null.",
      "",
      "That distinction is not pedantry — it is two shipped rules that were previously kept only by remembering to omit or include the right column in the right literal: **`kpiConfig` must survive a live refresh** (absent from the patch), and **`governance` must be clearable** when a re-import finds no GRC columns (explicit null).",
      "",
      "`referenceSmId` is allowed through despite not being JSON, because the conformance write must be atomic with it: a run whose result and reference disagree is worse than either being stale. It is passed as text — stringifying it would store `\"diag-7\"` WITH the quotes and break every reference lookup.",
      "",
      "Two call sites are inside a Prisma transaction, so `runPatchSql` is exported separately and those run it on the transaction client. `diagramStore.writeDiagramData` does the same job for the five hand-written `UPDATE \"Diagram\" SET data` statements in the mining paths. **Both are guarded by tree-scanning tests**, because phases 1, 6 and 9 each add another write site and a twelfth hand-written statement would compile and pass everything else.",
    ].join("\n"),
  },
  {
    heading: "The run series, and the only real column",
    body: [
      "`ProcessMiningRun.parentRunId` is the one physical schema change in the programme (PRODUCT_VERSION 2.8 → 2.9; the XSD is untouched because a run is not part of a diagram export, and `ddlGenerate.ts` is unaffected because this is an operational table).",
      "",
      "`snapshot/route.ts` had frozen runs into dated copies since it shipped and recorded **no link back**, so the history existed and could only be reassembled by guessing at name prefixes. The snapshot is the **child** — it is the older observation and the live run carries on from it. Pointing it the other way would make every new snapshot re-root the series.",
      "",
      "**The auto-snapshot on refresh is bounded three ways**, because a source polled every five minutes would otherwise write 288 runs a day and a history nobody can read is worse than none: an interval (one per day), a cap (30, oldest pruned first), and nothing written when nothing changed. It is best-effort — the live run is the product, the archive is not worth failing a refresh over. Only snapshots the system made are prunable; a hand-taken one is somebody's deliberate record. Deleting a link re-points its child at its own parent so the chain never breaks.",
    ].join("\n"),
  },
  {
    heading: "Watching: the two bugs in one loop, and saying it once",
    body: [
      "The poll loop had two faults that combined into one blind spot. It selected only `webhook` and `azure-blob` sources — so a SharePoint feed that died was never fetched — and it short-circuited on `if (hasNew)`, so a source with nothing new did nothing at all. **Silence was precisely the state the watcher could not see**, and silence is the cheapest and most valuable alarm there is: a dead feed raises no error anywhere, and a dashboard of stale numbers looks exactly like a dashboard of stable ones.",
      "",
      "Refreshing still requires new data. **Watching no longer does.**",
      "",
      "**De-duplication is its own module** (`alertDispatch.ts`) because it decides whether the channel is still read in a month. A condition is announced once, keyed on run + kind + headline — so one that WORSENS (94→71, then 94→50) is a different key and is raised again, while one that merely persists is not, until a fortnight has passed.",
      "",
      "There is deliberately **no new column** for this: recent notifications are read back and their keys compared. The record of what somebody was told IS the notification, and a separate `lastAlertedAt` field would be a second source of truth that can disagree with what is actually in their bell.",
      "",
      "When the history cannot be read it **announces** rather than staying silent — a duplicate message is a smaller failure than a missed one — and a failed write is counted rather than thrown, because this runs beside the refresh inside a cron.",
    ].join("\n"),
  },
  {
    heading: "Two recurring defect classes",
    body: [
      "Worth naming, because both recurred across phases and neither is visible to an ordinary unit test.",
      "",
      "**1. Shipped, tested, reachable by nothing.** `holdoutPct` was accepted by the import route, implemented by `splitByTime`, covered by T3503–T3506 — and had zero callers, while the validation panel told users to *\"re-import the log with a hold-back\"*, which no screen could do. The same shape appeared three more times: the `studyId` the calibrate route returned and the caller discarded; the `edgeThreshold` the discover route accepted and nothing sent, while the published User Guide already described the slider; and the recompute route built in Phase 0.3 with no caller. A unit test cannot see this — the code works. The guards therefore ask the OTHER question: *does anything call it?* (`tests/mining/twin-seam.test.ts`, `slice-discovery.test.ts`.)",
      "",
      "**2. The system reports success while its claim quietly becomes false.** A live refresh recomputed `performance` over every trace and so **silently dropped the hold-back** — an out-of-sample validation became in-sample, the twin went back to marking its own homework, and the panel went on reporting whatever the deleted field implied. Nothing broke. Likewise the baked example catalog had been stale since Phase 1, so all five catalog examples were teaching the previous version of the views they exist to demonstrate; and 20 of 26 mining routes had no subscription gate at all. The suite is good at catching crashes and bad at catching this, which is why so much of the programme's testing is tripwires over the file tree rather than assertions over return values.",
    ].join("\n"),
  },
  {
    heading: "Known gaps",
    body: [
      "Recorded here rather than left to be rediscovered:",
      "",
      "- **No compare panel.** Phase 9's comparison is computed and served by `GET runs/[runId]/series` — the refusal travels with the data, so an API consumer cannot get a nonsense diff — but the console has no side-by-side view. It is the one item in that phase a user cannot reach.",
      "- **No email delivery for alerts.** The in-app notification and the bell are wired; email is a separate delivery path.",
      "- **`task-mining` is enforced on the ARTEFACT, not the tab.** Producing the SOP server-side created the boundary Phase 0.1 could not find, and the read-only Automation view still renders for anyone who can open the run, because its inputs are the same variants every other mining feature needs. Moving that computation server-side is a larger change.",
      "- **Item 10 (REST / database connectors) declined.** Half a connector ships an SSRF boundary nobody has reason to trust yet; `blobUrl.ts`'s guard is the template, not a formality.",
      "- **The console's `onFile` duplicates `parseAnyLog`.** The latter exists and is used by the pull connectors; the console's version additionally handles `.xlsx` and the OCEL-study branch. Converging them is outstanding.",
      "- **Phase 11 (the examples programme) is not started** — including the cold start, where a user opening the Miner on their own project still gets a bare file picker. The plan calls that a bug rather than an example.",
    ].join("\n"),
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    let chapter = await prisma.helpChapter.findFirst({ where: { slug: SLUG, collection: COLLECTION }, include: { sections: true } });
    if (!chapter) {
      const last = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION }, orderBy: { sortOrder: "desc" } });
      const created = await prisma.helpChapter.create({
        data: { slug: SLUG, collection: COLLECTION, title: TITLE, sortOrder: (last?.sortOrder ?? 0) + 1 },
      });
      chapter = { ...created, sections: [] };
      console.log(`Created chapter "${TITLE}".`);
    } else {
      await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: TITLE } });
      console.log(`Chapter "${TITLE}" exists — updating sections in place.`);
    }

    let i = 0;
    for (const s of SECTIONS) {
      const existing = chapter.sections.find((x) => x.heading === s.heading);
      if (existing) {
        await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  update "${s.heading}"`);
      } else {
        await prisma.helpSection.create({ data: { chapterId: chapter.id, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        console.log(`  insert "${s.heading}"`);
      }
      i++;
    }
    console.log("Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
