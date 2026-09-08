# Worked Example Plan — Hire & Onboard (ADVANCED)

| | |
|---|---|
| **Created** | 2026-09-08 |
| **Revised** | 2026-09-08 — sizing arithmetic done; **the first draft's numbers did not work** (see §1.1) |
| **Status** | `Gaps closed 2026-09-08` — **all seven fixed and tested (T3563–T3588)**; the example itself is not built yet |
| **Slug** | `hire-and-onboard` |
| **Level** | `advanced` — the only one, after the 2026-09-08 re-levelling |
| **Purpose** | The capstone example **and an end-to-end acceptance test**: one process that exercises calendars, holidays, named people, skills read from ArchiMate, priority queueing, the sweep, the tornado and the business case — with the figures each step must produce known in advance |
| **Parent plan** | [`Simulator-Extensions-Plan.md`](./Simulator-Extensions-Plan.md) — *Examples programme* |
| **Working** | `scratchpad/hire-onboard-final.cjs` — every number below is reproduced by running it |

---

## 0. The re-levelling this sits inside

Applied 2026-09-08, guarded by **T3561/T3562**, seeded locally, prod SQL in
`scratchpad/prod-example-levels.sql`:

`simple-process` **intro** · `loan-origination` **intro** · `car-repair-rework-loop` **core** ·
`aardwolf-loan-comparison` **core** · `sales-marketing-drill-through` **core**

`advanced` is deliberately empty until this example ships.

---

## 1. Why this example, and what it has to prove

Every capability from Phase 2 onwards is reachable only by someone who already knows it is there.
Not one existing example has a named person, a skill, a public holiday, a priority stream, a sweep
worth running or a business case with a number in it.

This example makes one argument, in a domain everybody understands:

> **The constraint is not headcount. It is who is allowed to do the work.**
>
> HR Operations runs at **56%** — a manager looking at team utilisation sees no problem. But only
> **2 of its 4 people** are accredited to sign off a compliance & vetting review, and those two run
> at **92%**, carrying **1.9 working days** of queue on every hire. Adding desks changes *nothing*.
> Hiring two more administrators changes almost nothing. Training a third checker for £4,500 takes
> the queue to **0.1 days** and buys **50% more hiring volume**.

That argument is unavailable in every other example, and it is the reason skills were built.

### 1.1 What the arithmetic changed — three corrections to the first draft

The sizing was done before authoring anything, and it falsified three things:

1. **The volume was far too low.** At 260 hires/year every team sat near **20%** and *nothing queued
   anywhere*. The example would have taught nothing at all. The volume is now **~790 hires/year**
   (`exponential(mean 2.35 open-hours)`) — a large employer with genuine turnover.
2. **The specialist step was too small to be a constraint.** A 45-minute right-to-work check is a
   thin slice of HR Operations' work; restricting it to half the team still left it at 26%. It is now
   a **compliance & vetting review** — police check, working-with-children check, right-to-work,
   reference and registration verification — `tri(1, 3, 9)` hours. Realistic for a regulated employer,
   legally restricted to accredited staff, and *large enough to be the bottleneck*.
   The wide spread matters as much as the mean: variability drives queues, and a tight
   `tri(2.5, 3.5, 5)` produced only 1.37 days of queue against 1.89 for the same utilisation.
3. **The epoch put the holidays where they would never be tested.** With `epochDate: 2027-01-04` the
   Christmas shutdown fell at **97%** of the horizon, among the end-effects. It is now
   **`2027-07-05`** (verified a Monday), which puts the shutdown at **47%** — mid-measurement — and
   brings Labour Day, Australia Day, Easter, Anzac Day and the King's Birthday inside the run too.

**A fourth finding shapes every assertion in §6:** the headline flow time is dominated by *authored*
waits — 10 working days gathering applications, 15 days' notice, 5.3 days at the external provider —
against only **1.9 days** of queue. So the mean flow time moves ~6% and **the queue-wait line is
where the story is**. That is exactly the split Phase 2 built, and it means the acceptance tests
assert on queue wait and on the p95, never on the mean flow time.

---

## 2. What had to be built first — seven gaps, all now CLOSED

None of these was a defect in this plan; all seven were found while checking whether the example
could be authored and asserted at all, and five of them blocked it. **All seven are now fixed**
(2026-09-08), each with a regression test proving the old behaviour is untouched when the new field
is absent.

| # | Gap | What it used to do | Fix | Tests |
|---|---|---|---|---|
| **A** | Skills did not survive a package | Capture selected five columns; `members` was not one, so an adopted cross-skilled example became a plain counted pool — **silently** | `ExampleTeam.members` + `skillsSource`, carried through capture and adopt | T3574–T3577 |
| **B** | Only study-root diagrams were captured | An ArchiMate companion was neither a root nor a variant, so it could never travel | `companionKeys`, captured by following the `skillsSource.diagramId` reference that already existed; adopt re-points it at the new copy | T3578–T3580 |
| **C** | Business-case inputs did not travel | They live on the STUDY, and the package's study was `{ name, rootKeys }` | `study.businessCase` in the package | T3574, T3577 |
| **E** | **No scenario lever for cross-training** | `TeamOverride` was `{ capacity, discipline }`, so "what if we trained someone?" — the only question anyone asks once they have a skills matrix — was unaskable | `TeamOverride.members` (merge BY NAME) + `NodeOverride.requiredSkills` + `NODE_KEYS` | T3563–T3569 |
| **G** | **`maxSweepSteps` was the wrong guard for a tornado** | 20 parameters → 41 runs, capped at 11, so **9 were dropped** while using barely 70% of `maxWork` | `RUN_LIMITS.maxSensitivityRuns` (121) + `clampSensitivity`, which gives up replications before parameters | T3570–T3573 |
| **D** | Batching was unreachable from a diagram | The engine honoured `SimNode.batch` and had tests for it, but nothing ever WROTE it — no parameter, no mapping | `ElementSimParams.batch` + the `assemble.ts` mapping. A size of 1 or a malformed cut-off is not a batch | T3585–T3588 |
| **F** | A skill required from a memberless team silently did nothing | `request()` short-circuits on `if (!this.skilled)` — right for the engine, wrong for authoring | Two readiness ERRORS: the requirement is ignored, or nobody holds it and the work can never start | T3581–T3584 |

### Gap E — the important one *(shipped)*

Phase 7 shipped the skills *model* but not the *lever*. A matrix that cannot be varied in a scenario
is documentation, not a decision tool. As built:

```ts
export interface TeamOverride {
  capacity?: number;
  discipline?: QueueDiscipline;
  /** Cross-training as a SCENARIO. Merged BY NAME over the library's people —
   *  a whole-list replacement would mean "train Marta" silently deletes the
   *  other three. A name not in the library is REPORTED, never invented. */
  members?: { name: string; skills: string[] }[];
}

export interface NodeOverride {
  /* …existing… */
  /** "What if this step no longer needed the specialist?" */
  requiredSkills?: string[];
}
```

`requiredSkills` goes into `NODE_KEYS`, which puts it in the sweep and the tornado for free.

**Merge semantics, decided:** by name, normalised the way every cross-model link in the product
normalises (trimmed, collapsed, case-insensitive), keeping the library's spelling. A name the team
already has has its skills replaced; a name it does not have is **added**, which is how *"hire two
more administrators"* is expressed. The earlier worry — "report, never invent a person" — is
answered by the normalisation rather than by a rejection: a stray capital retrains the person you
meant instead of creating a phantom twin, and a genuinely different name is a deliberate hire.
`applyOverrides` is pure and has no channel to report anything, so rejecting would have meant
silently dropping instead.

The merge builds a **new** units array of new objects: `cloneNetwork` shallow-copies each team, so
the baseline's people are shared with every scenario, and editing in place would rewrite the baseline
and every sibling scenario — a cross-scenario corruption that would have looked like a random engine
bug (T3564).

### Gap G — new, and only visible on a realistic model

`maxSweepSteps: 24` was sized for a *curve*, where more than 24 points buys nothing. A tornado's
size is `2N+1` and is set by the model, not by the user — any real model exceeds it. This one drops
**9 of 20** parameters while using only 72% of `maxWork`.

**As built:** `maxSensitivityRuns: 121` (60 parameters), still bounded by `maxWork` — which is the
guard that actually protects the request. `clampSensitivity` gives up **replications** before it
gives up parameters: a wider band is reported honestly by `compareSamples` as "no difference shown",
whereas a shorter chart silently omits levers.

### Gap F — the readiness warning

`requiredSkills` on a task whose team names nobody is silently ignored. Right for the engine, wrong
for authoring, and exactly how this example would rot if someone cleared the member list.

**As built**, two readiness ERRORS rather than one warning — both report numbers that are wrong in
the *flattering* direction, which is the worse kind:

- the team names nobody, so the requirement is ignored and there is no queue where there should be one;
- the team names people but nobody qualifies, so the work can never start at all.

---

## 3. The diagrams

### 3.1 BPMN — *Hire & Onboard* (the study root)

One pool, six lanes. **Clock unit `hour`** — a year is 8,760 hours (inside `maxHorizon` 100,000),
whereas a year in minutes is 525,600 and is not.

| # | Element | Team | Sim parameters | Mean h | Runs/case |
|---|---|---|---|---|---|
| 1 | ⭘ Vacancy approved | — | `arrival: exponential(2.35)`, `calendarId: HR business hours`, `assign: priority` | — | 1 |
| 2 | ▭ Draft role profile | Hiring Manager | `tri(1, 1.5, 3)` | 1.83 | 1 |
| 3 | ▭ Approve requisition | Hiring Manager | `tri(0.25, 0.5, 1.5)` | 0.75 | 1 |
| 4 | ▭ Advertise role | Talent Acquisition | `fixed(0.75)` | 0.75 | 1 |
| 5 | ⏱ Applications gather | — | `delay: 10`, `delayMode: "working-days"` | — | 1 |
| 6 | ▭ Screen applications | Talent Acquisition | `tri(2, 3, 5)` | 3.33 | 1 |
| 7 | ▭ Shortlist & schedule interviews | Talent Acquisition | `tri(0.75, 1, 2)` | 1.25 | **1.615** |
| 8 | ▭ Interview panel | Talent Acquisition | `tri(1.5, 2, 3)` | 2.17 | **1.615** |
| 9 | ◇ Offer made? | — | 72% / **28% → (7)** | — | — |
| 10 | ▭ Prepare offer | HR Operations | `tri(0.5, 0.75, 1.25)` | 0.83 | **1.163** |
| 11 | ▭ Negotiate offer | Talent Acquisition | `tri(0.5, 1, 2.5)`, **`requiredSkills: ["Offer Negotiation"]`** | 1.33 | **1.163** |
| 12 | ◇ Offer accepted? | — | 86% / **14% → (7)** | — | — |
| 13 | ▭ **Compliance & vetting review** | HR Operations | **`tri(1, 3, 9)`**, `waitTime: fixed(40)`, **`requiredSkills: ["Compliance Accreditation"]`** | **4.33** | 1 |
| 14 | ⬦ Parallel split | — | — | — | — |
| 15 | ▭ Create payroll record | Payroll | `fixed(0.4)`, `requiredSkills: ["Payroll Administration"]` | 0.40 | 1 |
| 16 | ▭ Provision laptop & accounts | IT Provisioning | `tri(0.5, 0.75, 1.5)`, `requiredSkills: ["Device Provisioning"]` (both hold it) | 0.92 | 1 |
| 17 | ▭ Prepare onboarding pack | Onboarding Services | `fixed(0.6)`, `requiredSkills: ["Onboarding Administration"]` (all three hold it) | 0.60 | 1 |
| 18 | ⬦ Parallel join | — | — | — | — |
| 19 | ⏱ Wait for start date | — | `delay: 15`, `delayMode: "working-days"` | — | 1 |
| 20 | ▭ Day-one induction | Onboarding Services | `fixed(3.0)` | 3.00 | 1 |
| 21 | ⬤ Onboarded | — | — | — | — |

**Rework**: `P(return to shortlist) = 0.28 + 0.72 × 0.14 = 0.3808`, so shortlist and interview run
**1.615** times per case and the offer steps **1.163** times. Both loop-back probabilities are named
parameters the tornado will test.

**Why step 13 is the constraint and step 17 is not.** Both are HR-side admin. One is restricted to
2 of 4 people and takes 4.33 h; the other is unrestricted and takes 0.6 h. Step 17 is the *control
case* — a skill-adjacent task that is provably **not** a bottleneck, which is what stops the example
proving its point by construction.

### 3.2 ArchiMate — *HR operating model — who can do what*

Not a study root. Present so the learner presses **✨ Fill from ArchiMate** and watches the matrix
populate. This is what makes Gap B a blocker.

**Business Actors** — must match team member names exactly (modulo case/whitespace):

Priya Raman · Tom Fletcher · Aisha Khan · Ravi Menon · Ellie Shaw · Jack Oduya · Nadia Rahman ·
Chris Bell *(Talent Acquisition, 8)* — Grace Oduya · Ben Carter · **Marta Silva** · Ruth Ellis
*(HR Operations, 4)* — Sam Doyle · Nina Petrov *(IT Provisioning, 2)* — Jo Mensah *(Payroll, 1)* —
Leah Nowak · Femi Adeyemi · Dan Russo *(Onboarding Services, 3)* = **18 named people**, plus
**Dev Nair (Contractor)**, on no team, deliberately (§3.3).

**Every team member appears here with a role.** An actor drawn with no role holds nothing and lands
in the warnings (T3530), and a member absent from the diagram lands in *"On a team, not in the
diagram"* — either would add noise to the report that assertion 16 pins, and the two intended
mismatches are the ones that should be visible.

**Business Roles.** Leaves are skills; a role that aggregates others is a bundle:

- Leaves: `Sourcing`, `Offer Negotiation`, `Compliance Accreditation`, `Payroll Administration`,
  `Onboarding Administration`, `Device Provisioning`
- `Senior Recruiter` —aggregation→ { Sourcing, Offer Negotiation }
- `Accredited Vetting Officer` —aggregation→ { Onboarding Administration, **Compliance Accreditation** }

**Actor → Role** (*the person holds the skill*):

| Actor | Assigned to | Leaf skills |
|---|---|---|
| Priya Raman, Aisha Khan, Ravi Menon | Senior Recruiter | Sourcing, **Offer Negotiation** |
| Tom Fletcher, Ellie Shaw, Jack Oduya, Nadia Rahman, Chris Bell | Sourcing | Sourcing |
| **Grace Oduya, Ruth Ellis** | Accredited Vetting Officer | Onboarding Admin, **Compliance Accreditation** |
| Ben Carter, **Marta Silva** | Onboarding Administration | Onboarding Administration |
| Sam Doyle, Nina Petrov | Device Provisioning | Device Provisioning |
| Jo Mensah | Payroll Administration | Payroll Administration |
| Leah Nowak, Femi Adeyemi, Dan Russo | Onboarding Administration | Onboarding Administration |
| **Dev Nair (Contractor)** | Accredited Vetting Officer | Onboarding Admin, Compliance Accreditation |

→ **Compliance Accreditation is held by exactly 2 people. That is the whole example.**

**Role → Business Process** (*the work requires the skill*) — labels must match the BPMN task labels:

`Offer Negotiation → Negotiate offer` · `Compliance Accreditation → Compliance & vetting review` ·
`Payroll Administration → Create payroll record` · `Device Provisioning → Provision laptop & accounts` ·
`Onboarding Administration → Prepare onboarding pack` · `Onboarding Administration → Exit interview` ⟵ §3.3

**Five of these six fill a real task.** Three are constraints-in-waiting held by 2, 3 and 1 people;
two (`Device Provisioning`, `Onboarding Administration`) are held by **everyone on their team**, so
they are control cases — a skill requirement that provably changes nothing, which is what stops the
example proving its point by construction.

`Accredited Vetting Officer` earns its keep: defined once, assigned wholesale, expanded to two leaves
by the fill.

### 3.3 The two deliberate non-matches

An example whose unmatched report comes back empty teaches the learner to ignore it — and that report
is the headline of the fill panel. So exactly two honest mismatches, both called out in the
description so they read as intentional:

1. **Dev Nair (Contractor)** — fully modelled, and accredited, but on no team → *"In the diagram,
   not on any team"*. He is given a role deliberately: an actor with NO role would also trip the
   'holds nothing' warning (T3530), and one honest report is worth more than two. He also makes a
   quiet point — the architecture says a third accredited person exists; the team library says he is
   not available.
2. **Exit interview** — a business process with a role assigned and no matching BPMN task → *"In the
   diagram, matching no task"*.

---

## 4. The library

### 4.1 Calendars and the epoch

| Calendar | Pattern | Used by |
|---|---|---|
| **HR business hours** | Mon–Fri 09:00–12:30, 13:30–17:00 (7.5 h/day) | Hiring Manager, Talent Acquisition, HR Operations, Onboarding Services, Payroll, and the arrival source |
| **IT service desk** | Mon–Fri 08:00–18:00 | IT Provisioning |

**`epochDate: "2027-07-05"`** — verified a Monday, which is what the weekly pattern anchors t=0 to.
Without it, `exceptions` are ignored entirely and `calendarWarnings` says so.

### 4.2 Exceptions — and where they land in the run

`horizon: 8760` from 2027-07-05 runs to **2028-07-04**:

| Date | | Exception | Position in the run |
|---|---|---|---|
| 2027-10-04 | Mon | Labour Day | 25% |
| 2027-12-23 | Thu | Half day, 09:00–12:30 only | 47% |
| 2027-12-24 → 2028-01-03 | | **Christmas shutdown** (closed) | **47% → 50%** |
| 2028-01-26 | Wed | Australia Day | 56% |
| 2028-04-14 | Fri | Good Friday | 78% |
| 2028-04-17 | Mon | Easter Monday | 79% |
| 2028-04-25 | Tue | Anzac Day | 81% |
| 2028-06-12 | Mon | King's Birthday | 94% |

Eight exceptions spread across the measurement window, with the shutdown squarely in the middle. The
half-day is there because empty `intervals` (closed) is the easy case and a non-empty one is the
interesting one.

### 4.3 Teams and people

| Team | Capacity | £/h | Calendar | Utilisation | Named people |
|---|---|---|---|---|---|
| Hiring Manager | 6 | 95 | HR business hours | **18%** | *(none — a counted pool)* |
| Talent Acquisition | 8 | 65 | HR business hours | **59%** | Priya, Tom, Aisha, Ravi, Ellie, Jack, Nadia, Chris |
| **HR Operations** | 4 | 45 | HR business hours | **56%** | Grace, Ben, **Marta**, Ruth |
| Onboarding Services | 3 | 42 | HR business hours | **51%** | Leah, Femi, Dan |
| IT Provisioning | 2 | 55 | IT service desk | **20%** | Sam, Nina |
| Payroll | 1 | 50 | HR business hours | **17%** | Jo |

**No team is above 59%.** That is the point: nothing in the utilisation panel looks like a problem.
Mixing one counted pool (Hiring Manager) with five named teams is deliberate — you only name people
where naming *does* something.

### 4.4 ⚠ The authoring trap (Gap F)

**Every task carrying `requiredSkills` must sit on a team that names its people.** A skill required
from a memberless pool is granted to anyone, silently. The design satisfies this — all four skilled
tasks are on Talent Acquisition, HR Operations or Payroll, never on Hiring Manager — but it is one
careless edit from being untrue.

### 4.5 Business-case inputs (on the study)

```json
{ "implementationCost": 4500, "annualVolume": 790, "costOfDelayPerHour": 120 }
```

- **£4,500** — accredited vetting-officer training for one person, plus their time.
- **790** — hires/year, consistent with `exponential(2.35)` over ~1,850 open hours.
- **£120/h** — the business cost of a role standing empty. **Not** staff cost; the doing line carries
  that. This is an assumption the example's own description must flag, because the payback month is
  directly proportional to it.

The alternative being costed — **two more HR administrators** at ~£88,000 loaded each — is scenario 3,
and is **~39× the training cost** for a worse answer.

---

## 5. Scenarios

Run config for all: `clockUnit: "hour"`, `horizon: 8760`, `warmUp: 2160` (90 days ≈ 2 flow times),
`replications: 10`, `seed: 20270705`, `collectQueues: true`. Measurement window ≈ 275 days ≈ **590
completed cases per replication**.

| # | Scenario | Overrides | Expected outcome |
|---|---|---|---|
| 1 | **As-is — today's team** *(baseline)* | *(none)* | HR Operations 56%, the two accredited officers **92%**, ~**1.9 working days** of queue on every hire |
| 2 | **More desks, no more people** | `teams["HR Operations"].capacity = 6` | **Bit-identical to the baseline.** Capacity cannot exceed the 4 named members, so nothing changes at all |
| 3 | **Hire two more administrators** | `capacity = 6` **+** two new members with `skills: []` | Helps *Prepare offer* only. **Inside the noise.** ~£176k/yr for no measurable difference |
| 4 | **Train a third checker** | `members: [{ name: "Marta Silva", skills: [ …, "Compliance Accreditation" ] }]`, capacity unchanged | Accredited pool 2→3: **92% → 61%**, queue **1.9 → 0.1 days**. **Real.** £4,500 |
| 5 | **Train a third checker + triage critical roles** | scenario 4 **+** `discipline: "priority"` | Pooled p95 barely moves; the *critical* segment improves sharply |

Scenarios 2, 3 and 4 all need **Gap E**.

---

## 6. Acceptance — the example as an end-to-end test

The point of designing the figures in advance is that the example becomes a **regression test for the
whole simulator**: the calendar, the pool, the skills model, the significance test, the knee
detector, the tornado and the business case, all asserted together on one realistic model. Nothing
else in the suite exercises them in combination.

Three tiers, because they fail for different reasons and want different responses.

### Tier 0 — design invariants, checkable from the package alone (no run)

Cheap, fast, and they catch an edit to the example that quietly destroys its argument.

| Assertion | Expected |
|---|---|
| Exactly **2** members hold `Compliance Accreditation` | `=== 2` |
| `Compliance & vetting review` carries `requiredSkills: ["Compliance Accreditation"]` | present |
| Every task with `requiredSkills` sits on a team with ≥1 named member | all |
| Analytic team utilisation, every team | **< 65%** |
| Analytic utilisation of the accredited pair | **> 88%** |
| `epochDate` is a Monday on every calendar | all |
| ≥ 6 calendar exceptions fall between 20% and 95% of the horizon | yes |

The utilisation ones are the arithmetic of §4.3 recomputed from the package — *not* a run. If someone
raises a cycle time and quietly makes a second team the bottleneck, this fails immediately and says so.

### Tier 1 — the argument (relational, must never break)

These are what the example *claims*. If one fails, either the engine regressed or the example has
stopped teaching what it says on the tin. **This is the most important guard in the plan.**

| # | Assertion | Why it matters |
|---|---|---|
| 1 | Baseline: the busiest **team** is < 65%, yet mean queue wait per case > 1 working day | The whole premise — a healthy-looking team with a real queue |
| 2 | Baseline `bottlenecks[0]` is **HR Operations** | The bottleneck report finds it despite the low utilisation |
| 3 | Scenario 2 is **bit-identical** to the baseline — same completed count, same p50, same p95 | Capacity is not people. An exact assertion, and the cleanest possible statement of the mechanic |
| 4 | Scenario 3 vs baseline: `compareSamples` → **does not clear the band** | Hiring two administrators is not the answer |
| 5 | Scenario 4 vs baseline: `compareSamples` → **clears the band** | Training one person is |
| 6 | Scenario 4's **queue wait per case** < 25% of the baseline's | The improvement is in the queue, not a flow-time artefact |
| 7 | Scenario 4 costs less than scenario 3 **and** performs better | The business case's conclusion, asserted directly |
| 8 | Sweeping `HR Operations` capacity **4 → 10** on the baseline: every point identical, `findKnee` → **null** | The knee detector refuses to invent an elbow. Also proves 3 across a range |
| 9 | Sweeping **arrival** 3.2 → 1.6 on the baseline: knee in **2.1 – 2.7** open-hours | Saturation is at 2.17 (100%) / 2.55 (85%) — the knee sits between |
| 10 | Same sweep on scenario 4: knee in **1.3 – 1.8** open-hours | Saturation moves to 1.44 / 1.70 — **+50% volume for £4,500** |
| 11 | Tornado: `HR Operations` capacity → **`no-difference`** | The headline. A capacity bar sitting flat next to a moving arrival bar *is* the example |
| 12 | Tornado: `Payroll` capacity → **`not-testable`** | Capacity 1 cannot go ±20%. Untested-vs-unimportant, landing on a real model |
| 13 | Tornado: the top mover is the **arrival rate** or the **compliance cycle time** | Ranking sanity |
| 14 | Tornado returns **≥ 1** of each of the three verdicts | Both halves of the chart non-empty by construction |
| 15 | A case spanning the Christmas shutdown takes measurably longer than one that does not | The calendar exceptions are actually applied |
| 16 | ArchiMate fill: **18 members**, **5 tasks**, exactly **1** unmatched actor, exactly **1** unmatched work item | Silent non-matching is this feature's failure mode |

Assertions 9 and 10 use **ranges derived from queueing theory**, not observed values — they are a
genuine prediction the model must meet, which is what makes them a test rather than a snapshot.

### Tier 2 — golden figures (exact, seed-pinned)

A change-detector, not a correctness argument. **Captured from the first green run and committed —
never hand-written**, because a predicted figure presented as an expectation is a fabrication, and
the discrete-event mean is not something anyone can derive to three significant figures.

Pinned per scenario at `seed: 20270705`: `completed.mean`, `flowTime.p50/p95`, `queueWait.mean`,
`costPerCase.mean`, and `perTeam[*].utilization.mean`.

Any change to any of them is a **real behavioural change in the engine**, and the review question is
"was that intended?" — not "adjust the number until it passes". The commit that moves a golden must
say why in its message.

> **Why goldens and Tier 1 both.** Tier 1 survives an intentional engine change and would keep
> passing through a slow drift; Tier 2 catches the drift but goes red on every intentional change.
> Neither alone is enough. This is the same two-tier shape as the existing regression bar for the
> engine phases.

### What to sweep, precisely

| Sweep | Lever | Range | Steps | Objective | Expected |
|---|---|---|---|---|---|
| **A** | `teamCapacity: HR Operations` | 4 → 10 | 7 | near-worst flow | **Perfectly flat, no knee** |
| **B** | `sourceArrival: Vacancy approved` | 3.2 → 1.6 | 9 | near-worst flow | Knee at **2.1 – 2.7** |
| **C** | Sweep B on scenario 4 | 3.2 → 1.6 | 9 | near-worst flow | Knee at **1.3 – 1.8** |
| **D** | `taskCycleTime: Compliance & vetting review` | 1 → 8 | 8 | near-worst flow | Knee where the pair passes ~85%, ≈ **4.4 h** |

Sweep A is run **from 4, not from 1** — below 4 the capacity genuinely binds and the curve would bend
for the wrong reason. Sweep B is the one that answers the question a business actually asks: *at what
hiring volume does our current accreditation cover fall over?*

Cost check: 9 points × 8,760 h × 10 reps = **788k** of the 5M `maxWork` budget. Comfortable.

### The tornado, precisely

20 parameters (6 teams + 1 source + 13 tasks) → **41 runs**, 3.59M of the 5M `maxWork` budget — but
`maxSweepSteps: 24` caps it at 11 parameters and **drops 9** (Gap G). The example therefore needs
Gap G fixed, or assertion 11 is a coin toss depending on enumeration order.

---

## 7. The learner's walkthrough

1. **Adopt** from the gallery. Two diagrams arrive: the process, and the HR operating model.
2. **Open the ArchiMate diagram.** Nobody typed a skills matrix — this is what the Business Architect
   already had.
3. **Team library → ✨ Fill from ArchiMate.** The preview says what it *would* fill first. Fill it:
   18 members, 5 tasks, and two things that did not match, both named. Read the unmatched report.
4. **Run the baseline.** Every team under 60%. Nothing looks wrong. And yet the p95 flow time is far
   worse than the p50.
5. **Look at the queue-wait line.** 1.9 working days per hire, all of it at one step.
6. **"Give them more desks."** Run scenario 2. The result is *identical to the baseline* — the model
   will not pretend a desk is a person.
7. **"Then hire two more."** Run scenario 3. £176k/year, and the verdict is **inside the noise**.
8. **Sweep the headcount, 4 → 10.** Flat. **No knee.** The model is telling you it is the wrong lever.
9. **Train one person instead.** Scenario 4: the verdict is **real**, and the queue collapses to
   0.1 days.
10. **Sweep the arrival rate on both.** The knee moves from ~2.4 to ~1.5 open-hours: the same team can
    now absorb **50% more hiring** — for £4,500.
11. **Tornado.** The arrival rate and the vetting time are load-bearing. HR Operations' *headcount*
    makes **no measurable difference** — the bar the whole example has been arguing towards. Payroll
    cannot be tested at all, and says so.
12. **Business case.** £4,500 against £176,000, with a payback month on one and none on the other.
    Export to `.docx`.
13. **Watch the calendar.** Replay across late December: the process stops for the shutdown, and the
    "10 working days" timer steps over it.

Steps 6 → 9 are the spine.

---

## 8. Feature coverage

| Feature | Phase | Where | Asserted by |
|---|---|---|---|
| Named baseline + run trend | 1 | Scenario 1 held across runs | — |
| Suggested next steps | 1 | After step 9 (≥ 3 runs) | — |
| Business case + payback | 2 | Step 12 | T1.7 |
| Queue wait vs process wait | 2 | 1.9 d queue against 30 d of authored waits | T1.1, T1.6 |
| Rework / first-pass yield | 2 | 28% and 14% loop-backs, 1.615 passes | T0 |
| Significance verdict | 3 | Steps 7 and 9 | **T1.4, T1.5** |
| Warm-up | 3 | 2,160 h; Welch should agree | — |
| Sweep + knee | 4 | Steps 8 and 10 | **T1.8, T1.9, T1.10** |
| Priority discipline | 5 | Scenario 5 | — |
| Per-segment service level | 5 | Scenario 5 | — |
| Holidays and shutdowns | 5 | §4.2, step 13 | T1.15 |
| Batching and cut-offs | 5 | Now authorable (Gap D closed), but still not used by this example | T3585–T3588 |
| Twin validation | 6 | ❌ belongs to `mined-twin-validated` | — |
| Skills and named people | 7 | The spine | T0, **T1.3** |
| Skills from ArchiMate | 7 | Step 3 | **T1.16** |
| Least-flexible-first | 7 | Grace and Ruth kept for what only they can do | — |
| Tornado, all three verdicts | 8 | Step 11 | **T1.11–T1.14** |

**Fifteen of seventeen**, with eleven under assertion. The two omissions are honest: one is blocked
by Gap D, the other belongs to a different example.

---

## 9. Build order

| Slice | Work | Done when |
|---|---|---|
| ~~1~~ | ✅ **Gap E** — `TeamOverride.members` (merge by name), `NodeOverride.requiredSkills`, `NODE_KEYS` | **Done** — T3563–T3569 |
| ~~2~~ | ✅ **Gap G** — `maxSensitivityRuns`, separate from `maxSweepSteps` | **Done** — T3570–T3573 |
| ~~3~~ | ✅ **Gaps A + C** — `members`/`skillsSource` and `businessCase` in the package | **Done** — T3574–T3577 |
| ~~4~~ | ✅ **Gap B** — companion diagrams, found via `skillsSource.diagramId` | **Done** — T3578–T3580 |
| ~~5~~ | ✅ **Gap F** — readiness errors | **Done** — T3581–T3584 |
| ~~5b~~ | ✅ **Gap D** — `ElementSimParams.batch` + assemble mapping | **Done** — T3585–T3588 |
| **6** | **Author both diagrams** through the editor, not by hand-writing JSON | Both render; the fill preview reports 18 / 5 with exactly the two intended non-matches |
| **7** | **Configure** calendars, exceptions, teams, people, five scenarios, business-case inputs | Baseline runs; §4.3 utilisations within ±5pp of the analytic figures |
| **8** | **Capture** via *Save as example*, merge by slug, add to **T3369** and the **T3561** level map | `exampleSeeds.test.ts` green |
| **9** | **Tier 0 + Tier 1 acceptance tests**, numbered from **T3563** | Green |
| **10** | **Capture Tier 2 goldens** from the first green run and commit them | Green, and re-running reproduces them exactly |
| **11** | Seed locally, walk §7 end to end, then seed prod | The walkthrough works as written |

**Slices 1–5b are complete.** Authoring (slice 6 onward) is now unblocked — which was the point of
doing them first: building the example and *then* discovering the package could not carry it was the
expensive failure here.

---

## 10. Risks and open decisions

1. ~~**Gap E's merge semantics.**~~ **Resolved:** matched by normalised name, so a typo retrains the
   person meant; a genuinely new name is a deliberate hire and is added. See §2.
2. **The queue is 6% of the flow time.** 1.9 days of queue against ~32 days end to end. Mean flow
   time is the wrong headline; the assertions use queue wait and p95. If a future reviewer wants the
   flow time itself to move dramatically, the authored waits (10 + 15 working days) would have to
   shrink — at the cost of realism. **Recommendation: keep them, and let the business case do its
   job.** This is the situation Phase 2's wait split was built for.
3. **Tier 2 goldens will go red on any intentional engine change.** That is the design. The risk is
   somebody "fixing" them without reading why. The commit message discipline in §6 is the mitigation.
4. **Model size.** 21 elements, six lanes — the largest example in the catalog. Justified, but it
   must still be readable in one screenshot. If it will not fit, simplify the parallel branch
   (14–18), never the spine.
5. **£120/h cost of delay is an assumption** and the payback month is proportional to it. The
   description must say so in its own words.
6. **Australian public holidays date this to 2027–28.** The `epochDate` pins it there anyway.
   **Recommendation: keep the real dates** — a holiday calendar that looks real is the point.
7. ~~**Gap D leaves batching untaught catalog-wide.**~~ **Closed:** `ElementSimParams.batch` and the
   assemble mapping are in, so the parent plan's `batch-and-cutoff` example is now buildable. Still
   missing a Properties-panel field and a BPSim mapping (BPSim has no batching concept, so it would
   need the same `dgx` extension namespace the skills use) — neither blocks anything.
