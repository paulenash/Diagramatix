# Diagramatix Miner — Process-Mining Standards Gap Analysis

*Assessed 2026-07-06 against the supplied summary of process-mining standards (IEEE XES, OCEL, CSV event logs, BPMN execution logs, OpenTelemetry) and the proposed "event log as core data model" schema.*

This document records **what Diagramatix Miner covers today**, **where it diverges from the standards**, and the **remediation** being taken. Items marked ✅ **DONE** in the change log at the bottom were implemented in the same work as this analysis.

---

## 1. Executive summary

Diagramatix Miner is a well-built **single-object, state-centric, CSV process miner** — arguably *ahead* of the field on state-machine conformance, but historically *behind* the standards on interoperability (no XES/OCEL) and on the "log as core data model" ambition.

The original ingest recognised exactly **five** column roles — `caseId`, `activity`, `timestamp`, `state`, `resource` — of which **four were mandatory**, and accepted **CSV only**. After import it compressed events to *variants* (state + activity sequences) and **discarded the raw event log**; performance, teams and the working calendar were re-derived at that moment into aggregates, never stored as events.

Three changes close the most valuable gaps:

- **A — Accept standard logs** (state optional; Activity→State mapping table when absent).
- **B — Governance IDs on events** (Control/Risk/Policy IDs → mined control operating-effectiveness, closing the loop with the shipped GRC feature).
- **C — XES / OCEL import & export** (interoperability with ProM, Celonis, Disco, Apromore, Signavio PI).

---

## 2. Standards coverage

| Standard | Purpose | Coverage | Notes |
|---|---|---|---|
| **IEEE XES (1849)** | The industry standard | 🟡→🟢 Partial, now with import/export | Ingested the 3 mandatory XES attributes (case, activity, timestamp) but only as CSV, plus a **non-standard required `state`**. Of the typical additional attributes only **Resource** was carried; role/cost/lifecycle/department were dropped. **C** adds `.xes` import + export. |
| **OCEL** | Multi-object process mining | 🔴→🟡 Single-object projection | No multi-object model; `entityType` was recognised but discarded. **C** adds OCEL 2.0 import (flattened to a chosen object type as the case) + export. True multi-object analytics remain a larger, separate effort. |
| **CSV event log** | Simple interchange | 🟢 Covered | Always the primary format. Previously required a 4th `state` column; **A** makes the classic 3-column (Case, Activity, Timestamp) log import directly. |
| **BPMN execution logs** | Workflow execution | ⚪ Different direction | Diagramatix Miner *discovers* BPMN from a log rather than consuming a vendor execution log — not a gap so much as an inversion. |
| **OpenTelemetry** | IT / distributed services | 🔴 Absent | No OTel span ingestion. Lowest priority for a BPM tool; revisit if mining IT/service traces becomes a goal. |

---

## 3. "Core data-model" schema coverage

Assessed against the proposed comprehensive event record.

| Group | Fields | Status |
|---|---|---|
| **Core execution** | Event ID, Case ID, Parent Case, Activity, BPMN Element ID, Event Type (lifecycle), Timestamp, Duration, Sequence # | 🟡 Case / Activity / Timestamp / State. No Event ID, Parent/sub-case, explicit BPMN-element binding (matched **by label**), lifecycle Event Type, or sequence #. Duration **derived** (sojourn-to-next-event), not ingested. |
| **Participants** | Resource, Role, Team, Department, Organisation, External | 🟡 A single free-text **Resource** only. Role / Team / Dept / Org / External absent. |
| **Business objects** | Customer, Order, Invoice, Product, Asset, Contract, Document (OCEL) | 🔴→🟡 Was absent. **C** ingests OCEL by projecting one object type as the case. |
| **Systems** | Application, API, Database, Service, Bot, AI Agent | 🔴 Absent. |
| **Governance** | Risk ID, Control ID, Policy ID, Procedure, Regulatory, Approval, Outcome | 🔴→🟢 Was absent from the log; GRC lived in a separate catalog and effectiveness was inferred only indirectly from conformance deviations. **B** ingests Control / Risk / Policy IDs on events and computes control operating-effectiveness **directly** from them. |
| **Performance** | Waiting, Processing, Queue, SLA, Cost, Value-Added | 🟡 Sojourn / inter-arrival **derived**; no cost, SLA, queue, or value-added. |
| **Simulation** | Sim-vs-actual, Seed, Scenario, Run ID, Utilisation, Queue length | 🟡 All **derived** at calibration, none ingested. |
| **AI** | Agent, Model, Prompt ID, Confidence, Human Override, Explanation | 🔴 Absent from the event model (AI is a discovery helper over variants only). |

---

## 4. Architectural note — "log as core data model"

The single largest divergence from the summary's recommendation is that Diagramatix Miner **does not persist an event log** — it persists *variants* + *aggregates*. The variant-compression step discards per-event timestamps, resources and (previously) everything else. This is efficient and bounded, but forecloses later analytics over cost / role / object / systems data.

Changes **A–C** deliberately work **with** this architecture rather than against it: governance effectiveness (B) is aggregated at import into a stored `governance` summary, and XES/OCEL export (C) reconstructs traces from variants (variant-level fidelity, synthetic timestamps). A future "persist raw events" decision would be the prerequisite for the remaining 🟡/🔴 tiers (cost, systems, AI, full OCEL multi-object).

---

## 5. Remediation being implemented now

### A. Optional state → accept standard logs, with an Activity→State mapping table
- `state` becomes **optional**. A classic 3-column log (Case, Activity, Timestamp) imports directly.
- When no state column is present, the console offers an **Activity → State mapping table**: every distinct activity is listed and pre-filled with a same-named state, which the user can edit. That table completes the state picture the rest of the miner (discovery, conformance, the generated **State Machine**) depends on.
- With the table left at defaults, each activity maps to a same-named state — equivalent to classic activity-only mining.

### B. Governance IDs on events → close the loop with GRC + control-effectiveness
- New optional mapping roles: **Control ID**, **Risk ID**, **Policy ID**.
- At import these are aggregated into a stored **governance** summary: per control code — *applied* cases (an event carried the control), *expected* cases (the control's governed activities occurred), *bypassed* = expected − applied, and an **effectiveness %**.
- The GRC effectiveness endpoint now surfaces this **log-based** effectiveness (Control-ID-driven) alongside the existing conformance-deviation-driven figure — proving a control operated from the process's own execution data.

### C. XES / OCEL import & export
- **Import:** `.xes` (IEEE 1849 XML) and OCEL 2.0 `.json` in addition to CSV/TSV. XES maps the standard extensions (concept:name, time:timestamp, org:resource, lifecycle:transition). OCEL flattens a chosen object type into the case.
- **Export:** any run exports to `.xes` and OCEL `.json` (variant-level fidelity), for round-trips with ProM / Celonis / Disco / Apromore / Signavio Process Intelligence.

---

## 6. Deliberately **not** done now (recorded for later)

- Persisting the raw event log as a first-class data model (prerequisite for the tiers below).
- Cost, SLA, queue-time, value-added performance attributes.
- Distinct Role / Team / Department / Organisation participant fields.
- Systems (Application / API / DB / Service / Bot) attributes.
- AI attributes on events (Agent / Model / Prompt / Confidence / Override / Explanation).
- Lifecycle start/complete transition pairs (durations remain sojourn-derived).
- True OCEL multi-object analytics (current support is a single-object projection).
- OpenTelemetry span ingestion.

---

## 7. Change log

| Item | Status | Notes |
|---|---|---|
| A — Optional state + Activity→State table | ✅ **DONE** (2026-07-06) | `state` optional in `LogMapping`; `buildEventLog` derives state from the `activityState` table (defaults to activity name); console shows an Activity→State table when no state column is mapped. Import route requires only case/activity/timestamp. New **IT Service Desk** mining example ships an activity-only log (no state column). Tests **T0639–T0640**. |
| B — Governance IDs on events + mined control-effectiveness | ✅ **DONE** (2026-07-06) | Optional Control/Risk/Policy ID roles; `computeGovernance` aggregates per-control applied/expected/bypassed/effectiveness at import into a new `ProcessMiningRun.governance` JSON column; `logControlEffectiveness` + the GRC effectiveness endpoint surface it (preferred over the deviation-mapped figure), and the RCM editor labels the evidence source. Example package/adopt/capture carry `governance`. Tests **T0641–T0642**. |
| C — XES / OCEL import & export | ✅ **DONE** (2026-07-06) | `app/lib/mining/formats/{xes,ocel}.ts` (pure, dependency-free); console accepts `.xes` + OCEL `.json` (parsed to the same table as CSV); export route `…/runs/[runId]/export?format=xes|ocel` + XES/OCEL links on each run. Variant-level export fidelity. Tests **T0643–T0646**. |

### Verification
- `npm run build` — clean (Next 16 / TypeScript). Full Vitest suite **770 green** (115 files), incl. the 8 new tests T0639–T0646.
- Schema synced (`prisma db push`) — `ProcessMiningRun.governance Json?` added.
- Example data regenerated: AP (3 periods), O2C, and the new **Service Desk** activity-only example (168 cases, 8 variants).

---

## 8. September 2026 update — what the extensions programme closed

*Added 2026-09-10, product 2.9. This document was written in July against the module as it
then stood: an importer, a discoverer and a conformance check. An eleven-phase extensions
programme has since changed several of the judgements above. The standards rows (§2) are
unchanged — no new interchange format was added — but the **data-model** rows (§3) and the
**deliberately not done** list (§6) have moved, and the rows below supersede them.*

**The constraint everything follows from, stated because it explains the shape of the rest.**
The importer is the only moment the truth exists. `buildEventLog` produces traces, the
aggregates are computed, and the raw events are then gone — so a field not captured at import
is unavailable to that run **forever**, not "until we add a recompute". Every row below is
therefore about what is now *stored*, not about what could later be derived.

| §3 row | July status | September status |
|---|---|---|
| **Participants** — Resource / Role / Team / Dept | 🟡 a single free-text Resource, kept only as each activity's *dominant* resource | 🟢 **per-event resource vectors are stored**, so the hand-off map is measured rather than inferred. The distinct Role/Team/Dept *fields* are still absent — one column still carries whoever did it — but the analysis over it is now exact, and where it cannot be it is **labelled `approximate`** with the number of multi-team activities that make it so. |
| **Performance** — Waiting, Processing, Queue, SLA, Cost, VA | 🟡 sojourn / inter-arrival derived only | 🟡→🟢 **SLA is now a first-class input** (`kpiConfig`), driving on-time/late outcomes and the late-rate alarm. Per-event durations are stored, so the **between-steps decomposition** (which transition accounts for the elapsed time) is measured. Cost, queue-time and value-added remain absent. |
| **Business objects** | 🟡 OCEL projected to one object type | 🟡 unchanged as a data model — but **arbitrary kept columns** (Region, Channel, …) are now stored per case as slicing dimensions, with retention **opt-in** per column (keep / hash / drop). That covers most of what teams wanted business-object fields *for*, without the object model. |
| **Simulation** — sim-vs-actual, run id, utilisation | 🟡 all derived at calibration | 🟢 **out-of-sample validation exists**: a share of the most recent cases can be **held back** at import so the twin is tested on data it was never fitted to, and a twin whose log has moved on is marked **stale** with the date rather than silently re-calibrated. |
| **Core execution** — Event ID, lifecycle, sequence # | 🟡 | 🟡 unchanged. |
| **Systems**, **AI attributes** | 🔴 | 🔴 unchanged. |

**Also now shipped, and not anticipated by §6 because they are analysis rather than schema:**

- **Slicing with declared exactness.** A run filters by date, team or any kept column, and every
  figure states whether it is `filtered`, `filtered · estimated` (a sampled run), or
  `not filtered` because the run cannot support it — never averaged into a plausible number.
- **Input flexibility.** `.xlsx` read directly; **wide "one row per case"** exports detected and
  expanded; **several systems merged into one lifecycle** with id unification by shared key or
  crosswalk, and the **cross-system hand-off measured at the join** — a wait neither export
  contains on its own. A merge with no overlapping cases is **refused**.
- **Deviation → evidence.** A conformance violation resolves to the actual case ids, each with
  its own timeline, and states how many of the affected cases it can name.
- **Hand-offs, ping-pong and rework**, measured from the stored resource vectors — including the
  correction that the inherited task-mining ping-pong detector reads app names out of UI labels
  and returns a confident **zero** on a business log, so a team-level replacement was written.
- **A run series.** `ProcessMiningRun.parentRunId` (the programme's only real column, product
  2.8 → 2.9) links snapshots into a history, giving period comparison — which **refuses** two
  runs whose activity vocabularies barely overlap — and threshold alerting, led by *the source
  stopped sending*.
- **Ranked next steps**, computed deterministically, with the AI narrating findings it is handed
  and never seeing the run.

**Still open, recorded rather than rediscovered.** No email path for alerts. `task-mining` is
gated on the artefact rather than the tab. New REST/DB connectors were **declined** with reasons
(item 10 of the source review). And a run series is ordered by **when each run was mined**, not
by the period its log covers — right for a live source, wrong for anyone back-filling history,
and not yet fixed.

*Cross-reference: `diagramatix/audit/Miner-Extensions-Plan.md` is the phase-by-phase burn-down
with the decisions and refusals on their face; the competitor-facing version of the same story is
§3 of `diagramatix-vs-signavio-aris-primebpm-2026-09.md`.*
