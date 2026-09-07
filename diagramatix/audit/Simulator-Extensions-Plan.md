# Diagramatix — Simulator Extensions Plan

| | |
|---|---|
| **Created** | 2026-09-07 |
| **Source** | [`Simulator-Capability-Review.html`](./Simulator-Capability-Review.html) — the *Extensions* section: eight extensions + six smaller items, read from the shipped code |
| **This document** | The **live worklist** for building them. Phases follow the review's own stated build order (value first). Every phase names the files it touches and the existing functions it reuses. |
| **Scope** | All 8 extensions + all 6 smaller items. New worked examples are planned alongside, one per new capability. |
| **How to use** | Work an item, tick its box and set **Status** → `In progress` / `Shipped (<commit>)` / `Won't do (<reason>)`. Keep the review as the historical argument; keep this as the burn-down. |
| **Progress log** | *(empty — nothing started)* |

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
   in `app/lib/simulation/assessFacts.ts`: a pure `buildXFacts()` producing a structured figures
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

**Status:** `Not started` · Blocking: every later phase.

### 0.1 Fix the example-generator overwrite hazard ⚠️

- [ ] `scripts/gen-bpmn-examples.ts` → merge by slug instead of overwriting

`main()` builds `examples` from its own two `METAS`, then `writeFileSync`s `{ examples }` over
`app/lib/simulation/exampleData.json`. That file holds **five** examples. Re-running the generator
today silently destroys `simple-process`, `aardwolf-loan-comparison` and
`sales-marketing-drill-through`.

Adopt the merge-by-slug shape already used by `scripts/gen-aardwolf-example.cjs` — read the existing
file, filter out only the slugs this script owns, push, write. **Blocks every phase that adds an
example.**

### 0.2 Shared study-runs loader

- [ ] New `app/lib/simulation/studyRuns.ts`

Phases 1, 4 and 8 all need "every run of every scenario in this study, with config, overrides and
metrics". Extract the ad-hoc queries in `assess/route.ts` into `loadStudyRuns(studyId)` →
`{ scenarioId, scenarioName, runId, runName, pinned, config: ScenarioRunConfig,
overrides: OverrideSet, metrics: RunMetrics }[]`.

### 0.3 Facts-module convention

- [ ] Create `app/lib/simulation/facts/`, move `assessFacts.ts` under it unchanged (re-export for
      compatibility)

Phases 1, 2, 3, 6 and 8 each add a sibling. One place, one pattern, one test idiom.

---

## Phase 1 — Suggested next steps

**Status:** `Not started` · The review's first extension, and the only one it wrote a feasibility
section for. Changes a stored shape → docs pass required.

- [ ] `app/lib/simulation/nextSteps.ts` (pure)
  - `diffRuns(a, b)` — what changed in the configuration, what changed in the outcome
  - `leverHistory(runs)` — per lever: values tried, range covered, what each was worth
  - `suggestNextSteps(history)` → ranked `Suggestion[]`, each carrying
    `{ title, evidence, scenarioName, overrides: OverrideSet }`
- [ ] `POST .../studies/[studyId]/next-steps` (facts + optional narration)
- [ ] "Next steps" card in `StudyManager.tsx`
- [ ] Smaller item **04** — named baseline + trend

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

**Smaller item 04 — a named baseline and a trend.** `SimulationScenario.isBaseline` exists but is
scenario-level; pinning a *run* needs `SimulationRun.baseline Boolean @default(false)` (schema
change). The trend chart across runs since the baseline goes in
`app/components/simulation/results/RunHistory.tsx`, in the hand-rolled SVG idiom of
`FlowHistogram.tsx`.

---

## Phase 2 — A business case, not a utilisation chart

**Status:** `Not started` · No engine change.

- [ ] `app/lib/simulation/facts/businessCase.ts`
- [ ] `buildBusinessCaseChapters()` + route `.../studies/[studyId]/business-case?format=docx|xlsx|pdf`
- [ ] Smaller item **01** — rework / first-pass yield as a named parameter
- [ ] Smaller item **05** — "what if we automate this task?" in one click

`buildBusinessCaseFacts(base, tobe, inputs)` where `inputs = { implementationCost, annualVolume,
workingDaysPerYear, costOfDelayPerCaseHour? }` stored on the study. Outputs: cost per case before and
after, the annual difference, the one-off cost, and the **month it pays back** — plus cost of *doing*
(already computed: `AggregatedStats.totalCost`, busy hours × rate), cost of *waiting* (queue time ×
cost of delay) and cost of *rework*.

> *No department head approves a change because a team is at 94% utilisation. They approve it because
> of a number with a currency symbol and a date.*

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

**Status:** `Not started` · Changes the persisted metrics shape → docs pass required.

- [ ] **Blocker first:** persist `repMeans` (+ `repCompleted`, `repCost`) on run metrics
- [ ] `app/lib/simulation/significance.ts`
- [ ] Verdict line + "Run N more replications" in `results/CompareView.tsx`
- [ ] Smaller item **06** — warm-up chosen for the user

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

Every new capability gets a worked example that teaches exactly that capability. All merge by slug
into the single `app/lib/simulation/exampleData.json`, which `exampleSeeds.ts` imports and
`scripts/seed-simulation-examples.ts` seeds. Purpose-built teaching processes follow the
`scripts/gen-aardwolf-example.cjs` merge-by-slug shape; anything derived from a real `.bpmn` goes
through `gen-bpmn-examples.ts` — **once 0.1 has made it merge rather than overwrite.** Every new
package must pass `validateExamplePackage` and be covered by `tests/simulation/exampleSeeds.test.ts`.

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

- **Local:** `export PATH="$PATH:/c/Program Files/nodejs"; cd /c/Git/Diagramatix/diagramatix; npm run go`.
  Adopt each new example from the gallery and run its scenarios end to end.
- **Unit:** `npx vitest run tests/simulation` after every phase; the full suite plus the simulation
  regression CI job after Phases 5 and 7.
- **Regression bar for engine phases:** existing example packages must produce bit-identical
  aggregated stats with the new fields unset. **The single most important guard in this plan.**
- **BPSim round-trip:** `tests/simulation/bpsim*.test.ts` after Phases 5 and 7, including the explicit
  decision about what happens to skills and disciplines on export.
- **Generator:** re-run every `gen-*` example script in sequence and confirm `exampleData.json` still
  holds every slug — the specific failure 0.1 fixes.
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
