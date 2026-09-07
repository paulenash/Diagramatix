# Diagramatix — Simulator Extensions Plan

| | |
|---|---|
| **Created** | 2026-09-07 |
| **Source** | [`Simulator-Capability-Review.html`](./Simulator-Capability-Review.html) — the *Extensions* section: eight extensions + six smaller items, read from the shipped code |
| **This document** | The **live worklist** for building them. Phases follow the review's own stated build order (value first). Every phase names the files it touches and the existing functions it reuses. |
| **Scope** | All 8 extensions + all 6 smaller items. New worked examples are planned alongside, one per new capability. |
| **How to use** | Work an item, tick its box and set **Status** → `In progress` / `Shipped (<commit>)` / `Won't do (<reason>)`. Keep the review as the historical argument; keep this as the burn-down. |
| **Progress log** | **2026-09-07** — **Phase 0 COMPLETE.** 0.1/0.2/0.3 `e290a9b4`; TESTS_SUMMARY header repaired `11eed0f1`; **0.4 closed by Paul’s decision — generator retired, committed examples are the source of truth** (this also supersedes the original "extend the generator" plan for new examples). 0.1 generator merges by slug (guarded by T3369, proven to fail on a simulated overwrite); 0.2 `studyRuns.ts` + `latestRunPerScenario` (T3370/T3371); 0.3 `facts/` established, `assessFacts.ts` moved, both importers repointed (no compat shim — there were only two). **New finding: 0.4** — the generator is stale relative to its own committed output; see below. 382 simulation tests green, typecheck unchanged. |

**Status values:** `Not started` · `In progress` · `Shipped (<commit>)` · `Blocked (<on what>)` · `Won't do (<reason>)`

---

## Why

The review closes with a judgement worth restating, because it is what every phase below is aimed at:

> The engine is ahead of the argument.

The Simulator can model things most departments will never need — compensation handlers,
non-interrupting boundary events racing a service time, parallel multi-instance bodies. What it
cannot yet do is hand someone the four things they need to walk into a meeting:

1. **a cost with a date on it**,
2. **a statement that the difference is real**,
3. **a curve rather than a point**, and
4. **evidence that the model resembles reality**.

Three of those four extend machinery that already exists — and so does the fifth thing, the one that
would tell someone what to try next.

---

## Ground rules (apply to every phase)

1. **Compute first, narrate second.** Every phase producing prose follows the pattern already proven
   in `app/lib/simulation/facts/assessFacts.ts`: a pure `buildXFacts()` producing a structured figures
   object, a deterministic `summariseX()` fallback, and an AI `generateX()` that receives *only*
   those figures. The model never sees raw runs. This is what makes each phase unit-testable with no
   API call, and it is the review's own stated non-negotiable — *a fabricated trend in a document
   that goes to a finance director is the worst possible failure for this feature.*
2. **AI gating.** Every AI route copies
   `app/api/projects/[id]/simulation/studies/[studyId]/assess/route.ts`: `orgPolicyAllows`,
   `makeRedactor` on egress, `getAiGenerateModel()`, `enterAiContext` telemetry, and a deterministic
   fallback so the feature stays available when AI is off.
3. **Defaults preserve behaviour.** Every engine addition is inert when unset. The regression bar for
   Phases 5 and 7 is *bit-identical results for the existing examples with the new fields absent*.
4. **Metrics-shape additions are additive and optional.** Older `SimulationRun.metrics` rows lack new
   fields; every reader must say so rather than guess (the Miner's `NoAnalytics` precedent).
5. **Tests** are numbered append-only from **T3369** (highest today is T3368) and added to
   `tests/TESTS_SUMMARY.md`. Never renumber or reuse.
6. **Docs.** Any phase changing a stored shape follows `schema/UPDATE_EVERYTHING.md` Steps 0–12
   (schemaVersion bump rule → the 4 schema-sync files → `VERSION_HISTORY.md` always → User-Guide /
   Features / Tech-Notes). **Phases 1, 3, 5 and 7 all change stored shapes.**

---

## Phase 0 — Foundations

**Status:** ✅ `Shipped` — 0.1, 0.2, 0.3 (`e290a9b4`) and 0.4 (generator retired). Phase 1 is
unblocked.

### 0.1 Fix the example-generator overwrite hazard ⚠️

- [x] `scripts/gen-bpmn-examples.ts` → merge by slug instead of overwriting

`main()` built `examples` from its own two `METAS`, then `writeFileSync`d `{ examples }` over
`app/lib/simulation/exampleData.json` — a file holding **five**. It now merges by slug, the shape
`scripts/gen-aardwolf-example.cjs` already used: replace an entry in place, append a new one.

**Verified by running it.** All five slugs survive, and the three the generator does not own come
back byte-identical. **T3369** guards it, and was proven to fail: simulating the old overwrite
produces `examples lost from exampleData.json: simple-process, aardwolf-loan-comparison,
sales-marketing-drill-through`. Every other assertion in that file iterates the survivors, so
nothing else in the suite would have caught a deletion.

### 0.2 Shared study-runs loader

- [x] New `app/lib/simulation/studyRuns.ts`

Shipped as `loadStudyRuns(studyId, projectId)` — scoped by project as well as study, so a caller
cannot reach another project’s study by guessing an id. Errored and unfinished runs are excluded.

**A caveat that Phase 1 must respect.** A run does **not** snapshot its overrides; it snapshots the
resulting `networkSnapshot`. So the field is named `scenarioOverrides`, not `overrides`: it is the
scenario’s *current* set, exact for its latest run and merely indicative for older ones — editing a
scenario rewrites the apparent history of every earlier run beneath it. `latestRunPerScenario()` is
provided for the subset where the overrides are genuinely what ran. **Phase 1 must either restrict
itself to that subset or derive the truth from `networkSnapshot` — it must not present the current
overrides as history.**

### 0.3 Facts-module convention

- [x] Create `app/lib/simulation/facts/`, move `assessFacts.ts` under it

**Deviation from plan:** no re-export shim. The plan assumed compatibility mattered, but there were
only **two** importers (the assess route and its test) — both repointed directly. A permanent shim
for two call sites is dead weight.

Phases 1, 2, 3, 6 and 8 each add a sibling. One place, one pattern, one test idiom.

### 0.4 ✅ Generator retired — the committed examples are the source of truth

**Status:** ✅ `Shipped` — **Paul's decision, 2026-09-07: retire the script, treat the committed
examples as the source of truth.**

Found while verifying 0.1. Fixing the overwrite made `gen-bpmn-examples.ts` safe for the three
examples it did not own; it was never safe for the two it did. Regenerating produced materially worse
packages than the committed ones:

| Slug | Committed | Regenerated |
|---|---|---|
| `loan-origination` | 32 elements, 32 connectors, 3 teams, 1 calendar | 27, **25**, 4, **0** |
| `car-repair-rework-loop` | 36 elements, 33 connectors, 1 team, 1 calendar | 35, **15**, **0**, **0** |

Checking the other two generators showed the same class of fault, milder: **every** generator emits a
package with **no calendars**, because `backfill-example-calendars.cjs` ran after all of them and none
were updated. `gen-aardwolf-example.cjs` and `gen-sales-marketing-example.cjs` each drop their
example's working calendar, which T0571 requires.

**What was done:**

- [x] `scripts/gen-bpmn-examples.ts` **deleted**. Its derivation from the OMG/WfMC BPSim files is
      recorded in `exampleSeeds.ts` and preserved in git history.
- [x] `exampleSeeds.ts` header rewritten — it previously told the reader to regenerate with the very
      script that would have degraded the data. It now states that the committed JSON is authored,
      that there is no regeneration step, and why.
- [x] `gen-aardwolf-example.cjs` and `gen-sales-marketing-example.cjs` kept as provenance records but
      banner-marked **RETIRED — DO NOT RUN**, naming the calendar loss and T0571.
- [x] Stale pointers cleaned up in `bpsim/bpsimProject.ts` and the T3369 comment.

**Consequence for the examples programme — this supersedes the earlier plan.** New examples are
**authored packages**, not generated: either hand-written `ExamplePackage` data committed to
`exampleData.json`, or captured out of a real project with the admin **Save as example** path, which
is the tested route and the one that carries calendars. `validateExamplePackage` and
`exampleSeeds.test.ts` — which runs every scenario of every example — are what keep them honest.

---

## Phase 1 — Suggested next steps

**Status:** ✅ `Shipped` — suggestions and smaller item 04 (named baseline + trend). Product version
2.5 → 2.6 for the new column; XSD unchanged.

- [x] `app/lib/simulation/nextSteps.ts` (pure)
  - `diffRuns(a, b)` — what changed in the configuration, what changed in the outcome
  - `leverHistory(runs)` — per lever: values tried, range covered, what each was worth
  - `suggestNextSteps(history)` → ranked `Suggestion[]`, each carrying
    `{ title, evidence, scenarioName, overrides: OverrideSet }`
- [x] `POST .../studies/[studyId]/next-steps` (facts + optional narration)
- [x] "Next steps" card in `StudyManager.tsx` — via `results/NextStepsPanel.tsx`
- [x] Smaller item **04** — named baseline + trend

**Levers** are exactly the `OverrideSet` keys in `app/lib/simulation/overrides.ts` (`NODE_KEYS`, team
capacity, edge probability) plus the `PlannedInterventionKind` values in `types.ts`. Nothing new is
needed to enumerate them.

**Deterministic ranking rules** — all unit-testable with no AI call:

- a lever never tried;
- a lever tried once and abandoned;
- a lever whose best observed delta fell inside the noise (the `Stat` p5–p95 half-width until Phase 3
  lands, then the real significance verdict);
- a team top of `metrics.bottlenecks` in every run and never overridden;
- how far a lever has been pushed, and whether it was still improving at the edge.

**Honest floor.** Fewer than three runs → return `{ enough: false }` and say so. The review is
explicit: *with only one or two runs there is nothing to say, and the feature should say so rather
than inventing advice.*

**Each suggestion is a button.** Its `overrides` POST straight to the existing scenarios route, so
"try eight assessors" creates the scenario rather than assigning homework.

**As built.** Five rules ship, scored and ranked deterministically: `unaddressed-bottleneck` (100),
`still-improving` (90), `abandoned-lever` (60), `untried-lever` (50 minus bottleneck rank), and
`inside-noise` (40). Three decisions worth recording:

- **Levers are enumerated from stored metrics alone** — `teamCapacities` gives every team,
  `nodeLabels` gives every task and source. No `networkSnapshot` load and no extra query. Edge
  probabilities are deliberately **out of scope**: metrics carry no edge list, so branch splits would
  have been half-covered rather than covered.
- **Only capacity suggestions carry a button.** Proposing a concrete cycle time is speculation;
  proposing a headcount is not. Advisory findings carry no `overrides`, and the panel offers no
  button for them — an inside-the-noise result is a reason to stop, not an action.
- **`isInsideNoise()` is the one stand-in.** It compares the gap against the p5–p95 half-width,
  because the per-replication vector a real test needs is not yet stored. **Phase 3 replaces that one
  function** and nothing else here changes.

The scenarios `POST` now accepts an explicit `overrides` object (applied after `duplicateOf`), which
is what makes one click enough. AI narration has its own telemetry point, `simulation.next-steps`,
so it is not billed as an assessment.

**A build failure worth remembering.** The first cut put `loadStudyRuns` (a Prisma query) in
`studyRuns.ts`, `nextSteps.ts` imported a pure helper from that same file, and `StudyManager` — a
client component — imported a constant from `nextSteps`. Three ordinary-looking imports put Prisma in
the browser bundle and broke the deploy. The query now lives in `loadStudyRuns.ts`; `studyRuns.ts`
is types and pure helpers only and says so in its header; and T3387/T3388 walk the import graph so
the next one costs a second instead of a deploy.

**Smaller item 04 — a named baseline and a trend. SHIPPED.** `SimulationRun.baseline` added (product
version 2.5 → 2.6, Q1 only — no XSD change, and `ddlGenerate.ts` is untouched because SimulationRun
is operational, not diagram-model). The ⚑ control sits beside the ★ pin in
`results/RunHistory.tsx`; the chart is `results/RunTrend.tsx` over a pure `runTrend.ts`.

Three decisions worth recording:

- **Setting a baseline pins the run.** Otherwise pruning (keep-5 unpinned) could delete the very
  reference the trend measures from. T3396 pins that contract from the pruning side.
- **At most one baseline per scenario, cleared in the same transaction** as the new one is set, so a
  failure cannot leave a scenario with two baselines or none.
- **Runs before the baseline are excluded from the chart.** The baseline is the point the user chose
  to measure from; putting earlier runs on the same axis would misrepresent it as a starting point.
  And with no baseline pinned the panel says so rather than guessing one — "since when" is the
  user's judgement, not the tool's.

---

## Phase 2 — A business case, not a utilisation chart

**Status:** ✅ `Shipped` — including smaller items 01 and 05. Product version 2.6 → 2.7.

- [x] `app/lib/simulation/facts/businessCase.ts`
- [x] `buildBusinessCaseChapters()` + route `.../studies/[studyId]/business-case?format=docx|xlsx|pdf`
- [x] Smaller item **01** — rework / first-pass yield as a named parameter
- [x] Smaller item **05** — "what if we automate this task?" in one click

`buildBusinessCaseFacts(base, tobe, inputs)` where `inputs = { implementationCost, annualVolume,
workingDaysPerYear, costOfDelayPerCaseHour? }` stored on the study. Outputs: cost per case before and
after, the annual difference, the one-off cost, and the **month it pays back** — plus cost of *doing*
(already computed: `AggregatedStats.totalCost`, busy hours × rate), cost of *waiting* (queue time ×
cost of delay) and cost of *rework*.

> *No department head approves a change because a team is at 94% utilisation. They approve it because
> of a number with a currency symbol and a date.*

**As built — the design changed after Paul's question.** The plan proposed asking for a "cost of delay
per case-hour" as a new input. Checking the engine showed that was inventing an input for something
already measurable: `waitTime` is a NON-SEIZING delay (it releases the resource, then waits), queue
wait is emergent from contention, and `cost = busyTime × rate` prices NEITHER. So the gap was an
unmeasured output, not a missing input.

What shipped instead:

- **Waiting is measured in the engine** and reported in **two** lines, never pooled: queueing for a
  person (capacity shortens it) and waiting on the process (capacity does nothing). Pooling them
  would produce cases recommending headcount to fix waiting headcount cannot touch.
- **The delay rate is optional and is the BUSINESS cost of elapsed time only** — penalties, lost
  revenue, working capital. Never staff cost, which the doing line already carries. Leave it blank
  and waiting shows in hours with no money: "40 hours per case, 31 of it the courier" is an argument
  on its own.
- **A missing input is named, never assumed zero**, and a change that does not pay back says so
  instead of producing a flattering month.
- **The exported document carries the DETERMINISTIC narrative**, so a downloaded artefact is
  reproducible and does not depend on an AI call succeeding at the moment someone clicks Export.

Neither smaller item needed an engine change. Rework is the loop-back edge probability read the
other way round (`branchProbability` on the diagram, `probability` on the override — two names for
one quantity at two layers). Automation is one override that keeps a 5% residual time and drops the
task's demand on the team; the residual is deliberately not zero, because a case built on "instant
and free" is one nobody believes.

**Smaller item 01 — rework / first-pass yield.** No engine change: a rework loop's loop-back edge
already carries a probability. Surface it in `SimDataPanel.tsx` as "what proportion comes back?", and
report `reworkCostPerCase` as its own line, derived from traversals of the loop-back edge × the cost
of the steps repeated.

**Smaller item 05 — automate this task.** A button creating a scenario whose
`OverrideSet.elements[nodeId]` sets `cycleTime` near zero and drops the resource demand.
`applyOverrides` needs no change. Wire the candidate ranking from
`app/lib/mining/taskMining/automation.ts` so a Task Mining score becomes a quantified saving.

**Document output** reuses `buildDocx` (`app/lib/documents/exportDocx.ts`) exactly as
`app/lib/mining/exportAnalysis.ts` does, and the new route mirrors
`app/api/projects/[id]/mining/runs/[runId]/analysis-export/route.ts` including its LibreOffice PDF
path. The machinery that writes SOPs to Word is already in the building.

---

## Phase 3 — Tell them when a difference is real

**Status:** ✅ `Shipped` — including smaller item 06. **Correction to the plan:** this needed NO
version bump. `metrics` is an existing Json column, and per UPDATE_EVERYTHING Step 0 a new key inside
one is data, not structure. Feature-only release, Step 5 alone.

- [x] **Blocker first:** persist `repMeans` (+ `repCompleted`, `repCost`) on run metrics
- [x] `app/lib/simulation/significance.ts`
- [x] Verdict line + "Run N more replications" in `results/CompareView.tsx`
- [x] Smaller item **06** — warm-up chosen for the user

**The blocker.** The run route persists `metrics = { stats, bottlenecks, nodeLabels, clockUnit,
teamCapacities }` — `MonteCarloResult.reps` is computed and **dropped**. Significance needs the
per-replication vector. Add `repMeans: number[]` to the stored metrics: at most 100 numbers, trivial
beside `networkSnapshot`. Runs predating it fall back to the p5–p95 half-width, and the verdict says
it is approximate.

`significance.ts` provides Welch's t on the two runs' per-replication means, the confidence interval
**on the difference**, a verdict (*real* / *inside the noise*), and
`replicationsNeeded(sd, targetHalfWidth)` — how many more would settle it. The UI then offers to run
them, clamped by `RUN_LIMITS` in `runner.ts`.

> *Someone will otherwise present a 4% improvement that is entirely sampling noise, and be found out
> by the first person who reruns it.*

**As built.** One design point worth recording: the result carries BOTH a `verdict` (how much to
trust the answer — `real`, `inside-noise`, `approximate`, `not-enough-data`) and `exceedsBand` (which
way the answer points). Folding them together was the first cut, and it made every comparison
against an older run read as noise, because the fallback path could never return `real`. The
decision and the confidence in it are different questions and are now separate fields.

The t critical values are a lookup table rather than an inverse-CDF: the range that matters is
small (5–30 replications), and a table is inspectable and impossible to get subtly wrong. Between
rows it takes the LARGER value, so the interval is never narrower than it should be — erring
towards "cannot tell", never towards a false finding.

**Smaller item 06 — auto warm-up.** `app/lib/simulation/warmup.ts`, Welch's moving-average method
over a pilot replication's flow-time series. Needs completion *timestamps* alongside the existing
`RepStats.flowSamples` values. Suggest a warm-up in the run dialog; never impose one.

---

## Phase 4 — Sweep a number instead of guessing at it

**Status:** `Not started` · No engine change. Phase 8 depends on this.

- [ ] `app/lib/simulation/sweep.ts` — `buildSweep(lever, from, to, steps)` → N `OverrideSet`s
- [ ] Knee detection (maximum curvature)
- [ ] `maxSweepSteps` in `RUN_LIMITS`, `steps` folded into the `maxWork` clamp
- [ ] Response-curve chart with the knee annotated

Each step runs through the existing `runMonteCarlo` against a network assembled once. The interesting
feature of the curve is the **knee** — the point where one more person stops buying much — so
detecting and annotating it is the feature, not the chart.

> *The answer to a staffing question is a curve, not a number, and the curve is what stops the
> conversation coming round again in six months.*

**⚠ Cost guard.** `runMonteCarlo` runs synchronously in the request, and `RUN_LIMITS.maxWork` guards
*one* run; a sweep multiplies it by `steps`. Clamp hard here. This is the phase at which a
queued-and-polled job becomes a real requirement — note it, don't build it yet.

**Persistence.** Each sweep point is a `SimulationRun` tagged in `configSnapshot` and **pinned**, so
`runIdsToPrune` (keep-5 unpinned) does not eat the curve.

---

## Phase 5 — Priorities and queue discipline

**Status:** `Not started` · **First engine phase.** The engine-side smaller items are batched here so
they share one release and one regression pass. Changes stored shapes → docs pass required.

- [ ] `ResourcePool` gains `discipline: "fifo" | "priority" | "shortest-first"`
- [ ] `SimTeam.discipline` + `TeamOverride.discipline`
- [ ] Per-segment service level in `statistics.ts`
- [ ] Smaller item **02** — holidays and absence
- [ ] Smaller item **03** — batching and cut-off times

The whole change lands cleanly in `app/lib/simulation/resourcePool.ts`, whose own header already
names FIFO queueing as *"exactly where WAIT TIME comes from"*. `QueuedRequest` gains `priority` and
`serviceEstimate`; `request()` inserts by discipline; `drainQueue()` keeps its shape; `PoolState`
gains the same fields so snapshot/resume (`toJSON`/`fromJSON`) stays whole.

**Token priority needs no new concept.** `SimPropertyDef` and `Assignment` already exist in
`model.ts`, so a priority is assignable at a source or gateway like any other token property.

**Per-segment service level.** `RepStats.flowSamples` becomes `{ flow, segment }[]`; `caseDistOf`
gains a per-segment split → `AggregatedStats.caseFlowBySegment`. Report per segment, never pooled:

> *A pooled p95 can look healthy while the segment that matters most misses its target entirely. This
> is the commonest way a simulation flatters a process.*

**Smaller item 02 — holidays and absence.** `WorkCalendar` gains
`exceptions: { date, intervals }[]` (empty intervals = closed) and an `epochDate` anchor, since sim
`t=0` is currently "Monday 00:00" with no calendar date. All of it lands in
`app/lib/simulation/calendar.ts` — the file its own header calls the correctness-critical core
carrying the bulk of the calendar tests. Round-trip through `serializeWorkCalendar` /
`parseWorkCalendar` and the BPSim `<Calendar>` element.

**Smaller item 03 — batching and cut-off times.** `SimNode.batch?: { size?, cutoff? }` — accumulate
to `size` or until the wall-clock `cutoff`, then seize once for the batch. Engine change in the seize
path in `engine.ts` (`startOrQueue`).

**Regression bar.** This phase touches `engine.ts`, `resourcePool.ts`, `calendar.ts`, `statistics.ts`
and the BPSim mapping. Run all of `tests/simulation/` (54 files) plus the simulation regression CI
job, and assert the existing examples produce **bit-identical** results with the new fields unset.

---

## Phase 6 — Does this model match reality?

**Status:** `Not started` · No engine change. Closes the Miner ↔ Simulator loop.

- [ ] `app/lib/simulation/validate.ts` — `compareDistributions(simulated, observed)`
- [ ] `holdoutPct` in `app/lib/mining/calibrateSimulation.ts`
- [ ] Overlaid distributions + agreement figure beside the twin

Headline figure: two-sample **Kolmogorov–Smirnov D** — bounded 0..1, no distributional assumption —
plus a p50/p90/p95 comparison table. Observed flow times already exist and are already persisted:
`RunAnalytics.cases[].cycleMs` in `app/lib/mining/analytics.ts`.

**Hold-back.** Calibration fits from the whole log today. Add a `holdoutPct` so it uses the earlier
share of cases by start time and validation compares against the rest. `computePerformance(traces)`
takes traces, so the split is a filter before the call — the fitting itself is untouched.

> *Every simulation is asked "how do we know this is right?" Today the answer is judgement. It could
> be a number.*

---

## Phase 7 — People who can do more than one job

**Status:** `Not started` · **Largest engine change, and the cut line if time is short** — the
review's own lowest-value entry of the eight. Changes stored shapes → docs pass required.

- [ ] `ResourcePool` holds named units, each with a skill set
- [ ] `SimNode.requiredSkill?`, `SimNode.skillPreference?: string[]`
- [ ] Team members + skills in the library UI
- [ ] **Explicit decision** on BPSim export

`ResourcePool` is a *counted* pool; skills need *individual* units. Two options were considered:

- **(a)** one pool per skill sharing members — needs a global cross-pool allocator, and breaks the
  "one pool per teamId" invariant the whole contention model rests on. **Rejected.**
- **(b)** ✅ **the pool holds named units, each with a skill set.** `request(now, units, payload,
  requiredSkill?)` matches eligible free units in preference order. Backwards compatible: no skills
  declared = every unit eligible = today's behaviour exactly, and the time-weighted integrals
  (`busyArea` / `queueArea` / `capacityArea`) are untouched.

`skillPreference` is what makes *"the manager covers both when it gets bad"* expressible.

**Decide explicitly:** BPSim has no skills concept. Either carry it in an extension namespace or drop
it on export — and say which, in the exporter, rather than losing it silently.

---

## Phase 8 — Which assumption is load-bearing?

**Status:** `Not started` · Cheap **because** Phase 4 landed first — a tornado is N one-step sweeps.

- [ ] `app/lib/simulation/sensitivity.ts`
- [ ] Sorted tornado chart

Enumerate every overridable parameter in the assembled network — the `NODE_KEYS` list in
`overrides.ts` is already exactly that list — vary each ±X% in turn, run, and rank by |Δ| in the
chosen metric. Reuse the Phase 4 sweep runner and its `maxWork` clamp wholesale.

Show the parameters that make **no** difference as prominently as the ones that do: that half is what
disarms *"but you guessed that number"* — yes, and here is the evidence that it makes no difference.

---

## Examples programme

Every new capability gets a worked example that teaches exactly that capability. All are **authored packages** committed to
`app/lib/simulation/exampleData.json`, which `exampleSeeds.ts` imports and
`scripts/seed-simulation-examples.ts` seeds. Per **0.4** there is no generator route any more: build
each example in a real project and capture it with the admin **Save as example** path (the tested
route, and the one that carries calendars), or hand-write the package. Every new package must pass
`validateExamplePackage`, carry a working calendar for its human teams (**T0571**), and be added to
the **T3369** slug list.

| | Example | Slug | Teaches | Phase | Level |
|---|---|---|---|---|---|
| [ ] | Staffing curve | `staffing-curve` | One queue, one team — sweep size 1→12 and read the knee | 4 | intro |
| [ ] | First-pass yield | `first-pass-yield` | A check that sends work back; rework % as a named parameter, cost of rework as its own line | 2 | core |
| [ ] | Priority triage | `priority-triage` | Urgent vs standard: the pooled p95 looks fine while the urgent segment misses. FIFO vs priority scenarios | 5 | core |
| [ ] | Batch and cut-off | `batch-and-cutoff` | A 4pm posting cut-off and batches of 50 — same work, very different queue | 5 | core |
| [ ] | Holiday shutdown | `holiday-shutdown` | A Christmas shutdown and a summer of absence against steady arrivals | 5 | core |
| [ ] | Validated twin | `mined-twin-validated` | Mining run → twin → held-back validation, agreement figure end to end. Pairs with the existing `accounts-payable-invoice-lifecycle` mining example rather than authoring a new log | 6 | advanced |
| [ ] | Cross-skilled team | `cross-skilled-team` | Assessments + appeals sharing one person; siloed vs cross-skilled | 7 | advanced |

**Plus one extension, not a new example:**

- [ ] `aardwolf-loan-comparison` already carries as-is/to-be — add the business-case inputs
  (implementation cost, annual volume) there so the payback month is non-trivial. Better than a sixth
  near-duplicate comparison example.

**`priority-triage` is the one to build carefully.** It is the example that *proves* the review's
claim that a pooled p95 flatters a process, and it should be legible in a single screenshot.

---

## Verification

- **`npm run build` — NOT OPTIONAL, and run it before pushing.** `tsc` and the unit suite were both
  fully green while a client component transitively imported Prisma, which broke the production
  build, the deploy, the CI `test` job (it builds after testing) and the CI `e2e` job (its server
  builds first). One root cause, four red jobs, and nothing local caught it. `tests/simulation/
  client-bundle-hygiene.test.ts` now pins the specific invariant, but the build is the only thing
  that bundles.
- **Local:** `export PATH="$PATH:/c/Program Files/nodejs"; cd /c/Git/Diagramatix/diagramatix; npm run go`.
  Adopt each new example from the gallery and run its scenarios end to end.
- **Unit:** `npx vitest run tests/simulation` after every phase; the full suite plus the simulation
  regression CI job after Phases 5 and 7.
- **Regression bar for engine phases:** existing example packages must produce bit-identical
  aggregated stats with the new fields unset. **The single most important guard in this plan.**
- **BPSim round-trip:** `tests/simulation/bpsim*.test.ts` after Phases 5 and 7, including the explicit
  decision about what happens to skills and disciplines on export.
- **Examples:** do **not** run the `gen-*` scripts (**0.4** — they are retired and stale; each drops
  its example’s calendar). `exampleData.json` is edited and committed directly, and is verified by
  `exampleSeeds.test.ts`, which runs every scenario of every example, plus **T0571** (calendars) and
  **T3369** (no example silently lost).
- **New tests** from **T3369**, appended to `tests/TESTS_SUMMARY.md`.
- **Docs:** `schema/UPDATE_EVERYTHING.md` Steps 0–12 on Phases 1, 3, 5 and 7.

---

## Risks

1. **Metrics-shape drift.** Phase 3 adds `repMeans`, Phase 5 adds segments. Older runs lack both.
   Every reader must tolerate absence and say so — never guess, never average the two.
2. **Sweep and tornado cost.** `runMonteCarlo` is synchronous in the request; a sweep multiplies the
   existing work budget by `steps`. Clamp hard in Phase 4; the queued-job migration becomes real here
   and should be planned before Phase 8 makes it routine.
3. **Phase 7 is the cut line.** The largest engine change, the review's own "Medium value", and the
   only one that alters the pool invariant. Everything before it stands alone.
