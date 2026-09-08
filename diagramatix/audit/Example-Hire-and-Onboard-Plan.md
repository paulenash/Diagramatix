# Worked Example Plan — Hire & Onboard (ADVANCED)

| | |
|---|---|
| **Created** | 2026-09-08 |
| **Status** | `Planned` — nothing built yet |
| **Slug** | `hire-and-onboard` |
| **Level** | `advanced` — the only one, after the 2026-09-08 re-levelling |
| **Purpose** | The capstone example: one process that exercises calendars, holidays, named people, skills, roles read from ArchiMate, priority queueing, the sweep, the tornado and the business case, in that order |
| **Parent plan** | [`Simulator-Extensions-Plan.md`](./Simulator-Extensions-Plan.md) — the *Examples programme* section |
| **Companion diagrams** | one **BPMN** (the process) + one **ArchiMate** (the operating model). First example to carry two diagram *types* |

---

## 0. The re-levelling this sits inside

Done on 2026-09-08 and guarded by **T3561** / **T3562** in `tests/simulation/exampleSeeds.test.ts`:

| Example | Was | Now |
|---|---|---|
| `simple-process` | intro | **intro** |
| `loan-origination` | core | **intro** |
| `car-repair-rework-loop` | advanced | **core** |
| `aardwolf-loan-comparison` | advanced | **core** |
| `sales-marketing-drill-through` | advanced | **core** |
| `hire-and-onboard` | — | **advanced** *(this plan)* |

That leaves `advanced` meaning *"the example that exercises the whole feature set"* rather than
merely *"a longer diagram"* — which is the point of adding this one.

> ⚠ **Levels live in the DB too.** `scripts/seed-simulation-examples.ts` upserts by slug, so the new
> levels reach a gallery only after that script is re-run — locally *and* on prod. Editing
> `exampleData.json` alone changes nothing a user can see.

---

## 1. Why this example, and what it has to prove

Every capability from Phase 2 onwards is currently reachable only by someone who already knows it is
there. The five existing examples predate all of it: not one has a named person, a skill, a public
holiday, a priority stream, a sweep worth running or a business case with a number in it.

This example exists to make one argument, end to end, in a domain everybody understands:

> **The constraint is not headcount. It is who is allowed to do the work.**
>
> Four people in HR Operations, but only two are trained to sign off a right-to-work check. Adding a
> fifth and a sixth person does almost nothing. Training a third checker — for a fraction of the cost
> — fixes it. Here is the curve, here is the evidence the difference is real, and here is the payback
> month.

That argument is unavailable in every other example, it is the reason skills were built, and it is
exactly the shape of question a Business Architect brings to a simulator. It also fails honestly: if
the learner only ever adds headcount, the model tells them it did not work and the significance test
backs that up.

**Secondary argument, carried by the same model:** the skills matrix is not typed in. It is *read off
the ArchiMate diagram the Business Architect already drew.*

---

## 2. What must be built first — six gaps

None of these is a defect in this plan; all six are real gaps found while checking whether the
example could be authored at all. **Four of the six block it outright.**

| # | Gap | What actually happens today | Where | Blocks? |
|---|---|---|---|---|
| **A** | Skills do not survive a package | `captureProjectLibrary` selects `name, capacity, costPerHour, efficiency, calendarId`. `adoptLibraryInto` creates teams without `members`. An adopted cross-skilled example becomes a plain counted pool — **silently** | `captureProject.ts:31`, `adoptPackage.ts:60` | **YES** |
| **B** | Only study-root diagrams are captured | `captureIds = rootIds + variantIds`. An ArchiMate companion is neither, so it is never captured and never adopted | `captureProject.ts:87` | **YES** |
| **C** | Business-case inputs do not travel | `ExamplePackage.study` is `{ name, rootKeys }`. The inputs live on `SimulationStudy.businessCase` and are dropped | `examplePackage.ts:68` | **YES** |
| **E** | **You cannot ask "what if we cross-trained someone?"** | `TeamOverride` is `{ capacity, discipline }` only. There is no scenario lever for *who holds which skill*, and none for a task's `requiredSkills` | `overrides.ts:31` | **YES** |
| **D** | Batching is unreachable from a diagram | `SimNode.batch` is honoured by the engine and tested (T3486–T3488), but there is no `ElementSimParams.batch` and no `assemble.ts` mapping. Phase 5's smaller item 03 landed in the engine only | `model.ts:107` vs `simParams.ts` | no — dropped from scope |
| **F** | A skill requirement on a memberless team silently does nothing | `request()` short-circuits on `if (!this.skilled)` — correct for backwards compatibility, but nothing warns that the constraint was ignored | `resourcePool.ts:182` | no — but see §4.4 |

### Gap E is the important one

Phase 7 shipped the skills *model* but not the *lever*. A skills matrix that cannot be varied in a
scenario is documentation, not a decision tool — and "should we train a third person?" is the only
question anybody asks once they have one. **This example cannot make its central argument without
it.**

Proposed minimum, additive and inert when unset:

```ts
export interface TeamOverride {
  capacity?: number;
  discipline?: QueueDiscipline;
  /** Cross-training as a SCENARIO, not a rebuild of the library. Merged by
   *  member name over the library's people; a name not in the library is
   *  reported, never silently invented. */
  members?: { name: string; skills: string[] }[];
}

export interface NodeOverride {
  /* …existing… */
  /** "What if this step no longer needed the specialist?" — the other half of
   *  the same question. Empty array = requires nothing. */
  requiredSkills?: string[];
}
```

`requiredSkills` must be added to `NODE_KEYS`, which is what makes it appear in the tornado and the
sweep for free. `members` needs its own merge branch in `applyOverrides` (a replace-by-name merge,
not a whole-list replacement — otherwise a scenario that trains one person deletes everybody else).

### Gap F — the readiness warning

`requiredSkills` on a task whose team names nobody is silently ignored. That is the right *engine*
behaviour and the wrong *authoring* behaviour: it is precisely how this example would rot if someone
later cleared the HR Operations member list. One line in `readiness.ts`:

> *"Right-to-work & background check requires Right to Work Compliance, but HR Operations names no
> people — the requirement is ignored and anyone on the team can take it."*

Cheap, and it belongs to the same family as the calendar `epochDate` warning and the unmatched-actor
report: **the arithmetic was never the risk.**

### Sizing

| Gap | Work |
|---|---|
| A | `members`/`skillsSource` on `ExampleTeam`; carry in capture + adopt; one round-trip test |
| B | `ExamplePackage.diagrams` already holds anything — add `extraKeys` (or simply capture every project diagram not already a root) + a validation rule that a non-root diagram is allowed |
| C | `study.businessCase?: BusinessCaseInputs` in the package; write it on adopt |
| E | `TeamOverride.members`, `NodeOverride.requiredSkills`, `NODE_KEYS`, merge logic, tornado/sweep pick it up free |
| F | one readiness check |

Roughly one focused session for A/B/C/F, one for E. **E should ship first** — it is the one with a
design decision in it, and everything else is plumbing.

---

## 3. The diagrams

### 3.1 BPMN — *Hire & Onboard* (the study root)

One pool, five lanes. Clock unit **hour** — a year is 8,760 hours, inside `maxHorizon` (100,000),
whereas a year in minutes (525,600) is not. Every duration below is in hours unless stated.

| # | Element | Lane / team | Sim parameters | Why it is there |
|---|---|---|---|---|
| 1 | ⭘ **Vacancy approved** (start) | — | `arrival: exponential(mean 7)`, `calendarId: "HR business hours"` | ~260 hires/yr. Gated so vacancies arrive in working time |
| 2 | ▭ Draft role profile | Hiring Manager | `triangular(1, 1.5, 3)` | |
| 3 | ▭ Approve requisition | Hiring Manager | `triangular(0.25, 0.5, 1.5)` | |
| 4 | ▭ Advertise role | Talent Acquisition | `fixed(0.75)` | |
| 5 | ⏱ **Applications gather** (timer) | — | `delay: 10`, `delayMode: "working-days"` | **Process wait**, not queue wait. Steps over the Christmas shutdown — visible proof the calendar is doing something |
| 6 | ▭ Screen applications | Talent Acquisition | `triangular(2, 3, 5)` | |
| 7 | ▭ Shortlist & schedule interviews | Talent Acquisition | `triangular(0.75, 1, 2)` | |
| 8 | ▭ **Interview panel** | Talent Acquisition | `triangular(1.5, 2, 3)`, **`requiredSkills: ["Technical Interviewing"]`** | Only Priya holds it — a second, milder specialist pinch upstream of the main one |
| 9 | ◇ Offer made? | — | 72% yes / 28% → back to (7) | Rework loop; the 28% is a named parameter for the tornado |
| 10 | ▭ Prepare offer | HR Operations | `triangular(0.5, 0.75, 1.25)` | |
| 11 | ▭ **Negotiate offer** | Talent Acquisition | `triangular(0.5, 1, 2.5)`, **`requiredSkills: ["Offer Negotiation"]`** | Priya + Aisha |
| 12 | ◇ Offer accepted? | — | 86% yes / 14% → back to (7) | |
| 13 | ▭ **Right-to-work & background check** | HR Operations | `cycleTime: triangular(0.5, 0.75, 1.5)`, `waitTime: fixed(40)`, **`requiredSkills: ["Right to Work Compliance"]`** | **The constraint.** 2 of 4 trained. `waitTime` is the external provider — process wait that headcount cannot touch, which the business case must not confuse with queueing |
| 14 | ⬦ Parallel split | — | — | |
| 15 | ▭ Create payroll record | Payroll | `fixed(0.4)`, `requiredSkills: ["Payroll Administration"]` | |
| 16 | ▭ Provision laptop & accounts | IT Provisioning | `triangular(0.5, 0.75, 1.5)` | On the IT service-desk calendar — different hours from HR |
| 17 | ▭ Prepare onboarding pack | HR Operations | `fixed(0.6)`, `requiredSkills: ["Onboarding Administration"]` | Held by all four — so it is *not* a constraint, which is the control case |
| 18 | ⬦ Parallel join | — | — | |
| 19 | ⏱ Wait for start date | — | `delay: 15`, `delayMode: "working-days"` | Notice period |
| 20 | ▭ Day-one induction | HR Operations | `fixed(3)` | |
| 21 | ⬤ **Onboarded** (end) | — | — | |

**Token priority** is assigned on the start event (2 above) via `sim.assign`:

```json
{ "property": "priority",
  "dist": { "kind": "fixed", "value": 1 } }
```

…with the *critical* stream carried by a second source, or (simpler, and the route actually taken)
a single source whose assignment is an expression giving 10 to ~30% of cases. The `priority`
property only bites when a team's discipline is `priority`, which is a scenario override — so the
baseline model is unchanged and FIFO, exactly as it should be.

### 3.2 ArchiMate — *HR operating model — who can do what*

Not a study root. Present purely so the learner can press **✨ Fill from ArchiMate** and watch the
matrix populate. This is the diagram that makes Gap B a blocker.

**Business Actors** (must match team member names *exactly*, modulo case/whitespace):

| Actor | Team |
|---|---|
| Priya Raman | Talent Acquisition |
| Tom Fletcher | Talent Acquisition |
| Aisha Khan | Talent Acquisition |
| Grace Oduya | HR Operations |
| Ben Carter | HR Operations |
| Marta Silva | HR Operations |
| Ruth Ellis | HR Operations |
| Sam Doyle | IT Provisioning |
| Nina Petrov | IT Provisioning |
| Jo Mensah | Payroll |
| **Dev Nair (Contractor)** | *nobody* — deliberate, see §3.3 |

**Business Roles.** Leaf roles are skills; a role that aggregates others is a bundle:

- Leaves: `Sourcing`, `Offer Negotiation`, `Technical Interviewing`, `Right to Work Compliance`,
  `Payroll Administration`, `Onboarding Administration`
- `Senior Recruiter` —aggregation→ { Sourcing, Offer Negotiation, Technical Interviewing }
- `Onboarding Specialist` —aggregation→ { Onboarding Administration, Right to Work Compliance }

**Assignments, Actor → Role** (`archi-assignment`) — *the person holds the skill*:

| Actor | Assigned to | Resolves to |
|---|---|---|
| Priya Raman | Senior Recruiter | Sourcing, Offer Negotiation, Technical Interviewing |
| Tom Fletcher | Sourcing | Sourcing |
| Aisha Khan | Sourcing, Offer Negotiation | both |
| Grace Oduya | Onboarding Specialist | Onboarding Administration, **Right to Work Compliance** |
| Ruth Ellis | Onboarding Specialist | Onboarding Administration, **Right to Work Compliance** |
| Ben Carter | Onboarding Administration | Onboarding Administration |
| Marta Silva | Onboarding Administration | Onboarding Administration |
| Jo Mensah | Payroll Administration | Payroll Administration |
| Sam Doyle, Nina Petrov | *(none)* | — |

`Senior Recruiter` earns its keep here: it is defined once and assigned wholesale, and the fill
expands it to three leaves. That is the feature, not decoration.

**Assignments, Role → Business Process** — *the work requires the skill*. The Business Process
labels must match the BPMN task labels exactly:

| Role | Business Process |
|---|---|
| Technical Interviewing | Interview panel |
| Offer Negotiation | Negotiate offer |
| Right to Work Compliance | Right-to-work & background check |
| Payroll Administration | Create payroll record |
| Onboarding Administration | Prepare onboarding pack |
| Onboarding Administration | **Exit interview** — deliberate, see §3.3 |

### 3.3 The two deliberate non-matches

The unmatched report is the headline of the fill panel, and an example where it comes back empty
teaches the learner to ignore it. So the diagram carries exactly two honest mismatches:

1. **Dev Nair (Contractor)** — an actor in the architecture who is on no team. Reported under *"In
   the diagram, not on any team"*.
2. **Exit interview** — a business process with a role assigned but no matching BPMN task. Reported
   under *"In the diagram, matching no task"*.

Both are the kind of thing a real architecture diagram always has, both are harmless, and both are
called out in the example's own description so they read as intentional rather than as a broken
example.

---

## 4. The library

### 4.1 Calendars

| Calendar | Pattern | Used by |
|---|---|---|
| **HR business hours** | Mon–Fri 09:00–12:30 and 13:30–17:00 (7.5 h/day) | Talent Acquisition, HR Operations, Payroll, and the arrival source |
| **IT service desk** | Mon–Fri 08:00–18:00 | IT Provisioning |

`epochDate: "2027-01-04"` on both — **verified a Monday**, which the weekly pattern anchors t=0 to.
Without it, `exceptions` are ignored entirely and `calendarWarnings` says so.

### 4.2 Exceptions — the holidays

Dated closures on both calendars (`intervals: []` = closed all day):

`2027-01-01` New Year's Day · `2027-01-26` Australia Day · `2027-03-26` Good Friday ·
`2027-03-29` Easter Monday · `2027-04-25` Anzac Day · `2027-06-14` King's Birthday ·
`2027-12-24` → `2028-01-03` **Christmas shutdown** (a run of dated closures)

Plus one half-day, because a non-empty exception is the interesting case and the common case is
already covered: `2027-12-23`, `09:00–12:30` only.

> The Christmas shutdown is what makes step 5's *"10 working days"* visibly different from *"14
> days"*. A learner who runs the model across December sees the timer step over the closure. That is
> the whole argument for `delayMode: "working-days"` in one screenshot.

### 4.3 Teams and people

| Team | Capacity | £/hr | Calendar | Named people |
|---|---|---|---|---|
| Hiring Manager | 6 | 95 | HR business hours | *(none — a counted pool)* |
| Talent Acquisition | 3 | 65 | HR business hours | Priya Raman, Tom Fletcher, Aisha Khan |
| HR Operations | 4 | 45 | HR business hours | Grace Oduya, Ben Carter, Marta Silva, Ruth Ellis |
| IT Provisioning | 2 | 55 | IT service desk | Sam Doyle, Nina Petrov |
| Payroll | 1 | 50 | HR business hours | Jo Mensah |

Mixing a counted pool (Hiring Manager) with named teams is deliberate: it shows both models coexisting,
and it keeps the example honest about the fact that you only name people where the naming *does*
something.

### 4.4 ⚠ The authoring trap (Gap F)

**Every task carrying `requiredSkills` must sit on a team that names its people.** A skill required
from a memberless pool is granted to anyone, silently — `resourcePool.ts:182`. In the design above
that is satisfied (all five skilled tasks are on Talent Acquisition, HR Operations or Payroll, never
on Hiring Manager), but it is one careless edit away from being untrue, which is why Gap F's
readiness warning is worth shipping alongside.

### 4.5 Business-case inputs (on the study)

```json
{ "implementationCost": 4500,
  "annualVolume": 260,
  "costOfDelayPerHour": 120 }
```

- **£4,500** — accredited right-to-work compliance training for one person, plus their time.
- **260** — hires per year, consistent with the arrival rate.
- **£120/h** — the business cost of a role standing empty. *Not* staff cost; the doing line already
  carries that. This is the number that makes the payback month non-trivial, and the example's
  description must say plainly that it is an assumption the reader should replace.

The alternative being costed — **hiring a fifth HR Operations person** at ~£88,000 loaded plus
£12,000 recruitment — is the comparison scenario, and is ~22× the training cost. The model's job is
to show it also performs *worse*.

---

## 5. Scenarios and planned runs

Run config for all: `clockUnit: "hour"`, `horizon: 8760`, `warmUp: 336` (two weeks), `replications: 10`,
`seed: 20260908`, `collectQueues: true`.

Cost check: 8,760 × 10 = 87,600 per run, well inside `maxWork` (5,000,000). A 12-point sweep is
1,051,200 — also fine. A tornado over ~11 parameters is 23 runs; `maxSweepSteps` is 24, so it just
fits. **Twelve parameters would not**, and the tornado would name what it dropped.

| # | Scenario | Overrides | Teaches |
|---|---|---|---|
| 1 | **As-is — today's team** *(baseline)* | *(none)* | The starting picture. Right-to-work is top of `bottlenecks` |
| 2 | **Hire two more HR administrators** | `teams["HR Operations"].capacity = 6` | **The trap.** Costs £200k/yr and barely moves the answer, because the queue is for a *skill*, not a *desk* |
| 3 | **Train a third checker** | `teams["HR Operations"].members = [{ name: "Marta Silva", skills: [ …+"Right to Work Compliance" ] }]` | **The answer.** £4,500, capacity unchanged, and the constraint lifts. *Needs Gap E* |
| 4 | **Train a third checker + triage critical roles** | scenario 3 plus `teams["HR Operations"].discipline = "priority"` | Priority queueing; the pooled p95 barely moves while the critical segment improves sharply |

**Then, from the panels rather than as stored scenarios:**

- **Sweep** — `HR Operations` capacity, 1 → 10, 10 points, measuring near-worst flow time. Run it on
  scenario 2 and the curve is nearly **flat above 4**: there is no knee, because more desks buy
  nothing. Run the same sweep on scenario 3 and the curve has a real knee. *Two sweeps, one lesson* —
  and it is the clearest demonstration of the knee detector refusing to invent an elbow that this
  product will ever have.
- **Tornado** — on the baseline. Expected ranking: the right-to-work cycle time and the arrival rate
  move the answer; `Prepare onboarding pack` and the IT provisioning time do not; the **Payroll**
  headcount (capacity 1) comes back **not-testable**, which is the untested-vs-unimportant
  distinction landing in a real model rather than a unit test.
- **Business case** — scenarios 1 → 3, then 1 → 2 for contrast. Only one of them has a payback month.
- **Significance** — 1 vs 2 should read *inside the noise*; 1 vs 3 should read *real*. If 1 vs 2 came
  back "real" the example would be teaching the opposite of what it claims, so this is a build-time
  acceptance check, not just a walkthrough step (see §8).

---

## 6. The learner's walkthrough

Ten steps, each one landing a feature. This becomes the example's `description` and the ordering of
its scenarios.

1. **Adopt** *Hire & Onboard* from the Simulator Examples gallery. Two diagrams arrive: the process,
   and the HR operating model.
2. **Open the ArchiMate diagram.** Nobody has typed a skills matrix. This is the picture the Business
   Architect already had.
3. **Team library → ✨ Fill from ArchiMate.** The preview says what it *would* fill before anything
   happens. Fill it. Ten members get skills, five tasks get requirements — and two things do not
   match, both named. Read the unmatched report: that is the feature.
4. **Run the baseline.** HR Operations is top of the bottleneck list, and the flow-time p95 is far
   worse than the p50 — the long tail is the cases that arrive when neither Grace nor Ruth is free.
5. **Look at the calendar.** Run the replay across late December and watch the process stop. The
   *"10 working days"* timer steps over the shutdown; an elapsed-days timer would not have.
6. **Ask the obvious question: hire more people.** Run scenario 2. Compare with the baseline —
   the verdict says **inside the noise**. Two extra salaries, no measurable difference.
7. **Sweep the headcount, 1 → 10.** The curve is flat above 4 and reports **no knee**. The model is
   telling you that you are pulling the wrong lever.
8. **Train one person instead.** Run scenario 3. Compare: this time the difference is **real**, and
   the same sweep now shows a genuine knee.
9. **Tornado.** Which of the model's thirty numbers were load-bearing? Two were. Several made no
   measurable difference — a rough guess is safe for those. And one could not be tested at all, and
   says so.
10. **Business case.** £4,500 against £200,000, with a payback month on the cheap one and none on the
    expensive one. Export to `.docx` and it is a paper you could hand to a finance director.

Step 6 → 8 is the spine. Everything else is scenery hung on it.

---

## 7. Feature coverage

| Feature | Phase | Where in this example |
|---|---|---|
| Named baseline + run trend | 1 | Scenario 1, kept as the baseline across runs |
| Suggested next steps | 1 | Available after step 8 (four runs ≥ the three-run floor) |
| Business case + payback month | 2 | Step 10 |
| Queue wait vs process wait, kept apart | 2 | Right-to-work: 40 h of provider `waitTime` that headcount cannot touch |
| Rework / first-pass yield | 2 | The 28% and 14% loop-backs |
| Significance verdict | 3 | Steps 6 and 8 — and the example is *wrong* if step 6 reads "real" |
| Warm-up suggestion | 3 | 336 h is set; the pilot should agree |
| **Sweep + knee** | 4 | Steps 7 and 8 — run twice, deliberately |
| Priority queue discipline | 5 | Scenario 4 |
| Per-segment service level | 5 | Scenario 4 — pooled p95 vs the critical segment |
| **Holidays and shutdowns** | 5 | §4.2, visible at step 5 |
| Batching and cut-offs | 5 | ❌ **omitted — Gap D**, unreachable from a diagram |
| Twin validation vs a mining log | 6 | ❌ out of scope — belongs to `mined-twin-validated` |
| **Skills and named people** | 7 | The spine |
| **Skills read from ArchiMate** | 7 | Step 3 |
| Least-flexible-first assignment | 7 | Priya holds three skills and is kept free for the ones only she has |
| BPSim round-trip with skills | 7 | Export/import as an optional last step |
| **Tornado** | 8 | Step 9, including a not-testable bar |

Fifteen of seventeen. The two omissions are honest: one is blocked by Gap D, the other belongs to a
different example.

---

## 8. Build order

| Slice | Work | Done when |
|---|---|---|
| **1** | **Gap E** — `TeamOverride.members`, `NodeOverride.requiredSkills`, `NODE_KEYS`, merge-by-name in `applyOverrides` | A scenario can cross-train one person; unset behaves bit-identically; a name not in the library is reported, not invented |
| **2** | **Gaps A + C** — `members`/`skillsSource` on `ExampleTeam`, `businessCase` on the package study; carry both through capture and adopt | Capture → adopt round-trip preserves a skills matrix and the inputs, proven by a test that fails without the change |
| **3** | **Gap B** — non-root diagrams in a package | An ArchiMate diagram survives capture → adopt and shows up in the fill panel's options |
| **4** | **Gap F** — readiness warning for a skill required from a memberless team | The warning fires; clearing HR Operations' members makes it fire |
| **5** | **Author the two diagrams** in a real project through the editor — *not* by hand-writing JSON | Both render; the ArchiMate fill preview reports 10 members and 5 tasks, with exactly the two intended non-matches |
| **6** | **Configure** calendars, exceptions, teams, people, the four scenarios and the business-case inputs, in that project | Baseline runs; right-to-work is top of `bottlenecks` |
| **7** | **Capture** via the admin *Save as example* path, merge into `exampleData.json` by slug, add to the **T3369** list and the **T3561** level map | `exampleSeeds.test.ts` green |
| **8** | **Acceptance tests** — §9 | Green |
| **9** | Seed locally, walk §6 end to end, then seed prod | The walkthrough works as written |

Slices 1–4 are the ones with judgement in them. 5–7 are careful data entry. **Do not start slice 5
before slices 1–3 are green** — authoring the example first and discovering the package cannot carry
it is the expensive failure mode here.

---

## 9. Verification

Beyond the existing example suite (`validateExamplePackage`, every scenario runs, **T0571**
calendars, **T3369** no slug lost, **T3561/T3562** levels):

- **The example's argument must actually hold.** A test that runs scenarios 1, 2 and 3 and asserts:
  1 vs 2 does **not** clear the significance band; 1 vs 3 **does**; and scenario 3's busiest-team
  utilisation is lower than scenario 2's *at lower cost*. If a future engine change quietly inverts
  that, the example starts teaching the opposite of what it says, and nothing else in the suite would
  notice. **This is the single most important guard in this plan.**
- **The sweep on scenario 2 finds no knee, the sweep on scenario 3 does.** Same assertion style.
- **The tornado returns at least one `not-testable` bar** (Payroll, capacity 1) and at least one
  `no-difference` bar — the example is chosen precisely so both halves are non-empty.
- **The ArchiMate fill matches what §3.2 promises**: 10 members, 5 tasks, exactly 1 unmatched actor
  and exactly 1 unmatched work item. Pin the counts; a silent drift to zero matches is this feature's
  failure mode.
- **Calendar exceptions are actually applied** — `calendarWarnings` empty, `epochDate` a Monday, and
  a case spanning the shutdown takes measurably longer than one that does not.
- **Round-trip**: capture → adopt → capture yields the same skills matrix and business-case inputs.
- **`npm run build`** before pushing, per the parent plan's first verification note.
- New tests numbered from **T3563** (T3562 is the current highest), appended to `TESTS_SUMMARY.md`.

---

## 10. Risks and open decisions

1. **Gap E's merge semantics.** `members` as a whole-list replacement is simpler but means a scenario
   that trains one person silently deletes the other three. Merge-by-name is the right answer and the
   one specified above; it needs a decision on what happens to a name that is *not* in the library —
   the recommendation is **report it, do not invent a person**, matching how the ArchiMate fill treats
   an unmatched actor.
2. **Model size vs legibility.** Twenty-one elements is the largest example in the catalog. It is
   justified — the argument needs a specialist step, a control step that is *not* a constraint, a
   process wait and a rework loop — but the diagram must still be readable in one screenshot or the
   walkthrough falls apart. If it will not fit, the parallel branch (14–18) is the part to simplify,
   not the spine.
3. **The tornado just fits.** Eleven parameters is 23 runs against a cap of 24. Adding one more team
   or task pushes it over and the tornado starts dropping parameters. Acceptable — it *reports* what
   it dropped — but it means this example is also, incidentally, the argument for the queued-job
   migration the parent plan has been deferring since Phase 4.
4. **The £120/h cost of delay is an assumption**, and the payback month is proportional to it. The
   description must say so in the example's own words, not in a footnote. An example that presents a
   made-up number as a finding is the exact failure the business-case work was built to avoid.
5. **Australian public holidays date this example.** They are correct for 2027 and wrong for every
   other year. Either accept that (the `epochDate` pins it to 2027 anyway) or drop to a generic
   "Christmas shutdown + four public holidays" set. **Recommendation: keep the real dates** — a
   holiday calendar that looks real is the point, and a learner replaces it with their own.
6. **Gap D leaves batching untaught** across the whole catalog. Worth a separate, small piece of work
   — `ElementSimParams.batch` plus an `assemble.ts` mapping plus a Properties-panel field — after
   which the parent plan's `batch-and-cutoff` example becomes buildable. Noted, not scheduled.
