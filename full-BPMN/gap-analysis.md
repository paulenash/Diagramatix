# Full BPMN 2.0 Coverage — Gap Analysis & Implementation Plan

*Audit date: 2026-08-03. Basis: Diagramatix codebase (`app/lib/diagram/types.ts`, `symbols/definitions.ts`, `components/canvas/SymbolRenderer.tsx`, `bpmn/importBpmnXml.ts`, `xmlExport.ts`).*

**Goal.** Reach a defensible **"Full BPMN 2.0 (Descriptive + Analytic conformance)"** claim — the orchestration modelling palette that Signavio/ARIS mean by "full BPMN 2.0" — then, optionally, the two extra diagram types for an unqualified claim.

---

## 1. Already covered (Descriptive + most of Analytic)

- **Tasks** — all 7 types: user, service, script, send, receive, manual, business-rule.
- **Gateways** — exclusive, inclusive, parallel, event-based.
- **Events** — start / intermediate (catch + throw) / end; triggers: none, message, timer, error, escalation, signal, cancel, compensation, conditional, link, terminate; **boundary events interrupting *and* non-interrupting** on all 4 sides.
- **Subprocesses** — embedded, expanded, event, transaction, ad-hoc.
- **Activity markers** — loop, multi-instance (sequential + parallel).
- **Swimlanes** — pool, lane, sub-lane, black-box (external participant / IT system).
- **Data** — data object, data store (+ input/output roles via associations).
- **Artifacts** — group, text annotation.
- **Flows** — sequence, message, association; **default flow** (`isDefaultFlow`); conditions captured (`branchCondition`).
- **Interchange** — BPMN 2.0 XML import + export (versioned XSD); Visio round-trip.

---

## 2. Tier 1 — finish the orchestration palette (REQUIRED for "Full BPMN 2.0")

Each item = type + renderer + palette + AI-emit + **BPMN-XML round-trip (import ↔ export)** + a scan/layout pass + a test.

| # | Element | Before | Status |
|---|---|---|---|
| 1.1 | **Complex gateway** (`✳`) | imported as plain gateway (`complexGateway → none`) | ✅ **DONE** — `GatewayType += "complex"`; asterisk marker; import `complexGateway → complex`; Properties picker option. |
| 1.2 | **Multiple** + **Parallel-Multiple** events (pentagon / plus) | absent from `EventType` | ✅ **DONE** — `EventType += "multiple" \| "parallel-multiple"`; pentagon / plus markers; import ≥2 event-definitions → `multiple`; Properties trigger options. |
| 1.3 | **Call Activity** (thick-border activity) | imported as a plain task (`callActivity → none`) | ✅ **DONE** — import now emits a collapsed sub-process with `subprocessType "call"` (its thick-border render + Properties "Call" option already existed). |
| 1.4 | **Compensation activity marker** (rewind icon on a task/subprocess) | only the compensation *event* existed | ✅ **DONE** — `CompensationActivityMarker` in `RepeatMarker` (side-by-side with loop/MI when both apply); import `isForCompensation="true"`; Properties checkbox. |
| 1.5 | **Data Input / Data Output** + **data-object collection** marker | *audit was wrong — these already existed* | ✅ **ALREADY PRESENT** — data-object `role` renders the input (hollow) / output (filled) arrow (auto-set from associations); `multiplicity: "collection"` renders the 3-bar marker and imports from `isCollection="true"`. Added a Properties **Collection** toggle. Standalone `<dataInput>`/`<dataOutput>` (inside `ioSpecification`) are still not imported as separate shapes — niche, covered visually by the role arrows. |
| 1.6 | **Conditional sequence-flow** marker (mini-diamond at source) | condition stored, marker not drawn | ✅ **DONE** — `ConnectorRenderer` draws a default-flow **slash** (`isDefaultFlow`) and a conditional-flow **diamond** (`branchCondition`, gated to non-gateway sources via a new `sourceType` prop). |

**Round-trip note.** Verified by importing each element (test `tests/bpmn/import-tier1.test.ts`, T2217). The Diagramatix bundle format (`xmlExport.ts`) round-trips `gatewayType`/`eventType`/`subprocessType`/properties generically, so export is automatic.

**⚠ Remaining interchange gap (separate from the element palette):** there is **no standalone BPMN 2.0 *exporter*** — only an importer. For an unqualified "full BPMN 2.0 interchange" claim, add a `.bpmn` exporter (round-trip back to standard BPMN XML). Currently the claim is honest as **"imports BPMN 2.0; exports Diagramatix bundle / Visio / PDF."**

On completion, the competitor-matrix cell becomes:
> **Full BPMN 2.0 (orchestration)** — all task/event/gateway types, boundary interrupting + non-interrupting, event/transaction/ad-hoc subprocesses, loop + multi-instance, data i/o + collection, + 40 live scan rules.

---

## 3. Tier 2 — the two extra BPMN 2.0 *diagram types* (optional; big, low-ROI)

| # | Diagram type | Notes |
|---|---|---|
| 2.1 | **Choreography** (choreography task, sub-choreography, participant bands) | A distinct diagram type. Signavio/ARIS have it; PRIME BPM does not. |
| 2.2 | **Conversation** (conversation nodes, conversation links, participant pools) | A distinct diagram type. Rarely used. |

Only needed for an **unqualified** "Full BPMN 2.0" (all diagram types). Recommend footnoting these as out-of-scope ("orchestration BPMN 2.0") unless a specific deal requires them.

---

## 4. Status log

- 2026-08-03 — Audit complete; **Tier 1 implemented** (1.1–1.6). `tsc` clean, build green, `tests/bpmn` + `tests/conformance` (173) green, new `import-tier1.test.ts` (T2217) green. Diagramatix can now render/author/import the full orchestration palette.
- **Claim now defensible:** *"Full BPMN 2.0 (orchestration — Descriptive + Analytic conformance)."* Update the competitor matrix cell accordingly.
- 2026-08-03 — **AI generator + scan rules + image importer wired for the new semantics.** `planBpmn` prompt (text *and* vision import — same prompt) now describes the complex gateway (✳), multiple/parallel-multiple events, call activity (thick-border collapsed sub-process, `subprocessType "call"`), the compensation marker + its directed Association, and the data-i/o hollow/filled arrows + collection marker. Scan rules `checkActivityHasIncoming`/`checkActivityHasOutgoing` now **exempt** `isForCompensation` activities (triggered by association, not sequence flow). `bpmnLayout` auto-types a compensation-event→compensation-activity link as `associationBPMN`. New tests: `import-tier1` (T2217), `compensation-scan` (T2218), `compensation-connector` (T2219).
- 2026-08-03 — **Interactive compensation wiring (Paul's rule).** Per BPMN 2.0 an edge-mounted Intermediate Compensation event may have an *outgoing Association* (never a Sequence Flow), and that association's target **is** the Compensation Activity. So `ADD_CONNECTOR` now detects a connector drawn FROM such an event TO an Activity (task / collapsed sub-process), coerces it to a **directed** `associationBPMN` (`open-directed` → open arrowhead, dashed — the special directed association BPMN uses only here, incl. from a *throwing* compensation event), and **stamps `isForCompensation`** onto the target activity so its rewind marker appears. flowType-agnostic (covers throw & catch).
- **Next (optional):** BPMN 2.0 **exporter** (`.bpmn` round-trip); Tier 2 **Choreography** + **Conversation** diagram types.
