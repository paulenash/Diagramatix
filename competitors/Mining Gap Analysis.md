# DiagramatixMINER — Process-Mining Standards Gap Analysis

*Assessed 2026-07-06 against the supplied summary of process-mining standards (IEEE XES, OCEL, CSV event logs, BPMN execution logs, OpenTelemetry) and the proposed "event log as core data model" schema.*

This document records **what DiagramatixMINER covers today**, **where it diverges from the standards**, and the **remediation** being taken. Items marked ✅ **DONE** in the change log at the bottom were implemented in the same work as this analysis.

---

## 1. Executive summary

DiagramatixMINER is a well-built **single-object, state-centric, CSV process miner** — arguably *ahead* of the field on state-machine conformance, but historically *behind* the standards on interoperability (no XES/OCEL) and on the "log as core data model" ambition.

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
| **BPMN execution logs** | Workflow execution | ⚪ Different direction | DiagramatixMINER *discovers* BPMN from a log rather than consuming a vendor execution log — not a gap so much as an inversion. |
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

The single largest divergence from the summary's recommendation is that DiagramatixMINER **does not persist an event log** — it persists *variants* + *aggregates*. The variant-compression step discards per-event timestamps, resources and (previously) everything else. This is efficient and bounded, but forecloses later analytics over cost / role / object / systems data.

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
