# Diagramatix — Miner Extensions Plan

| | |
|---|---|
| **Created** | 2026-09-09 |
| **Source** | [`Miner-Capability-Review.html`](./Miner-Capability-Review.html) — the *Extensions* section: eight extensions + eleven smaller items, read from the shipped code |
| **This document** | The **live worklist** for building them. Every phase names the files it touches and the existing functions it reuses. The review is the historical argument; this is the burn-down. |
| **Scope** | All 8 extensions + all 11 smaller items. Nothing dropped — two are **re-specified** rather than built as written, and each says why on its face. |
| **How to use** | Work an item, tick its box, set **Status** → `In progress` / `Shipped (<commit>)` / `Won't do (<reason>)`. Record what actually happened — including deviations — in the phase's own **As built** paragraph, so this doubles as a decision log. |
| **Progress log** | **2026-09-09** — **PHASE 4 SHIPPED** (T3773–T3790): `analytics.edges` reaches a screen at last as a ranked "Between steps" table, the discovered model's arrows carry the median gap and a thickness, and the detail slider the User Guide already described now exists. **The in-step vs between-step split was REFUSED**: one timestamp per event means the same milliseconds are already counted under the from-activity, so the split would have been fabricated and summing the two tables would have doubled the process. Slice (b) turned out to be one conditional, safe because almost nothing in the tree sets `weight` — now a test. **PHASE 3 SHIPPED** (T3763–T3772): the hold-back reaches a screen for the first time, the calibrate hand-off stops discarding its study, and a refreshed run marks its twin stale rather than silently re-calibrating. A FOURTH defect surfaced while building: a live refresh was silently DROPPING the hold-back, so an out-of-sample validation quietly became in-sample and the panel said otherwise. **PHASE 0 COMPLETE** (0.3–0.6, T3681–T3762): the recompute contract refuses the four per-event fields by name rather than approximating them from variants; a test floor under the five untested modules; eleven hand-written run-JSON statements (not six) became one patch helper with a guard that was proved to fire; and **0.5 answered on evidence — the generator is deterministic, the baked catalog was merely STALE, and all five examples had been teaching pre-Phase-1 analytics since Phase 1 shipped ahead of its own gate.** **2.3 SHIPPED** (T3657–T3680): several systems merge into one lifecycle, ids unified by shared key or crosswalk (union-find, so chains resolve), a refusal when nothing overlaps, and CROSS-SYSTEM HANDOVER measured at the join — the days nobody owns, which neither export contains. **0.2 SHIPPED**: the console went 1,183 → 153 lines (44 `useState` → 5) into `console/ImportPanel`, `console/RunList`, `console/RunDetail`. **No tab shell** — this plan's own text contradicted itself and the e2e settled it. Which turned up the next thing: that e2e looked for a button renamed months ago, so the Miner's only route-level coverage was failing before it reached what it covered. **2.1 SHIPPED** (T3647–T3656): `.xlsx` read directly, no new dependency. **2.2 SHIPPED** (T3631–T3646): wide exports expand to one row per event. — Plan written. Reconnaissance found **four things the review got wrong** and **one it does not mention at all** (the gating hole), all recorded below against the item they affect. **Step 1 SHIPPED**: 20 of 26 mining routes now carry a subscription gate (was 3), the three dormant tier keys are enforced, and `tests/mining/route-gating.test.ts` (T3609–T3613) enumerates the route tree so the twenty-seventh route cannot be added ungated. **Phase 1 SHIPPED** (T3614–T3630) — and its budget test found a CRASH: `Math.min(...xs)` threw past ~125k elements in three places, so any log beyond ~125,000 events could not be imported at all. **Phase 8 ADDED** after Paul asked whether the plan gave the user a course of action; it did not, and neither does the review. The cut line moved to after it. **Phase 2 ADDED** — three input questions the plan could not answer: no `.xlsx`, wide-format exports silently read as one event, and no way to merge several systems' exports of the same cases. Placed second, because a user who cannot load their export is not reached by anything else. Phases 2–10 renumbered to 3–11. |

**Status values:** `Not started` · `In progress` · `Shipped (<commit>)` · `Blocked (<on what>)` · `Won't do (<reason>)`

---

## Why

The review closes with a judgement worth restating, because it is what every phase below is aimed at:

> The mining is ahead of the reading.

The Miner answers *what is happening* thoroughly. It answers *what changed*, *for which cases* and
*tell me when it moves* not at all — and those three are what turn a discovery exercise into
something a team runs against its own process every month.

Reading the code sharpened that into something the review does not say, and it governs the ordering
of everything below:

> **The importer is the only moment the truth exists.** `buildEventLog` produces traces, four
> functions aggregate them, and the raw events are then gone. `import/route.ts` says so out loud:
> *"Performance + analytics + governance aggregates must be computed NOW — raw events are transient."*
>
> So the reading is ahead of the **storing**, and **the storing only happens once**. A field not
> captured at import is unavailable to that run *forever* — not "until we add a recompute", because
> there is nothing left to recompute from.

Three of the eight extensions are render work over data already in the database. Three more are
blocked on data the importer **computes and discards inside the same function**. That asymmetry is
the plan.

*(One exception, and it matters: `MiningSource.buffer` keeps up to 100k raw rows, and
`refreshRunFromSource` re-runs the whole pipeline. Live sources really can recompute. Manual runs
cannot. Phase 0.3 makes that distinction explicit rather than letting it be discovered.)*

---

## Ground rules (apply to every phase)

1. **Store at import, or never.** Raw events are transient. Every phase that adds a stored field
   states which side of that line it falls on, and what an older run without it will say instead.
2. **Every figure is visibly filtered, visibly not filtered, or visibly estimated.** The review names
   the first two. The 50,000-case stride forces the third: on a capped run a filtered figure is an
   estimate, and a filter selecting a rare value may resolve to almost nothing. *"If a panel cannot
   honour the filter yet, it should say so on its face, not average the two."*
3. **Defaults preserve behaviour.** Every addition is inert when unset; the regression bar for
   Phase 1 is bit-identical results for the five catalog examples with the new fields ignored.
   Per `schema/UPDATE_EVERYTHING.md` Step 0, a new key inside an existing `Json` column is **data,
   not structure** — no version bump. Only Phase 8 adds a real column.
4. **Honest floors: refuse rather than flatter.** Below a support threshold, report the count and
   decline the statistic. A median over two samples is not a median.
5. **Tests** are numbered append-only from **T3609** and added to `tests/TESTS_SUMMARY.md`. Never
   renumber or reuse.
6. **`npm run build` is not optional.** `refreshRun.ts` imports Prisma and sits in `app/lib/mining/`
   beside pure modules that client components import. That is the exact shape that broke the
   Simulator's deploy with a green `tsc` and a green unit suite.

---

## Phase 0 — Foundations (blocking)

**Status:** ✅ `Shipped` — 0.1 to 0.6 all done.

Nothing here is a feature. All of it is a prerequisite, and each item costs an hour now and a week
later.

### 0.1 Close the gates ✅

**Status:** ✅ `Shipped` — done ahead of the plan, as its own commit, because it is a revenue defect
rather than a renovation item.

- [x] `gateFeature(…, "processMining")` added to the 16 project-scoped routes that had none —
      `discover`, `discover-sm`, `conformance`, `calibrate`, `validate`, `explain`, `export`,
      `analysis-export`, `snapshot`, `import-ocel`, `runs`, `runs/[runId]` (all three handlers),
      `diagrams`, `reference-sms`, `sources/[sourceId]`, `sources/[sourceId]/refresh`
- [x] `process-mining-ocel` enforced on `import-ocel`; `process-mining-examples` on the gallery list
- [x] `calibrate` requires **both** `processMining` and `simulator` — it spans two products
- [x] `tests/mining/route-gating.test.ts` — T3609–T3613

**As built.** Enforcement stood at **3 routes out of 26**; it now stands at 20, with the other six
exempted *by name and with a reason* in the test: the public webhook (no session exists to check a
subscription against), the cron poll (runs as nobody), and four SuperAdmin catalog routes (gated by
role, not plan). The test enumerates the route tree rather than asserting a 403 per route — the
failure that actually happened was a route nobody wired, not a route wired wrongly, and a
twenty-seventh route added next month is caught the same way.

The gallery was the sharpest case: the *link* was hidden for unentitled users while
`GET /api/mining-examples` answered anyone signed in. **Hiding a door is not locking it.**

**Not fixed here, and stated rather than left implied:** `task-mining` is still not enforced
server-side. The Automation tab, the RPA spec and the SOP are computed **in the browser** from
`variants` the run fetch already returns, so there is no server boundary to gate without moving that
computation. Phase 7 touches those files and is where it belongs.

**Safe because gaps fail open.** `getLevelMatrix` defaults every key to `available` and only
restricts once a row explicitly says otherwise, so gating a key that has not been seeded is a no-op
today and correct the moment it is seeded.

### 0.2 Break up the console ✅

**Status:** ✅ `Shipped`

- [x] `ProcessMiningConsole.tsx` — **1,183 lines, 44 `useState`** — split into
      `app/components/mining/console/`: `ImportPanel`, `RunList`, `RunDetail`,
      `SaveRunAsExample`, `shared.ts`
- [x] The shell keeps only what genuinely spans the screen: the run list, the selection, deletion

`MiningSourcesPanel`, `LiveDemoPanel`, `MiningLogViewer` and `ValidateTwinPanel` already stood alone
and simply moved. Five of the eight extensions add a panel to this file; doing it later means every
phase's diff fights it.

**As built — 1,183 → 153 lines in the shell**, and the state went with the panels rather than being
lifted: 44 `useState` calls became 5 in the console, 22 in `ImportPanel` and 14 in `RunDetail`.
Nothing about the staged rows, the column mapping, the wide-format detection or the OCEL type picker
is of any interest to the run list, and none of it is visible to it any more. The console learns one
thing from the importer — that an import landed.

**Three deviations from this plan's own text, each deliberate:**

1. **No tab shell.** The line above said "behind a top-level tab shell" and, two sentences later,
   "behaviour-preserving, zero new features" — those contradict each other, and
   `e2e/mining-examples.spec.ts` settles it: it selects a run and expects the conformance controls
   visible immediately. Tabs would have broken the Miner's only route-level coverage. **A refactor
   phase is the wrong place to change what a user sees.** Panels, not tabs; the single scroll stands.
2. **Errors now appear where they happened.** One `err` state was shared by the whole file, and it
   was rendered inside the *Import* section — so a conformance or calibration failure printed its
   message at the top of the page, far from the button that failed. Splitting the state made keeping
   that behaviour more work than fixing it.
3. **A stale file no longer leaves a stale banner.** Loading a second file after expanding a wide one
   kept the "✓ Expanded to N events" banner from the first (`onFile` never cleared `wideResult`;
   `loadSheet` did). Both paths now go through one `stage()`.

Also corrected in passing: the panel's own description still said "CSV/TSV, XES or OCEL" after 2.1
shipped `.xlsx`, while the file picker had accepted workbooks all along.

**The e2e this phase leans on was not protecting anything — for two independent reasons.** It
opened with `test.skip(!process.env.ANTHROPIC_API_KEY, …)`, so it skipped in every environment
without a key, including this one; and it looked for a button named `/Create AI reference/` when the
button has been `＋ Create reference` since reference creation became deterministic-by-default — an
assertion that could not have matched had it ever run. Both are the same stale assumption: that
scaffolding a reference calls Claude. It does not (`ai:false` is a straight copy of the mined
lifecycle), so the skip is gone, the selector is fixed, and **the test now runs and passes for real**.
That is the first time this phase's stated verification has meant anything.

Verified: `tsc` clean, `npx vitest run tests/mining` 187 green, `npm run build` green,
`e2e/mining-examples.spec.ts` 6 passed.

### 0.3 State the recompute contract, and build the honest half ✅

**Status:** ✅ `Shipped` — T3747–T3754.

- [x] `POST runs/[runId]/recompute`
- [x] `app/lib/mining/recompute.ts` — the contract as a pure, testable plan

The contract: a run recomputes **from what is stored** — never from raw events, which do not exist.
Live runs get the real thing by reusing `refreshRunFromSource` against `MiningSource.buffer`.

Absorbs **smaller item 05** — correctly, rather than as advertised. See *Corrections*, below.

**As built.** "Recompute" sounds like one operation and is two, so `planRecompute()` decides which
before anything runs:

- **`source`** — a live source with a non-empty buffer. Raw events still exist; rebuild everything.
- **`stored`** — a manual import. Only what derives from `variants` is redone: the discovered
  process, the discovered lifecycle, the conformance replay. All three are already pure over
  `variants`, which is why this is possible at all.
- **`impossible`** — no variants and no buffer. Says re-import, and does nothing.

**The refusing is the feature.** It would have been easy to recompute `performance` from
`variants` — a variant knows its activity sequence and its frequency — and every duration would have
looked plausible and been invented, because a variant has no timestamps, no resources and no
attributes. So `stats`, `performance`, `analytics` and `governance` are each **refused by name with
the reason**, carried as data rather than as prose in a route so the answer survives the next phase
that adds a field (T3749). The response also never claims the imported figures changed (T3752), and a
run with nothing to rebuild says so instead of reporting success (T3751).

**An empty buffer is not a live run** (T3748) — treating it as one would replace a real import with
nothing. And source mode is checked *first*, so a live run whose variants were never written can
still be rebuilt (T3754).

**An existing guard caught this route before it shipped.** T2941 — "every route that lays out a BPMN
diagram passes `onDiagnostic`", written after Paul reported the editor showing no diagnostics —
failed on the new route, which re-lays out a discovered process and discarded what the layout could
not take at face value. A re-layout can dangle a reference exactly as an original can, and a diagram
that *looks* fine is how those survive. Fixed before commit. Worth recording as evidence that the
tripwire idiom this plan keeps reaching for actually earns its keep on code it never anticipated.

**Named debt: the route has no caller yet.** Phase 0's regression bar is "no user-visible change",
which means no button — and a tested route with no caller is precisely the `holdoutPct` pattern this
plan opens by complaining about. So its consumer is stated rather than assumed: **Phase 5**, whose
whole claim is that violation case lists are "pure over stored data, so every existing run gains this
without re-import". That is this route. If Phase 5 is cut, this should be cut with it rather than
left to accumulate.

### 0.4 A test floor under the modules about to change ✅

**Status:** ✅ `Shipped` — T3692–T3746 (55 tests across five files).

- [x] `performance.ts` — T3692–T3704 · `heat.ts` — T3705–T3711 · `exportAnalysis.ts` — T3712–T3724
- [x] `pull.ts` — T3725–T3734 · `refreshRun.ts` — T3735–T3746

None had any coverage, and phases 1–4 change all of them.

**Where the value is, module by module** — these were not written to a uniform template, because the
five modules fail in quite different ways:

- **`performance.ts`** is the one that turns a log into the simulation twin, so every number a mined
  business case shows starts here. Pinned: a step lasts until the *next* event and the last event of
  a case has none (T3692); team capacity is maximum *concurrency*, not a count (T3698); back-to-back
  work needs one person, not two (T3699); an unattributed event invents no team (T3702); the
  hour-of-week histogram is Monday-first, or the twin works weekends (T3703).
- **`heat.ts`** returns a *copy* — mutating in place would repaint the user's saved discovered
  diagram, silently (T3705).
- **`exportAnalysis.ts`** is what leaves the building. A report is the worst place for a silent
  defect, because a wrong duration reads as a fact. Pinned: durations are numbers in a spreadsheet,
  not formatted text (T3721), and with no SLA there is no outcome section rather than a 100%
  on-time claim against an SLA nobody set (T3716).
- **`pull.ts`**'s buffer maths is the only place a live source's history is kept, and every way it
  can go wrong is silent: a file whose columns arrive in a different order than last time is
  realigned rather than appended raw (T3725), and the cap drops the *oldest* — slicing the other end
  would freeze a run at its first N events and quietly stop it being live (T3730).
- **`refreshRun.ts`** runs unattended, so its refusals matter more than its work: a source with no
  run, or a mapping that lost its timestamp column, must stop rather than rebuild from nothing
  (T3735, T3736).

**Two of these encode rules that were previously kept only by omission** and are now kept explicitly:
a live refresh must not clear the SLA (T3739), and must not clear a conformance result the user set
by hand (T3746).

**One test was wrong before the code was.** The first draft of T3708 probed the heat gradient on the
red channel; the ramp runs pale blue → amber → red, so red *peaks* at the amber midpoint (251) and
falls again at the hot end (220). Blue is the honest temperature channel. Worth recording because the
assertion looked obviously right.

### 0.5 Decide the example-generator question ✅

**Status:** ✅ `Shipped` — **decision: regenerate and KEEP.** T3756–T3762.

- [x] Regenerated, diffed, and pinned

Line 486 writes `{ examples: [...] }` over `miningExampleData.json` **wholesale** — the same hazard
that cost the Simulator three examples, where regenerating produced materially *worse* packages and
the generator was retired.

**The decision was made on evidence, not on the analogy.** The generator was run and the output
diffed against what was committed:

- Every sample log reproduced **byte-for-byte** — the `mining/*.csv` files did not change at all.
- Every case count, variant count, diagram and reference was identical across all five examples.
- The **only** change was that all five packages gained the analytics fields Phase 1 added:
  `detail: "full"`, a `resourceDict`, and per-case `durs`/`res` vectors. 12,107 inserted lines,
  all of them that.

So this generator is deterministic and faithful, and the baked file was not at risk of being made
worse — it was simply **stale**. The opposite of the Simulator's problem, and the fix was to run it.

**This closes Risk 1, and it was a live defect rather than a hypothetical one.** Phase 1 shipped
ahead of this gate, so since then all five catalog examples had been carrying pre-Phase-1 analytics —
including `live-order-processing`, which adopts a pre-created run and would have taught the previous
version of the views it exists to demonstrate.

**Pinned so it cannot recur** (`tests/mining/example-data-shape.test.ts`). The generator is *not* run
in the test — it writes files and takes seconds — but the properties of its output are asserted, so a
bake left behind by a later phase fails in CI: the current analytics shape is present (T3758), the
per-event vectors line up with the events they describe (T3759), resource indices point at real names
(T3760), and the case index agrees with the stats (T3761). **Verified by running them against the
pre-regeneration file: T3758 and T3759 fail on it and pass on the new one.**

### 0.6 One JSON-write helper ✅

**Status:** ✅ `Shipped` — T3681–T3691, T3755.

- [x] `app/lib/mining/runStore.ts` — `updateRunJson(runId, patch)` + `runPatchSql`
- [x] `app/lib/mining/diagramStore.ts` — `writeDiagramData(id, data)`
- [x] Tree-scanning guards so a later phase cannot add another by hand

All JSON persistence bypasses Prisma via raw `pgPool` SQL, each an untyped column name inside a
string literal. Phases 1, 6 and 9 each add another.

**As built — there were eleven, not six.** `import`, `import-ocel`, `conformance`, `runs/[runId]`,
`snapshot`, `sources`, `refreshRun` (×2), `adoptMiningPackage` (×2, inside a Prisma transaction) and
`adoptRiskControlExample`. Two of them are transactional, so the helper exposes `runPatchSql`
separately and those run it on the transaction client — an adopt that half-committed would leave a
run with scalars but no log.

**The patch object is the point, not the tidiness.** A patch cannot get wrong the three things eleven
hand-written statements each could: which columns are touched, which `$n` each value binds to, and
the difference between "leave this column alone" (`undefined`) and "write NULL" (`null`). That last
one is not pedantry — `kpiConfig` must survive a live refresh and `governance` must be *clearable*
when a re-import finds no GRC columns, and both were previously kept only by remembering to omit or
include the right column in the right literal (T3682, and T3739/T3740 in 0.4).

**`referenceSmId` is allowed through despite not being JSON**, because the conformance write must be
atomic with it: a run whose result and reference disagree is worse than either being stale (T3685).
It is passed as text, not stringified — quoting it would store `"diag-7"` *with* the quotes and
quietly break every reference lookup (T3684).

**Same hazard, one table over.** The five hand-written `UPDATE "Diagram" SET data` statements in the
mining paths became `writeDiagramData`. Deliberately tiny and mining-scoped — the editor has its own
much larger save path with autosave and versioning, and nothing here should look like an invitation
to bypass it.

**Both guards were proved to fail** by planting an offending statement: T3691 (runs) and T3755
(diagrams) each caught it, then went green again on removal. A guard that scans a file tree is worth
exactly nothing until it has been seen to fire.

**Regression bar for the whole phase:** no user-visible change whatsoever.

---

## Phase 1 — Keep what we are about to need; the importer only runs once

**Status:** ✅ `Shipped` · No UI but the mapping step. **This is the phase the ordering exists for.**

- [x] `CaseSummary.attrs` — unmapped columns as case attributes, from the case's first event
- [x] `CaseSummary.durs` — per-event sojourn, integer ms, aligned to the variant's event sequence
- [x] `CaseSummary.res` — indices into a new `RunAnalytics.resourceDict`
- [x] `RunAnalytics.attributes` (values + cardinality + a reason string for columns too
      high-cardinality to filter on) and `RunAnalytics.detail`
- [x] `ActivityMetric.resourceCounts` — already computed in `resByActivity` and thrown away
- [x] The **`useRunView()` seam** in `MiningInsightsPanel`, with an identity filter
- [x] Per-column **keep / hash / drop** on the mapping screen, defaulting to drop
- [x] **Unplanned, and the important one:** `numeric.ts` — `minOf`/`maxOf` (see *As built*)
- [ ] Deferred: the missing `.xlsx` importer

**As built.**

**A crash, not a limitation.** The test that builds a deliberately large log to
exercise the detail budget did not fail its assertion — it threw
`RangeError: Maximum call stack size exceeded` inside `buildEventLog`.
`Math.min(...times)` passes every element as an argument, and V8 gives up past
roughly 125,000 of them. The pipeline spread per-EVENT and per-CASE arrays in
three places (`parseEventLog`, `analytics`, `calibrateSimulation`), so **any log
beyond about 125k events could not be imported at all** — it did not degrade, it
crashed, and that is well inside what this feature invites people to upload: the
live-source buffer alone caps at 100,000 rows. Fixed with `numeric.ts`; T3629
pins it by asserting the spread form still throws.

**Masking shipped in this phase, as the plan required.** The mapping screen now
offers keep / hash / drop per spare column, defaulting to **drop**, plus a
separate tick to mask the case id — for when it is really a customer number. The
digest is a dependency-free FNV-1a pair rather than `crypto`, because this module
is imported by client code for the pre-import preview and pulling `node:crypto`
into that graph is the shape that has broken this product's build before.

**The seam ships with no filter behind it, on purpose.** `useRunView` is an
identity view today and owns the exactness vocabulary — *whole / filtered /
estimated / unfiltered*. The rule it exists to enforce is written at the top of
the file: no panel reads the fetched analytics directly. That is what turns Phase
4 from a six-panel retrofit into one change.

**Two things deliberately NOT done.** The `.xlsx` importer was listed as optional
and is deferred — it is unrelated to the storage argument and would have widened
the diff for no gain here. And Phase 0.2 (splitting the console) is
still outstanding, so the mapping UI added to it makes that file longer, not
shorter. Both are debts, and both are named rather than quietly carried.

**Absorbs.** The storage half of **extension 2**; **items 02, 03, 09**.

**Why the seam ships now, with no filter behind it.** One rule, adopted here and enforced for the
rest of the programme: **no panel reads the fetched `analytics` directly; every panel reads the run
view.** It costs about an hour, and it converts Phase 5 from a six-panel retrofit into a single
insertion. A panel that reads around the seam is a panel that will one day show unfiltered numbers
beside filtered ones — the one failure that makes every number on the screen unciteable.

**Why masking ships in this phase and not a later one.** This is the phase that starts persisting
columns the importer previously discarded, in a product where case ids are frequently customer
identifiers. A later phase cannot un-persist what shipped.

**Files.** `app/lib/mining/analytics.ts`, `parseEventLog.ts`, `types.ts`,
`app/api/projects/[id]/mining/import/route.ts`, `refreshRun.ts` (the live path must produce the same
shape), `console/MappingPanel.tsx`, `examplePackage.ts`.

**Reuses.** `resByActivity` (counts already computed), `variantIdx` (already the join key), and
`Performance.holdout` as the precedent for how an optional stored fact declares its own absence.

**Honest floor.** A `detail: "full" | "counts" | "none"` budget guard. When it trips, the vectors are
omitted and every time-shaped figure a filter would later touch says **not filtered on this run** —
never a silently unfiltered number beside a filtered one. Runs imported before this phase are
`detail: "none"` and say so, in the existing `NoAnalytics` idiom.

**Regression bar.** Bit-identical `stats`, `variants`, `performance`, `governance` and every
pre-existing `analytics` field, for all five catalog examples, with the new fields ignored.

---

## Phase 2 — Getting the log in at all

**Status:** ✅ `Shipped` — 2.1, 2.2 and 2.3 all done. · **Added 2026-09-09**, after Paul asked three questions about input that
this plan — and the review — had no answer to. **Placed second on purpose: if someone cannot load
their export, no later phase matters to them.**

- [x] `.xlsx` import — the format people actually have
- [x] **Wide-format unpivot** — one row per case, `state1, ts1, state2, ts2, …`
- [x] **Multi-file merge** — several systems' exports assembled into one run, with source provenance
- [x] An id **crosswalk** for merging, when the systems do not agree on the case id

### What already works, and is easy to mistake for a gap

A CSV or TSV from any system, with the columns mapped by hand, is the Miner's *primary* path and has
been since the first slice: `guessMapping()` reads the headers, pre-fills nine role dropdowns, the
user confirms or overrides, and a validation panel reports usable and dropped rows before anything is
committed. **That question is already answered.** The three below are not.

### 2.1 `.xlsx`

The picker takes `.csv .tsv .txt .xes .json .ocel .xml` — **not `.xlsx`**. Anyone with a genuine
Excel export has to Save As → CSV first, which is a small indignity in a product whose whole promise
is "start from the spreadsheet you already have". `excelSerialToMs` already exists to cope with
Excel's serial dates arriving inside a CSV, so the shape was half-anticipated and then not finished.

Listed as optional in Phase 1 and deferred there. **That was the wrong call** — the phase was about
storage and this is about reach, so it belongs here, not as a rider on something unrelated.

**As built (2.1 shipped).** `app/lib/mining/formats/xlsx.ts`. **No new dependency**: `jszip` was
already in the tree for the guide exporter and the diagram diff, and an `.xlsx` is a zip of XML.

**Dates are deliberately not interpreted.** A styled date cell is a number plus a format id, and
chasing `numFmt` through the style table to decide what a cell *means* is where this kind of reader
usually goes wrong. `parseTimestamp` → `excelSerialToMs` has understood Excel serials since long
before this module existed, so a serial handed straight through is read correctly by the code that
has always read them (T3653). One fewer thing to get wrong.

**Three alignment traps, each pinned by a test**, because all three corrupt data silently rather than
failing:
- Excel **omits empty cells entirely**, so counting `<c>` elements shifts every later value one
  column left — putting activities in the timestamp column. Cells are placed by their `r="B3"`
  reference (T3648), and rows by their own `r=` (T3649).
- Column references pass Z: `AA`, `BC`. A wide export really does reach them (T3656).
- The header row is the first row with **anything** in it, because exported sheets routinely carry a
  blank line or a title above the table (T3650).

**Multi-sheet workbooks are offered, not silently narrowed.** Every sheet with rows is read; the first
is staged and a picker appears when there is more than one, rather than importing sheet 1 and
discarding the rest without a word.

### 2.2 Wide format — the shape most status reports actually come in

The parser assumes **long** format: one row is one event. A wide row —
`row id, case name, case id, state1, state1 timestamp, state2, state2 timestamp, …` — is read as a
single event and the rest of the row is **silently ignored**, which is the worst possible failure:
the import succeeds, the case looks like it had one step, and nothing says otherwise.

This is not an edge case. It is how nearly every status-history report comes out of an ERP or CRM,
and how anyone building one by hand in a spreadsheet would naturally lay it out.

The fix is small and entirely **before** the existing pipeline: identify the case-id column, identify
the `(state, timestamp)` column **pairs**, and emit one event per non-empty pair. Downstream is
untouched, because the output is exactly the long format `buildEventLog` already takes. Pairs can be
detected from header patterns and confirmed by the user, in the same idiom as the role mapping.

**Honest floor:** a row whose pairs are ragged (a state with no timestamp, or the reverse) is
reported, not guessed at — and a file that looks wide but cannot be paired should say so rather than
importing one event per case.

**As built (2.2 shipped).** `app/lib/mining/wideFormat.ts` — `detectWideSpec` / `unpivotWide`, pure,
client-side, before the file is ever sent. Both shapes are handled: **paired** (`Status 1` +
`Status 1 Date`, where the cell names the state) and **milestone** (`Approved On`, where the header
names the step and the cell is only a date) — the second is at least as common as the first and cost
almost nothing once the machinery existed. Output is ordinary long format, so `guessMapping`,
validation and `buildEventLog` are untouched (T3644, T3645).

**Detected, never applied.** Expanding a log silently would be the same class of mistake as the bug
it fixes, so the console states what it found — *"3 state/date pairs, keyed on Case ID"* — and what
would otherwise happen — *"each case would show a single step and the rest of its row would be
ignored"* — and waits for the button.

**Two false positives it took real care to avoid**, both found by tests rather than by reasoning:

- **`Date.parse` cannot be used for detection.** V8's legacy fallback reads `"C-1"` as a date in 2001,
  and `"1"` as one too. The first detector duly decided a column of case ids was a lifecycle, and the
  second decided the same about `Row ID`. Detection now matches explicit date SHAPES and only then
  confirms with `parseTimestamp`. `parseTimestamp` itself is left generous on purpose: by the time it
  runs the user has said "this column is the timestamp", so its willingness is a kindness rather than
  a hazard.
- **Sparse late columns.** Requiring several samples before believing a column holds dates misses
  precisely the columns furthest along the process, because the last state is reached by a minority
  of cases. A header that says "date" now lowers the evidence needed; a header that says nothing still
  has to prove it.

Events are sorted **by time, not by column order** (T3637): a spreadsheet's layout is not a claim
about sequence.

### 2.3 Several systems, one lifecycle ✅

**Status:** ✅ `Shipped` — T3657–T3680.

Today a manual import creates one run per file, always. Only a **live source** accumulates, and only
over the webhook.

**This is a different problem from smaller item 06, and the more valuable one.** Item 06 is *time*
continuation — "append next month's export" — and is re-specified as a linked run series in Phase 9.
This is *source union*: the CRM holds the front half of the lifecycle, the ERP the back half, for the
**same cases**. Neither system's export is the process; the union is.

Two things it needs that are not obvious from the requirement:

- **An id crosswalk.** If the CRM calls it `OPP-123` and the ERP calls it `SO-456`, merging by case
  id silently produces twice as many half-length cases — which, again, looks like a successful
  import. Either a shared column or a third mapping file, and a **refusal** when neither is present
  rather than a merge that cannot work.
- **Source provenance on every event.** Which system reported it, carried through as an attribute.
  This is the part that pays for the phase: it makes **cross-system handover** visible, and in a real
  process that is where the worst delay usually is — the days a case spends between two systems that
  nobody owns. It drops straight into the Phase 4 handover work.

**Honest floor:** report the overlap before importing — how many case ids appear in more than one
file, and how many in only one. A merge where the two files share almost no cases is a crosswalk
problem, and the user should be told that instead of being handed a run full of fragments.

**As built.** `app/lib/mining/mergeSources.ts` (pure) + `console/MergeCard.tsx`. The merged table is
an ordinary long-format log with canonical column names, so `buildEventLog`, discovery, conformance
and calibration are untouched and have no idea the log came from several systems.

**One call, not two.** `mergeSources()` returns the rows AND the assessment together, and the panel
reads both off the same result. A separate "summarise the merge" function would have been the
obvious shape and exactly the wrong one: the failure this phase exists to prevent is a merge that
*looks* like it worked, and a summary computed independently of the rows can say it worked when it
did not. Pinned by T3673 — the case count the banner promises is the case count the importer produces.

**Ids are unified with union-find, not a pairwise map.** A crosswalk of `OPP-1 → MID-1` and
`MID-1 → SO-9` describes ONE case across three systems; a pairwise lookup gives two, and a
three-system case cut in half is invisible in every downstream number (T3664). Links via a shared
business key go through the same structure, so a key and a crosswalk can be mixed.

**The canonical id follows the FIRST source, not the alphabet** (T3665). Reversing the file order
flips which system's ids the merged run speaks — which makes it the user's choice rather than an
artefact of sorting.

**Handover measurement is the payoff, and it is free here.** Walking the merged, time-ordered events
and noting where the reporting system changes gives *how often* a case crosses from one system to the
next and *the median wait* when it does. Neither export contains it — it only exists in the union —
and this is the one moment both halves are in the same place. Two traps, both pinned: an event both
systems report is not a handover (T3672, a 0-hour "wait" that would have flattered every merge), and
a duplicate is counted and reported rather than de-duplicated, because which copy is redundant is a
business question (T3670).

**Honest floors.**
- `verdict: "no-overlap"` **blocks the import** and names the two fixes (T3667). Silently merging
  files that share no cases doubles the case count and halves every trace.
- `verdict: "thin-overlap"` (under 5% shared) warns without blocking (T3668) — a crosswalk that
  only half works looks like a successful import too.
- Rows with no case id are dropped **and counted per source** (T3669); everything else, including an
  unparseable timestamp, is passed through so `buildEventLog` stays the single authority on
  "rows dropped" (T3678).

**Privacy travels with the ROLE, not the column name.** "Hash this case id" is attached to a column
called `opp` that ceases to exist at merge time; the instruction moves to `Case` (T3675), and where
two systems disagree about a column the stricter mode wins (T3676) — if one system says a column
identifies a person, it does.

**Stated rather than implied:** every event carries its `Source system` into the log and its
XES/OCEL export, but the analytics index takes case attributes from the FIRST event, so after import
what is filterable is the system a case *started* in. Per-event provenance has no home in the index
until the handover work, and the UI says so rather than implying the map is already there.

**Correction to the note first written here.** It said `parseAnyLog.ts` "was not created". It already
exists and has since the pull connectors shipped — `pull.ts` uses it for every file it downloads. What
is true is narrower: the *console's* `onFile` is a near-duplicate of it that additionally handles
`.xlsx` and the OCEL-study branch, and converging the two is still outstanding. `.xlsx` shipped in
2.1, so the merge inherits workbooks either way.

**Reuses.** `guessMapping`, `parseCsv`, `parseTimestamp`, `buildEventLog` — all unchanged.

---

## Phase 3 — The twin is a claim; make it checkable, and make it reachable

**Status:** ✅ `Shipped` — T3763–T3772. The smallest phase, and the cheapest credibility in the
programme.

- [x] `holdoutPct` reaches the UI — one control on the import screen
- [x] `studyId` stops being discarded by the calibrate hand-off
- [x] A refreshed live run **marks its twin stale**, with the date it diverged
- [x] **(found while building)** A refreshed live run no longer silently **loses** its hold-back

No review extension — three verified defects that share one story: **the Miner → Simulator seam is
unfinished.**

- The import route accepts `holdoutPct`, `splitByTime` implements it, T3503–T3506 test it, and it has
  **zero callers**. So every twin is validated in-sample, while the route's own message tells the
  user to *"re-import the log with a hold-back"* — something no screen can do.
- `calibrate` returns `{studyId, diagramId}` and the caller throws both away, dropping the user into
  the Simulator in project mode to hunt for the mined twin among auto-seeded default studies.
- `refreshRunFromSource` re-discovers and re-conforms in place but does not re-calibrate, so a twin
  silently goes stale. **Recommend marking over silent re-calibration** — re-calibrating rewrites a
  study the user may have edited.

**Why here.** The Simulator's own examples programme lists `mined-twin-validated` as unstarted, and
it is currently **unbuildable** because the hold-back it needs is unreachable. This phase unblocks a
plan whose code already shipped.

**Reuses.** `splitByTime`, `compareDistributions`, `Performance.holdout`, `ValidateTwinPanel` — all
shipped and tested.

**As built.**

**The hold-back is offered at import, because that is the only place it can be honoured** — the split
has to happen before performance is fitted, and the raw events are gone immediately afterwards. Off
by default: holding data back is a deliberate choice, not a default posture. The control states which
way it is set means, rather than leaving the reader to infer it — with a hold-back, the twin is
fitted on the earlier share and tested on what it never saw; without one, it is marking its own
homework and the validation says so.

**A fourth defect surfaced while wiring the third, and it was the worst of them.**
`refreshRunFromSource` recomputed `performance` over every trace, so a live refresh **silently
dropped the hold-back**: an out-of-sample validation quietly became in-sample, the twin went back to
marking its own homework, and the panel went on reporting whatever a field that had just been deleted
implied. Nothing broke. The run kept working; only the claim it supports stopped being true. The
hold-back is now **re-applied** at the same percentage to the grown log rather than inherited —
inheriting the old `cases` count would describe a log that no longer exists (T3763, T3764). Verified
by reverting the fix: both tests fail on the previous code.

**Marking, not re-calibrating** — as recommended, and for a reason worth stating plainly: a study the
user has edited must not be rewritten under them. So a refresh records `twinStaleAt` and touches
nothing else; T3769 asserts the refresh never writes `studyId` and never touches a
`SimulationStudy`. The **first** divergence date is kept, not the latest refresh (T3768) — a date
that advances on every poll says "just now" forever and tells a reader nothing. Cleared by a
calibrate, because the twin then describes the log again.

**The warning is shown BEFORE the number, not after it.** A reader who has already taken in a green
agreement figure has formed exactly the view the warning exists to prevent.

**No schema change.** `twinStaleAt` is a new key in the existing `performance` JSON column — data,
not structure, per this plan's ground rule 3 — alongside `holdout`, which is the same kind of fact
about the fit. Phase 9's `parentRunId` remains the only phase needing a real column.

**The hand-off carries the study all the way down.** `calibrate` has always returned
`{ studyId, diagramId }`; six files sat between that and the study a user ends up looking at, and the
first of them threw it away. The Simulator now opens with the mined twin expanded and scrolled into
view, rather than in project mode among auto-seeded default studies.

**A guard for the failure mode this phase is about.** Three verified defects here shared one shape:
implemented, tested, reachable by nothing. A unit test cannot notice that — `splitByTime` was fully
covered by T3503–T3506 the whole time it had zero callers. T3770–T3772 ask the other question:
does anything *call* it? Source-text tripwires in the idiom of `route-gating` and
`generate-diagnostics-wired`, and **all three were proved to fail** by re-orphaning each end.

**Reuses.** `splitByTime`, `compareDistributions`, `Performance.holdout`, `ValidateTwinPanel` — all
shipped and tested.

---

## Phase 4 — Most of the elapsed time is between the steps, not inside them

**Status:** ✅ `Shipped` — T3773–T3790. **Both slices landed**, including the canvas one.

- [x] **(a)** A ranked **transitions table** ("⏳ Between steps"), and transition medians on the
      discovered model via the existing `label` / `transitionCount` channels
- [x] **(b)** Arrow thickness — the canvas change, and far cheaper than feared (see below)
- [x] Smaller item **04** — the `edgeThreshold` slider
- [x] ~~the in-step vs between-step split~~ — **REFUSED. The data cannot support it.** See below.

**Absorbs.** **Extension 1**, **item 04**.

**Reuses.** `analytics.edges` — `EdgeMetric{from,to,freq,medianMs}`, computed and persisted on every
run since import and **read by nothing**.

**⚠ The review's "render only / small" needs one correction.** There is no connector colour field in
`app/lib/diagram/types.ts`; `weight` exists and is honoured only for `uml-association` (the OCEL
domain diagram). Colouring an arrow means changing the **shared canvas renderer used by every diagram
in the product**. Slice (a) is the analysis and needs no renderer change; slice (b) is the garnish and
carries a canvas regression bar. **If (b) slips, the phase still lands.**

**Why item 04 rides here.** An arrow-centric view is unreadable at full density, so the simplify
control is the twin of arrow heat, not a stray polish item. It also repairs published documentation:
`scripts/add-guide-mining-sample.ts` already tells users to *"leave the detail slider on all paths"* —
**shipping the slider fixes the guide, which is better than editing the guide down.**

**Honest floor.** An edge with fewer than N observations shows a frequency and no median.

---

### As built

**The phase's own headline is not something this data can demonstrate, and the deliverable that
assumed it has been refused.** An event log records ONE timestamp per event. The interval between
two consecutive events is therefore a single number, and nothing in the log says how much of it was
work and how much was waiting. Worse, `computeAnalytics` pushes that same interval into BOTH the
from-activity's `totalTimeMs` and the edge's samples — **the same milliseconds under two names**
(`analytics.ts`, one `d` appended to `durByActivity[a]` and to `edgeDur[a→next]`).

So an "in-step vs between-step split" would have been a fabricated distinction that looked entirely
plausible, and summing the two tables would have doubled the elapsed time of the user's own process.
What shipped instead is a **decomposition**: the transitions table breaks the bottleneck figure down
by where the case was going next, and says so on screen. T3777 pins the arithmetic — the transitions
leaving a step sum to exactly that step's total — so the claim is checkable rather than a comment.

**This is a genuinely useful finding without the fabricated half.** "Check takes eight hours" is not
one fact: three quarters of it may be the wait before *Approve* and a quarter the wait before
*Reject*, and that is the difference between fixing the check and fixing the approval queue.

**Ranked by TOTAL, not median** (T3773). A two-day wait that happens twice matters less than a
two-hour wait that happens four hundred times, and ranking on median puts the rare one at the top of
the screen. That required `EdgeMetric.totalMs`, added at import — Phase 1's rule again, store or
never. Existing runs cannot gain it, so they fall back to `freq × median` **marked ≈**, with the
reason: the estimate is right for a symmetric spread and understates a skewed one, which is the
usual shape of a waiting time.

**Slice (b) was far cheaper than the review or this plan expected, and the reason is worth keeping.**
The plan said colouring an arrow means changing the shared renderer used by every diagram in the
product. True of colour; not true of thickness. `Connector.weight` already exists and is already
rendered — it was simply gated to `uml-association`. Widening that gate to include `sequence` is a
**one-conditional change**, and it is safe not because the renderer was inspected but because of a
fact about the rest of the tree: **almost nothing sets `weight` at all**. `buildDomainFromOcel` sets
it on UML associations; the Visio domain importer round-trips it and can only ever produce UML
connector types; nothing else does. So no existing diagram changes by a pixel.

That fact is now a test rather than an argument (T3790) — a third producer putting a weight on a
sequence flow would silently re-thicken arrows in a diagram nobody was measuring, and the guard was
proved to fire by planting one.

**The arrow now says how often AND how long.** `badgeEdgeCounts` had already moved the frequency off
`label` and onto the `transitionCount` badge, leaving `label` free for the median gap. Applied in
all three places that build a discovered BPMN — discover, recompute and live refresh — so the three
cannot drift apart.

**Item 04 was another shipped-and-unreachable capability**, the same shape as all of Phase 3: the
discover route has accepted `edgeThreshold` since it shipped and nothing ever sent it, while the
published User Guide already told users to *"leave the detail slider on all paths"*. The slider now
exists, so the guide is true — which was always the better direction than editing the guide down to
match the product.

**Not done, and named rather than implied:** the transitions table is not yet reachable from the
model — clicking an arrow does not select its row, and the table does not highlight an edge. That is
a linking job, not an analysis one, and it belongs with Phase 5's filtering seam.

---

## Phase 5 — Slicing is what turns a finding into a cause

**Status:** `Not started` · The big one, and the one that pays back everything Phase 1 stored.

- [ ] One filter bar above the tabs — date range plus any captured attribute or team
- [ ] New pure `app/lib/mining/filterAnalytics.ts` — `filterAnalytics`, `filterVariants`
- [ ] `insights/ThroughputChart.tsx` — arrivals and completions, brushable
- [ ] Per-panel exactness chips using Phase 1's vocabulary
- [ ] The exported report states the filter it was run under

**Absorbs.** **Extension 2** (the UI half) and **extension 7**, paired deliberately: **the throughput
chart *is* the date filter.** Volume over time is already computed (`analytics.throughput`, 30 buckets
of `{t, started, completed}`), persisted since import and drawn nowhere; a brush over it is the best
possible date-range control. One chart, two extensions, and *"is the backlog growing"* answered by the
same pixels the user is dragging.

**Reuses.** `computeOutcomes`, `variantPareto`, `applyHeat`, `buildAnalysisChapters` — every one takes
`analytics` / `variants` as **parameters**, so all of them filter without modification once the seam
feeds them. The Word and Excel reports filter for free.

**⚠ Two corrections to the review's feasibility section.**
- *"Leave conformance alone at first"* is more conservative than it needs to be.
  `checkTransitionConformance(variants, ref)` is pure, fitness is case-count-weighted, and filtered
  variant counts are just a histogram of `variantIdx` over the filtered case set. **Filtering
  conformance is nearly free.** The genuinely un-filterable thing is **discovery**, because it emits a
  *persisted diagram* — so a filtered discovery must be an explicit *"discover from this slice"*
  action creating a new diagram, never a live overlay.
- *"Activity metrics … computed in the browser from data already loaded"* is **false today**.
  `CaseSummary` carries no durations. Under the review's own plan the heat map — its flagship — is
  the one panel that would have to say "not filtered". That is the substance of Phase 1.

**Honest floors — three of them, and they are the phase.**
1. Below a case floor in the slice, report counts and refuse distributions.
2. When `analytics.capped`, every filtered figure is an estimate from a 1-in-N stride and says so.
3. Time-shaped figures are exact only when `detail === "full"`; otherwise the chip reads *not
   filtered* and the number shown is the whole-run number, visibly marked. **Never averaged.**

---

## Phase 6 — Fourteen cases skipped the credit check; here they are

**Status:** `Not started`

- [ ] `ConformanceViolation.variantIdxs`, joined to `analytics.cases`
- [ ] Click a violation → the cases; click a case → its path, and (with Phase 1's `durs`) its timeline
- [ ] Smaller item **01** — the whole per-case index out as CSV

**Absorbs.** **Extension 4**, **item 01**. Both are the same argument: *evidence, not a metric.* The
case list is capped at 60 rows with no export, and a sceptical stakeholder asks for the rest first.

**Reuses.** `conformance` is a stored `Json` column and the replay is a pure function of
`(variants, ref)` — both stored. **This is the first payoff of the 0.3 recompute contract: every
existing run gains case attribution without a re-import.**

**Honest floor — the most important in the programme.** With a strided case index the fourteen cases
may resolve to nine. The UI must read **"14 cases · 9 identifiable in the stored sample"**. Never a
silently short list presented as the list — that is exactly what stops an auditor trusting the tool.

---

## Phase 7 — Who hands work to whom, and who does the same thing three times

**Status:** `Not started`

- [ ] Handover map between teams, workload distribution, and the pairs that pass work back and forth
- [ ] Rework and ping-pong generalised to ordinary business processes
- [ ] Item **03** — the amber multi-team row becomes clickable onto its split
- [ ] Item **07** — the automation ROI's seconds-per-step becomes editable
- [ ] Item **08** — the task SOP goes out through `buildDocx` like every other SOP in the product
- [ ] `task-mining` enforced server-side (deferred from 0.1 — see there)

**Absorbs.** **Extensions 5 and 6**; **items 03, 07, 08**.

**Reuses.** `detectReworkActivities(variants)` is **already label-agnostic** — it excludes navigation
steps and counts within-variant repeats, which is exactly the "Credit check three times" figure.
Widening that trigger genuinely is deleting a condition. `performance.resourceConcurrency` and
`activityResource` for the workload view.

**⚠ Two corrections to the review.**
- **Extension 6 is half right.** `pingPongFromVariants` is **not** label-agnostic: `appOfActivity`
  parses `"Switch to X"` / `"Open X"` / `"X:"`, so on a business log it returns **0** — a confident
  wrong number, which is worse than an absent one. The business analogue is *team* ping-pong (A→B→A
  over the resource sequence), a different function over Phase 1's `res` vectors. **Widening the
  trigger without this replacement ships a bug.**
- **Extension 5 is not quite "data already mined."** Resource is captured per event but survives only
  as `dominantResource` per activity; the actual team-to-team flows are lost inside `computeAnalytics`.
  A map built from edges × dominant team is buildable today and would **silently mis-state exactly the
  multi-team activities item 03 flags amber.**

**Honest floor.** On a run with `detail !== "full"`, the handover map falls back to the dominant-team
approximation and is labelled **approximate**.

---

## Phase 8 — What should I do about it?

**Status:** `Not started` · **Added 2026-09-09**, after Paul asked whether the plan gave the user a
course of action. It did not, and neither does the review — see *Corrections*.

Every other phase in this plan answers a question about the process. This one answers the question
the reader asks *next*, and it is the one the Miner is worst at: **so what do I do?**

- [ ] `app/lib/mining/nextSteps.ts` (pure) — `findActions(run) → MinerAction[]`, ranked
- [ ] A "What to do next" panel in the console, above the workbench
- [ ] Every action is a **button**, not a sentence
- [ ] Optional AI narration over the computed findings; the ranking is never the model's

**Why the Miner has a better claim to this than the Simulator.** The Simulator has shipped
`suggestNextSteps()` since its own Phase 1 — ranked deterministically, each suggestion carrying the
overrides that create the scenario, with an honest floor that refuses to advise below three runs. The
Miner has nothing like it, and its recommendations would rest on **measured** behaviour rather than a
model's. Today the closest thing is the Automation tab, which is genuinely actionable and fires only
on *task* logs, so an ordinary business process gets none of it.

**The signals, and where each already comes from.** Nothing here needs new mining:

| Finding | Computed by | The recommendation |
|---|---|---|
| Bottleneck | `analytics.activities` — today | "38% of elapsed time is in *Approve*" |
| Slowest handover | `analytics.edges` — Phase 4 | "*Check → Approve* takes 4 days. That is a queue, not work" |
| Rework | `detectReworkActivities` — Phase 7 | "*Credit check* runs 2.4× per case" |
| Lateness driver | `computeOutcomes` lift — today | "Cases via *Escalate* are 3× more likely to miss the SLA" |
| Deviation | `conformance` — today | "14 cases skipped the credit check" |
| Backlog | `analytics.throughput` — Phase 5 | "You took in more work than you finished for six weeks" |
| Cross-team bouncing | Phase 1's `res` vectors — Phase 7 | "Work crosses Finance and Ops four times per case" |

**The actions are the point, and most of them hand off.** A finding that ends in prose is homework.
Each one carries a button:

- *Show me the cases* → the Phase 6 drill-through
- *Slice to this* → the Phase 5 filter, pre-set
- *Simplify the map* → the Phase 4 threshold
- ***Calibrate a twin and sweep that team*** → the existing calibrate route, then the Simulator's own
  sweep. **This is the one that closes the loop the product already claims**: mine → calibrate →
  simulate → re-mine. Today a user has to know to do that, and then do it by hand.
- *Generate an RPA spec* → the existing task-mining path

**Deterministic ranking; the model only narrates.** The Miner is 100% algorithmic by design, and that
is exactly what makes a conformance number safe to put in front of an auditor. Findings are ranked by
share of total elapsed time wherever a share exists, so they are comparable to each other; AI, when
allowed, rewrites the top few into prose and never reorders them. Same *compute first, narrate second*
rule as the Simulator plan, and the same reason.

**Honest floors — this phase needs more of them than any other, because it is the phase that gives
advice.**

- **No SLA set** → no lateness findings, said out loud rather than silently omitted.
- **No reference model** → no conformance findings, same.
- **`detail !== "full"`** → no handover or rework findings; they need the per-event durations Phase 1
  stores, and a run that predates them cannot support the claim.
- **Nothing clears the threshold** → *"nothing stands out in this run"*. A tool that always produces a
  top recommendation will eventually recommend noise, and the first time it does, nobody believes the
  next one.
- **Every finding cites its number and resolves to its cases.** A recommendation that cannot be
  traced back to the evidence is the one thing this feature cannot afford to ship.

**A thin first slice can land early.** Bottleneck, lateness driver and deviations all run off data
that exists **today** — before Phases 4, 6 and 7. If something actionable is wanted before the long
middle of this plan, that slice is where to take it from.

---

> ## — CUT LINE — *(moved 2026-09-09)*
>
> After Phase 8 the Miner is a complete **analysis and advice** tool: it slices, it attributes
> deviations to cases, it shows where the delay actually is, who hands work to whom — and it tells
> you what to do about it, with a button.
>
> **The line moved when Phase 8 was added, and deliberately.** It sat after Phase 7; a tool that says
> what to do is worth more than one that lets you compare two runs, so recommendations belong inside
> the set you keep rather than the set you might drop.
>
> Phases 9 and 10 are the **second visit** — the thing the review's whole judgement is about, and the
> point at which the product stops being *a study you commission* and becomes *a monitor that tells
> you when your process changed*. **This is where you would stop for cost, not where you would stop
> for value.** Both halves of that are worth saying.

---

## Phase 9 — Nobody mines a process once

**Status:** `Not started` · **The only phase that adds a real column.**

- [ ] `ProcessMiningRun.parentRunId` — `schema/UPDATE_EVERYTHING.md` Steps 0–12, product version bump
- [ ] `app/lib/mining/compareRuns.ts` (pure) + `console/ComparePanel.tsx`
- [ ] A bounded auto-snapshot on refresh, so a live run keeps its own history
- [ ] Item **11** — conformance history: the weekly fitness chart

**Absorbs.** **Extension 3**, **items 11 and 06**.

**Reuses.** `snapshot/route.ts` already freezes a run into a dated copy — it just records **no link**
to the run it came from (only `"${run.name} — ${stamp}"`), so the history it creates cannot be
assembled except by guessing at name prefixes. And the `accounts-payable-invoice-lifecycle` example
already ships **three period logs designed to show compliance decay**: the comparison example needs
no new data, only the view.

**⚠ Item 06 is declined as written and re-specified.** "Append to a manual run" requires retained raw
events, which do not exist and which are not worth introducing for this. What the item actually asks
for is *continuity of trend*, and a **linked run series** delivers that without the storage fork.

**Honest floor.** Two runs are comparable only when their activity vocabularies overlap sufficiently.
Below a threshold the view refuses and says the two look like different processes, rather than diffing
nonsense.

---

## Phase 10 — Watch it, rather than visit it

**Status:** `Not started` · **Depends on Phase 9** and cannot precede it.

- [ ] **The cheapest alarm first: the source stopped sending.** No thresholds, no history, no
      statistics — only `lastIngestAt` staleness
- [ ] Thresholds: fitness below X, a new undocumented transition, the late rate doubling
- [ ] Notification wiring — a new `NotificationType`, the bell renderer, email
- [ ] Item **10** — connectors beyond webhook / Blob / SharePoint

**Absorbs.** **Extension 8**, **item 10**.

You cannot alert on *"fitness fell from 94% to 71%"* when refresh overwrites the run and no prior
value was ever kept — which is why item 11 is a prerequisite, not a smaller thing.

**A detail worth knowing before starting.** The poll loop short-circuits on `if (hasNew)` and skips
SharePoint sources entirely, so **silence is precisely the condition it currently cannot see**. That
is a small change to the loop and the single highest-value line in the phase.

**Why item 10 rides here.** "Watch it" needs something to watch, and most customers have a REST
endpoint or a read-only database view, not a webhook they are willing to build first. `blobUrl.ts`'s
SSRF guard is the template for any new connector. The optional tail of the tail.

**Honest floor.** No alert fires on the first observation. A threshold with fewer than N prior points
reports *not enough history yet* rather than firing on noise.

---

## Phase 11 — The examples programme

**Status:** `Not started` · Its own final phase, deliberately.

The lesson from the Simulator's programme, which is worth carrying over verbatim: *the code teaches
nothing on its own — every capability is reachable only by someone who already knows it is there.*
Building one worked example there found **five shipped defects** nothing else had caught.

**Reuse before authoring.**

| | Example | Slug | Teaches | Phase |
|---|---|---|---|---|
| [ ] | *(extend)* Accounts Payable | `accounts-payable-invoice-lifecycle` | Its three period logs already show compliance decay — that **is** the comparison example | 8 |
| [ ] | *(extend)* Order-to-Cash | `order-to-cash-lifecycle` | Add `Region` / `Order value` / `Channel` columns — cheaper and truer than a sixth near-duplicate | 4 |
| [ ] | Handover-heavy log | `three-team-handover` | Work crossing three teams with a genuine ping-pong pair | 6 |
| [ ] | Business-process rework | `credit-check-rework` | "Credit check" three times, labels nothing like a UI step — **the example that proves the widened trigger** | 6 |
| [ ] | Live source with an alarm | *(extend)* `live-order-processing` | An alert that actually fires during the batch demo — the best demo in the feature | 9 |

**The cold start is a bug, not an example.** A user opening the Miner on their own project gets a bare
file picker: *"Load built-in example data"* renders only when a catalog example was adopted, and no
sample log is served from `public/`. **Serving one CSV is the cheapest onboarding fix in the
programme** and should not wait for this phase.

**No example carries a `twin` payload** despite the package format supporting one, and
`live-order-processing` is the only example adopted as a **pre-created run** rather than a staged
sample log — so it is the one whose baked `analytics` goes stale when Phase 1 changes the shape. The
other four re-import at adopt time, which limits that risk considerably.

Every new package must pass `validateMiningExamplePackage`; the 0.5 decision governs whether it is
generated or authored.

---

## Verification

- **`npm run build` — NOT OPTIONAL, and run it before pushing.** `refreshRun.ts` imports Prisma and
  lives in `app/lib/mining/` beside pure modules that client components import; `filterAnalytics.ts`
  lands in the same directory in Phase 5. `tsc` and the unit suite were both fully green while a
  client component transitively imported Prisma, and it broke the production build, the deploy and
  two CI jobs.
- **Local:** `export PATH="$PATH:/c/Program Files/nodejs"; cd /c/Git/Diagramatix/diagramatix; npm run go`.
- **Unit:** `npx vitest run tests/mining` after every phase; the full suite before any push.
- **E2E:** `e2e/mining-examples.spec.ts` after 0.2 — it is the Miner's only route-level coverage.
- **Adopt all five catalog examples** after 0.2 and after Phase 1, and confirm each still imports,
  discovers, conforms and calibrates.
- **Regression bar (Phase 1):** bit-identical `stats` / `variants` / `performance` / `governance` and
  every pre-existing `analytics` field, with the new fields ignored. **The single most important
  guard in this plan.**
- **Docs:** `schema/UPDATE_EVERYTHING.md` Steps 0–12 on **Phase 9 only** (the `parentRunId` column).
- **New tests** from **T3609**, appended to `tests/TESTS_SUMMARY.md`.

---

## Risks

1. **Stale baked analytics in the catalog.** All five examples carry `analytics` inside a 2.9 MB
   committed JSON, and Phase 1 changes its shape. Four re-import at adopt time and are fine;
   **`live-order-processing` adopts a pre-created run** and would show old-shaped data on an example
   meant to teach the new views. Mitigated by 0.5 and by regenerating after Phase 1. **Top risk.**
2. **Payload growth.** `analytics` is uncompressed `jsonb` and the console fetches the whole run on
   every Insights open. Phase 1 makes it materially bigger. Integer ms, a resource dictionary, the
   `detail` budget guard, and a decision on moving the case index behind `GET runs/[runId]/cases`.
3. **Analytics-shape drift.** Runs imported before Phase 1 can *never* gain its fields. Every reader
   must tolerate absence and say so.
4. **The 50k stride × the filter.** A rare slice of a capped run may resolve to almost nothing. The
   most likely way this programme produces a number someone can disprove.
5. **Privacy.** Phase 1 begins persisting columns previously discarded, in a product where case ids
   are frequently customer identifiers. Masking ships in the same phase or not at all.
6. **Client-bundle hygiene.** See Verification. Not hypothetical — it has happened once already.
7. **Live-source write cost.** `MiningSource.buffer` is rewritten **in full** on every webhook append,
   and Phase 9 adds threshold evaluation to the same loop (already capped at 200 sources per poll).
8. **Canvas blast radius.** Phase 4(b) touches the renderer used by every diagram in the product.

---

## Corrections to the Capability Review

Recorded here rather than silently working around them. The review was read from the shipped code and
is right about the shape of the problem; these are the places the detail differs.

| Item | The review says | The code says |
|---|---|---|
| Ext 1 | *render only / small* | No connector **colour field** exists; `weight` is honoured only for `uml-association`. The table is small; the coloured arrow is a shared-canvas change. |
| Ext 5 | *data already mined* | Per-resource **counts are discarded**; only `dominantResource` survives. An exact handover map needs Phase 1's storage. |
| Ext 6 | *widen the trigger* | True for `detectReworkActivities`; **false** for `pingPongFromVariants`, which parses UI-step labels and returns 0 on a business log. |
| Ext 2, feasibility step 4 | *activity metrics … computed in the browser* | `CaseSummary` has **no durations**. The heat map is the one panel that could not be filtered. |
| Ext 2, feasibility step 5 | *leave conformance and discovery alone* | Conformance filters **nearly free**. **Discovery** is the un-filterable one, because it emits a persisted diagram. |
| Item 02 | a labelling nicety | A **correctness precondition** for ext 2 — the stride turns every filtered figure into an estimate. |
| Item 05 | *a recompute action would fix it* | **Not implementable as written** for manual runs — raw events do not exist. Two honest answers, not one (0.3). |
| Item 06 | *append to a manual run* | Needs retained raw events. **Re-specified** as a linked run series (Phase 8). |
| Item 11 | a smaller thing | A **prerequisite** of ext 8. No history, no alarm. |
| — | *(not mentioned)* | **The gating hole.** 3 routes of 26 enforced; three tier keys sold and enforced nowhere. Fixed in 0.1. |
| — | *(not mentioned)* | **Input flexibility.** The review's only input observation is item 10 (connectors); it assumes the file path works for whatever people have. It does not: there is no `.xlsx` reader, a wide "one row per case" export is silently read as one event, and several systems' exports of the same cases cannot be merged. Added as **Phase 2**. |
| — | *(not mentioned)* | **No course of action.** All eight extensions are ways of READING; the review's own three missing questions — what changed, for which cases, tell me when it moves — are all questions about looking. *"What should I do about it?"* is absent, and it is the question a reader asks next. Added as **Phase 8**, and the cut line moved to sit after it. |
