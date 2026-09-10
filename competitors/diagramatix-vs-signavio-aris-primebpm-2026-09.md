# Diagramatix vs SAP Signavio, ARIS & PRIME BPM — Feature & AI Comparison

*Diagramatix data read from the current codebase (product 2.9, export schema v1.2x / SCHEMA_VERSION 46). Competitor data from public product pages and documentation accessed May–June 2026 — **re-verify against live competitor pages before quoting externally**; their AI, mining and simulation features move fast and this document does not track them.*

---

## 1. Executive summary

| | Positioning |
|---|---|
| **Diagramatix** | A focused, self-hostable **authoring + AI + operate** platform for BPMN, ArchiMate, Value Chain, State Machine, Domain, Context, Process Context and Basic diagrams. Differentiators: an opinionated **rules-based layout engine** with **measured readability**, a **two-phase AI generation** (edit the plan, *then* lay it out) across **multiple LLM providers**, admin-tunable AI rules, a built-in **Collaboration & Review** workflow, a **discrete-event Process Simulator** with the analysis layer around it (significance, sweep, sensitivity, validation, payback), a **process-mining workbench** (event-log discovery incl. object-centric/OCEL, slicing with declared exactness, case-level deviation evidence, hand-off and rework analysis, period comparison and alerting) that **calibrates the simulator and holds back cases to test it**, an **AI SOP generator** (BPMN → Word), a **Risk & Control (GRC) matrix**, **APQC PCF** classification, and a partner-facing **Process API**. |
| **SAP Signavio** | The process-design tier of SAP's **Business Process Transformation Suite** — modelling + process mining, governance, publishing, simulation, and **SAP Business AI** (Joule + Text-to-Process), grounded in 5,000 SAP best-practice models. Enterprise, SAP-ecosystem. |
| **ARIS** (Software AG) | A long-established enterprise **BPA / EA suite** — signature **EPC** notation plus BPMN, deep repository/governance, process mining, mature simulation, and the **ARIS AI Companion** (text-to-model, NL search, GenAI mining insights). Enterprise. |
| **PRIME BPM** | An Australian cloud BPM suite in two editions — **PRIME Modeller** and **PRIME Improver** — with a strong improvement/analysis angle (cycle time, cost, VA/NVA) and **AI add-on agents** (MapAI, AI Procedure Writer, Digital Process Analyst, PrimeGPT). |

**The short version.** Diagramatix competes head-on with all three on **authoring + AI generation**, where its editable-plan generation over rules-governed deterministic layout is genuinely distinctive, and where readability is a *measured* property rather than an aspiration — a corpus of stored AI plans is replayed offline on every test run and a ratchet fails the build if overlaps rise. **Diagramatix Miner** reads the messy exports people actually have, every figure on screen says whether it describes the whole run, a slice, or an estimate, a deviation hands you the case ids behind it, hand-offs and rework are measured from per-event resources, and a linked run series makes a one-off study into a **monitor** that says when the process changed — leading with the alarm the others bury: *your feed went quiet*. The **Simulator** carries the layer that decides whether a business case survives the meeting: **is the difference real or is it noise**, **which assumption is load-bearing**, **where does the staffing curve bend**, and **how do we know the model is right** — answered against the distribution the business actually had, with the twin tested on cases **held back** at import rather than marking its own homework. Around them: a partner-facing **Process API** that turns a posted document into a PDF and a real project, and a database-backed **Process Repository** of 26 value chains, 277 processes and 381 editable prompts. The three enterprise suites lead on **scale** — Signavio on the SAP ecosystem and the most industrialised mining, ARIS on EA breadth, EPC, repository governance and the deepest simulation *engine*, PRIME BPM on built-in improvement analytics — and on **configurable approval-workflow engines with full audit**. The remaining mining gap is **connector breadth and enterprise data volume**, which is an infrastructure argument rather than an analytical one. On what a single analyst can find out, defend, and be told about without opening the tool, Diagramatix is the more complete product — self-hosted, per-seat, in one place.

---

## 2. AI Generation — detailed comparison

All four products do "describe a process → get a BPMN diagram", but differ sharply in **how much control you get** and **what the AI is grounded in**. Diagramatix's AI has also broadened since July: **multiple LLM providers**, **usage metering/cost governance**, and an **AI SOP writer**.

| Capability | **Diagramatix** | **SAP Signavio** | **ARIS (AI Companion)** | **PRIME BPM (MapAI)** |
|---|---|---|---|---|
| Natural-language → BPMN | ✅ Two-phase: Plan → **editable plan** → Apply layout | ✅ "Text to Process" (V2: larger/more complex inputs) | ✅ Text → structured model | ✅ "BPMN map in minutes from text" |
| Target notations from AI | ✅ **Text → 7 notations**: BPMN (2-phase) + one-shot **ArchiMate**, State Machine, Domain, Context, Process Context, Value Chain | BPMN only | **EPC or BPMN** | BPMN maps only |
| **Choice of LLM provider** | ✅ **5 models live** — Anthropic **Claude**, Moonshot **Kimi**, Google **Gemini**, Microsoft **Azure OpenAI (GPT-5-mini class)** — admin-selectable; **self-hosted key or gateway** | ❌ SAP Business AI only | ❌ Software AG GenAI only | ❌ Not disclosed |
| **AI usage metering + cost governance** | ✅ Per-org/user **invocation metering, token cost rates, usage dashboard**; per-org "allow AI" policy + optional prompt redaction | Enterprise-managed | Enterprise-managed | Add-on billing |
| Other input modalities | PDF, text-file, **and image/screenshot** attachments | Text | Text | **Excel, text, audio, video, conversation** |
| **Image / sketch → editable diagram** | ✅ **Vision + OCR rebuild a whiteboard photo, screenshot or someone else's flowchart as an editable diagram; translates a plain flowchart image into BPMN** | — | — | — (audio/video/Excel, not image→BPMN) |
| Editable *intermediate plan* before layout | ✅ **Unique** — live-synced Pools/Lanes, Elements, Connectors, Raw-JSON tabs; nothing positioned until Apply | ❌ Drops onto canvas | ❌ Generates the model | ❌ Generates the map |
| User/admin-tunable generation rules | ✅ **Admin-editable AI Rules per diagram type**; "green" rules steer the model, "red" rules enforced by the layout engine | Limited (SAP recommendations) | Not user-editable | Not user-editable |
| **AI → SOP document** (procedure writer) | ✅ **BPMN → SOP** (whole/lane/pool/subprocess/group) → AI prose → editable → **Word (.docx)** with org **template style-adoption** | — | — | ✅ **AI Procedure Writer** (from recordings/conversations) |
| Grounding / knowledge base | The model + your rules + (optional) mined data; no external content library | ✅ **5,000 SAP best-practice models** | ARIS repository + GenAI on mining | Its own BPM methodology + guardrails |
| Deterministic publish-ready auto-layout of AI output | ✅ 50+ codified rules run *after* plan approval; **40+ live scan rules** (B01–B41) flag structure issues | Basic auto-layout | Standard layout | Auto-map |
| "Assist-while-you-draw" (suggest next step, NL search) | ✅ inline rules-grounded **ghost next-steps** (Tab to accept), a **NL command bar**, and **Abracadabra Mode: live hands-free voice editing** | ✅ Joule NL search | ✅ NL search / NL→calc-field | ✅ PrimeGPT NL search |
| **Voice-driven live diagram editing** | ✅ **Unique** — speak/​type edits ("add a task after Review", "put a pool around everything", "delete Prepare and compact") applied live, undoable, rules-validated | ❌ | ❌ | ❌ |
| Claimed time saving | "Seconds" to a laid-out diagram | Up to **80%** | — | Up to **90%** |

### What each one is really good at

**Diagramatix — control + clean layout + provider choice.** The defining difference remains the **two-phase flow** (edit a structured plan across synchronised tabs *before* any geometry is computed, then a deterministic engine of 50+ rules lays it out) with **admin-editable green/red rules**. New since July: generation now runs on **any of five LLM providers** (Claude, Kimi/Moonshot, Gemini, Microsoft Azure OpenAI) — chosen by an admin, with **per-org usage metering, token-cost rates and an "allow AI" governance switch** (plus optional pseudonymisation of names before a prompt leaves the tenant). AI breadth still spans **seven notations** (incl. **ArchiMate** now as a first-class generated type) and the distinctive **image-to-diagram** path (flowchart photo → editable BPMN). And a new **AI SOP writer** turns any diagram — or a single lane/pool/subprocess — into an editable **Word procedure** that adopts your house template's fonts/heading styles.

**SAP Signavio — enterprise grounding.** "Text to Process" plus **grounding in 5,000 SAP best-practice models** and Joule NL search. Output goes straight to canvas; generation-rule customisation is limited to its recommendation engine.

**ARIS — text-to-model + analytics GenAI.** The AI Companion generates **EPC or BPMN** from text and leans into repository NL search, NL→calculated-field code, and GenAI insights over Process Mining.

**PRIME BPM — multi-modal capture + improvement.** MapAI is the most flexible on *input* (Excel/text/audio/video/conversation → map), paired with improvement agents incl. **AI Procedure Writer** (SOPs) — the closest analogue to Diagramatix's new SOP generator, though PRIME's is recording-driven while Diagramatix's is **diagram-grounded** (the SOP always matches the model).

### AI verdict

- **Diagramatix** — **maximum control** of the generated structure, a **clean rules-driven layout**, **your choice of LLM** with **cost/usage governance**, **7 notations** and **image→BPMN**, plus a **diagram-grounded SOP writer**.
- **Signavio** — best if your processes map onto **SAP best practices** and you want SAP-ecosystem grounding.
- **ARIS** — best if you need **EPC as well as BPMN** and AI over a **mining/repository** backend.
- **PRIME BPM** — best if your input is **messy real-world capture** and you want AI-driven **improvement** analysis.

Diagramatix is still the only one exposing an **editable intermediate plan** and a **user-editable layout rule set**, the only one generating **all its notations** (not just BPMN) and **image→BPMN** — and now the only one offering **LLM provider choice with per-org cost metering**.

**Assist-while-you-draw.** Canvas-native assistance, which the rivals answer with repository or mining NL chat rather than structural editing:

- **Rules-grounded ghost suggestions** — select an element and translucent next-step chips appear (Tab/click to accept); every suggestion is validated by the same rules engine + `canConnect` legality that governs AI generation, so it's never illegal or badly laid out. Suggestions include next-step elements, boundary events, template fragments, and **content-aware data objects / template intents** driven by an **admin-editable keyword catalog** ("Assist / NL Rules", green rules editable, red geometry read-only).
- **A natural-language command bar** — type an editing instruction and it's applied to the current diagram (an incremental delta, not a regenerate).
- **Abracadabra Mode — live, hands-free voice editing.** This is the genuine differentiator: speak commands and the diagram edits itself live — *"add a task called Approve after Review"*, *"put a pool around everything"*, *"add 3 sublanes to the Marketing Team lane called…"*, *"move the gateway two elements right"*, *"delete Prepare and compact"*. A deterministic parser handles common phrasings instantly and free; only unusual phrasing falls back to a metered LLM. Every change is undoable and the command log colour-codes rule vs AI.

The rivals' assist is essentially **repository/mining NL chat** (Joule, AI Companion, PrimeGPT) — ask questions of a process estate. None publicly offers **canvas-native, rules-grounded, voice-driven live structural editing**. Diagramatix also **meters voice minutes** (Deepgram sessions) in its AI-usage dashboard.

#### The real axis: *interaction model* vs *data grounding*

It's easy to score this as "everyone has NL now." They don't have the *same* NL. Two different axes separate the four products:

- **Interaction model — how the AI touches the diagram.** The incumbents' assist is **batch generation** ("describe it → get a whole diagram") plus **conversational query** over a backend. Diagramatix's assist is **incremental, canvas-native editing**: inline **ghost** next-steps (Tab to accept), an **NL command bar** that applies a *delta* to the *current* diagram (not a regenerate), and **Abracadabra Mode** live voice editing — each utterance a surgical, undoable, **rules-validated** edit. A **hybrid** design runs the common 80% on instant free deterministic rules and only falls back to a metered LLM for unusual phrasing, so it's cheap enough to leave on all day. And **template insertion is seamless and governed** — naming an element drives a suggestion from the org's *own* template library + APQC (leading start-event stripped, anchored, auto-laid-out), tuned via an admin-editable green/red rule catalog. No competitor packages canvas-side, name-driven retrieval from a governed template library, and none offers voice-driven live structural editing.

- **Data grounding — what the AI knows.** Here the enterprise suites lead: their assist sits on a company-wide **repository + mined execution estate**, so "ask Joule about our order-to-cash" reasons over *real* data in a way Diagramatix's canvas + rules + templates + APQC grounding does not. **Mining-grounded "what actually happens next"** is the one assist capability they have that Diagramatix doesn't yet — and the natural next moat (ground the ghost in a linked event log). Diagramatix also trails on **maturity/scale**, has **no response streaming** yet (a spinner on the AI fallback), and voice depends on a speech service with the usual ASR rough edges.

**In one line:** *their AI helps you by talking **about** processes; Diagramatix's helps you **build** them — by hand, by keyboard, or by voice — with the correctness guarantees of a governed rules engine behind every change.* Diagramatix wins the interaction model outright; the suites still win data-grounded reasoning at enterprise scale.

---

## 3. Process mining

Diagramatix Miner is an in-tool process-mining module — discovery, conformance, an analyst's workbench over the result, and a monitor that speaks when the process changes. It is compared here in the three parts a buyer actually evaluates: can it read my data, can I get an answer out of it, and will it tell me when something moves.

### 3.1 Getting the log in

Most people do not have an XES file. They have a spreadsheet, and it is rarely the shape a miner expects.

| Input capability | **Diagramatix Miner** | **Signavio** | **ARIS** | **PRIME BPM** |
|---|---|---|---|---|
| CSV / TSV, **IEEE XES (1849)**, **OCEL** | ✅ all four, in-tool | ✅ | ✅ | Partial |
| **Excel (.xlsx)** read directly, multi-sheet aware | ✅ offers the sheet when a workbook holds several | via ETL | via ETL | ✅ |
| **Wide "one row per case"** exports (state, date, state, date across a row) | ✅ **detected and expanded**, rather than read as one event per case | via ETL | via ETL | — |
| **Several systems, one lifecycle** — merge the CRM's front half with the ERP's back half | ✅ in-tool, union-find id unification by shared key or explicit crosswalk | ✅ via ETL/connectors | ✅ via ETL/connectors | — |
| **Cross-system hand-off measured at the join** — the wait neither export contains | ✅ | — | — | — |
| **Refuses** a merge with no overlapping cases | ✅ says so, rather than returning twice as many half-length cases | n/a | n/a | n/a |
| Column retention is **opt-in** (keep / hash / drop) at import | ✅ kept columns become the slicing dimensions | — | — | — |

The distinction worth drawing for a buyer: the suites solve these with **ETL and a connector catalogue**, which is a project. Diagramatix solves the common cases **in the import screen**, which is an afternoon. Where they cannot be reconciled it refuses rather than producing a plausible wrong answer — a merge in which no case appears in more than one file looks exactly like a successful import.

### 3.2 Reading it

| Analysis capability | **Diagramatix Miner** | **Signavio** | **ARIS** | **PRIME BPM** |
|---|---|---|---|---|
| Discovery (log → BPMN / state machine), variants, conformance | ✅ | ✅ deep | ✅ deep | ❌ |
| **Object-centric (OCEL)** — a domain model per object type | ✅ | Emerging | Emerging | ❌ |
| **Slice by date, team or any kept column**, with the arrivals chart as the date brush | ✅ | ✅ | ✅ | Partial |
| **Every figure declares its own exactness** — *filtered*, *filtered · estimated*, or *not filtered, and here is why* | ✅ **no equivalent found** | — | — | — |
| **Between steps** — transitions ranked by the elapsed time they account for | ✅ with the median on the model's arrows | ✅ | ✅ | — |
| **Hand-off map** built from per-event resources, not from each activity's dominant team | ✅ and labelled *approximate* when it cannot be exact | ✅ | ✅ | — |
| **Ping-pong** (two teams passing a case back and forth) and **rework rates** ("Credit check runs 2.1× per case") | ✅ | Partial | Partial | — |
| A deviation resolves to the **actual case ids**, each with its own timeline | ✅ and it states **how many of the affected cases it can name** | ✅ | ✅ | — |
| Whole per-case index exports as CSV, honouring the filter | ✅ | ✅ | ✅ | — |
| **"What to do next"** — ranked, deterministic recommendations, each with a button | ✅ and it can say *nothing stands out* | AI narrative | AI narrative | ✅ analytics |

Two of those rows are the differentiators, and both are about **honesty rather than capability**. Every figure in the workbench says whether it describes the whole run, a slice, or a sampled estimate — so a number can be cited. And the recommendations are **computed and ranked deterministically**; the AI narrates the findings it is handed and never sees the run, so it cannot produce a figure the ranking did not.

### 3.3 Watching it, rather than visiting it

Nobody mines a process once.

| Monitoring capability | **Diagramatix Miner** | **Signavio** | **ARIS** | **PRIME BPM** |
|---|---|---|---|---|
| Runs link into a **series** with a real parent link | ✅ | ✅ | ✅ | — |
| **Compare two periods** — cases, cycle time, variants, conformance, which steps got slower, which deviations appeared or cleared | ✅ | ✅ | ✅ | Partial |
| **Refuses** to compare two runs whose activity vocabularies barely overlap | ✅ they are different processes, and every delta would read as a regression | — | — | — |
| A live source keeps its own history, bounded (1/day, 30 max) | ✅ | ✅ | ✅ | — |
| **"The source stopped sending"** alarm | ✅ the cheapest alarm and the most valuable — a dead feed raises no error, and stale figures look exactly like stable ones | ✅ | ✅ | — |
| Conformance fell · a new deviation appeared · the late rate doubled | ✅ | ✅ | ✅ | — |
| Nothing fires on a **first** observation; a condition is announced **once** | ✅ and what is *not* being watched is listed by name | — | — | — |
| **Hold back** the most recent cases at import so a twin is tested on data it never saw | ✅ | — | — | — |
| Calibration fits the **observed values**, fenced against outliers — not a curve laid over them | ✅ a single case that sat over a long weekend cannot set the model tail | Fitted distributions | Fitted distributions | — |
| A twin whose log has moved on is marked **stale**, with the date | ✅ never silently re-calibrated over your edits | — | — | — |
| Self-hosted, per-seat, no separate mining product | ✅ | ❌ | ❌ | ❌ |

**Verdict.** Signavio and ARIS still have the **most mature, industrial-scale** mining — huge connector catalogues, conformance hardened over years, and the scale that comes with an enterprise data platform. That has not changed and should not be contested.

What has changed is the shape of the competition. The suites sell mining as a **data-platform capability**: get the data in, at scale, and analyse it. Diagramatix now sells it as an **analyst's workbench with a conscience** — it reads the spreadsheet you actually have, it tells you which slice a number describes, it hands you the case ids behind a deviation and admits when it can only name some of them, it recommends what to do next from computed evidence, and it tells you when the process changed rather than waiting to be visited. And it still does the thing none of them package: **mined data calibrates the discrete-event simulator**, so a discovered as-is becomes a simulated to-be — now with the twin tested against **held-back** cases rather than marking its own homework.

---

## 4. BPMN modelling & standards

| Feature | Diagramatix | SAP Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| BPMN 2.0 notation | **Full BPMN 2.0 orchestration palette** (all task/event/gateway types, boundary interrupting + non-interrupting, event/transaction/ad-hoc subprocesses, loop + multi-instance, data i/o + collection) + **40+ live scan rules** (structure, overlap, segregation-of-duties, boundary-event flow) | ✅ Full BPMN 2.0 | ✅ BPMN 2.0 (+ EPC, UML, more) | ✅ BPMN-compliant maps |
| Gateways incl. event-based **& complex** | ✅ exclusive/parallel/inclusive/**event-based**/**complex (✳)** (AI-emitted, engine-wired) | ✅ | ✅ | ✅ |
| **Full event trigger set** incl. multiple / parallel-multiple; **compensation** | ✅ message/timer/error/signal/escalation/cancel/**compensation**/conditional/link/**multiple**/**parallel-multiple** | ✅ | ✅ | Partial |
| **Compensation semantics** (edge-mounted event → directed rectilinear association → compensation activity; **honoured in the simulator**) | ✅ **editor + discrete-event simulation execute it** (fire on throwing event, LIFO) | Modelling | Modelling | ❌ |
| Pools/lanes/sub-lanes; white/black-box | ✅ Nested; black-box = external participant **or IT system** | ✅ | ✅ | ✅ |
| Subprocesses (collapsed+expanded) incl. **call activity**, event subprocess + boundary events | ✅ | ✅ | ✅ | ✅ |
| **ArchiMate (Enterprise Architecture)** | ✅ **Full ArchiMate diagram type** — element/relationship catalogue, matrix-filtered pickers, junctions, **custom icon library** (image → AI-vectorised → assignable), relationship explorer | Limited | ✅ (EA heritage; ARIS is an EA suite) | ❌ |
| CMMN / DMN | ❌ | ✅ | ✅ (DMN) | ❌ |
| EPC | ❌ | ❌ | ✅ **Signature notation** | ❌ |
| **APQC PCF** process classification | ✅ **Import the APQC Process Classification Framework (L0–L3), classify diagrams, coverage view, "Create APQC Process"** | Via SAP content | Via reference models | Via methodology |
| Glossary / **governed naming** | ✅ **Entity Lists** (Org→Unit→Team→Role + External-Participant + IT-Systems), org-master → project copy, **drift highlighting** | ✅ Dictionary | ✅ Repository naming governance | Partial |
| Best-practice / reusable content library | Templates (built-in + personal) + **example packages** (mining, simulation, risk-control) | ✅ 5,000+ models | ✅ Reference models | ✅ Methodology |

**Verdict.** The suites still have deeper *formal* notation coverage (CMMN/DMN; EPC for ARIS). But Diagramatix has closed ground on **EA (ArchiMate)** and added a **standards anchor the mid-market rarely gets — APQC PCF classification** — plus governed naming with drift detection and 40+ automated scan rules.

---

## 5. Governance, Risk & Control (GRC)

A new pillar since July. Diagramatix now models **risk and control alongside the process**, and exports a **Risk-Control Matrix**.

| GRC capability | **Diagramatix** | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Attach **Risks & Controls** to process steps | ✅ project/org **Risk-Control catalog**, attach by code | Via GRC integrations | Via GRC/repository | Partial |
| **Risk-Control Matrix (RCM)** export | ✅ **RCM export** with org numbering / codes | ✅ (SAP GRC ecosystem) | ✅ (enterprise) | — |
| Control **effectiveness** + **compliance** modelling | ✅ control-effectiveness + compliance structures | ✅ | ✅ | — |
| **Segregation-of-duties** check | ✅ **scan rule** flags a lane holding both an originating and an authorising activity | ✅ (GRC) | ✅ | — |
| Coverage gap (risk with no mitigating control) | ✅ **scan rule** | ✅ | ✅ | — |
| Self-hosted, in the authoring tool | ✅ | ❌ (separate SAP GRC) | ❌ | — |

**Verdict.** Enterprise GRC suites (esp. SAP's) remain far deeper for audit/controls-testing at scale. Diagramatix's contribution is **lightweight, integrated GRC**: model the process and its risks/controls in one place, get an **RCM** out, and have the scanner flag **SoD breaches and uncovered risks** automatically — without a separate GRC product.

---

## 6. SOP / procedure generation

| SOP capability | **Diagramatix** | Signavio | ARIS | **PRIME BPM** |
|---|---|---|---|---|
| Generate a **Standard Operating Procedure** from a diagram | ✅ **whole / lane (role SOP) / pool / subprocess / linked group** | Via publishing/text | Via publishing | ✅ **AI Procedure Writer** |
| Grounding | ✅ **diagram-grounded** (deterministic extract → AI prose; never invents steps) | — | — | Recording/conversation-driven |
| Role SOP **hand-offs** (received-from / handed-off-to) | ✅ both directions, with a cropped **lane figure** + green boundary labels | — | — | Partial |
| Editable in-app, then **Word (.docx)** | ✅ full editor (reorder/lock/regenerate), **non-destructive regenerate** (keeps your edits/added sections) | — | — | ✅ |
| Adopt an **org Word template** (fonts/heading styles) | ✅ per-org/per-project template **style adoption** | — | — | Varies |

**Verdict.** PRIME BPM's AI Procedure Writer is the nearest competitor; the key difference is **grounding** — Diagramatix's SOP is generated *from the model* (so it always matches the process and can be re-generated non-destructively when the diagram changes), and it can document a **single role's lane** with explicit hand-offs. The Word-template style adoption makes the output house-branded.

---

## 7. Layout & routing

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Deterministic, rules-based auto-layout | ✅ **50+ codified rules**, tuned for publish-ready output | Basic | Standard | Auto-map |
| Orthogonal routing + obstacle avoidance | ✅ | ✅ | ✅ | ✅ |
| Direct + curvilinear per-connector | ✅ | Partial | Partial | — |
| Drop-on-connector splits the flow | ✅ | ❌ | ❌ | ❌ |
| Insert-space marker (4-directional) | ✅ | ❌ | ❌ | ❌ |

**Verdict.** Still **Diagramatix's strongest single differentiator** — layout as a design philosophy (zero manual tidy-up), which is exactly what makes AI/mined output usable immediately.

---

## 8. Simulation

The engine is discrete-event and BPSim-aligned. What distinguishes it is the layer around the engine: almost everything below is about **defending an answer** rather than producing one.

| Simulation capability | **Diagramatix** | **Signavio** | **ARIS** | **PRIME BPM** |
|---|---|---|---|---|
| Engine | Discrete-event, token-flow, resource contention; Monte-Carlo ranges (p5/p50/p95) | Token-based | Discrete-event (mature, animated) | Scenario / future-state |
| Shared resource pools across *multiple* processes | ✅ portfolio capacity planning | Partial | ✅ | — |
| **As-is vs to-be** with a plain-language **cost verdict** | ✅ (% faster, throughput, $/case, **FTE freed**) | Via scenarios | Via scenarios | ✅ |
| **Business case with a payback month** — cost per case before/after, annual saving, one-off cost, narrated and exportable to Word/Excel/PDF | ✅ a missing input is reported as missing, **never treated as zero**; a change that does not pay back says so | — | — | ✅ improvement analytics |
| **Is the difference real?** Welch's test over per-replication means, reported as a confidence interval | ✅ and when it is not real it says so and offers to run the replications that would settle it | — | — | — |
| **Parameter sweep** with the **knee** marked — the point where one more person stops buying much | ✅ and it refuses to invent an elbow in a flat curve | — | Partial | — |
| **Sensitivity / tornado** — every input pushed ±20% and ranked by how far the answer moves | ✅ says where better data is worth buying, and where a guess is safe | — | Partial | — |
| **Skills and cross-skilling** — named people, per-task required skills | ✅ the middle ground between "nobody helps" and "everybody does everything" | — | ✅ | — |
| **Queue discipline** — FIFO, priority, shortest-job-first; service level reported **per segment** as well as pooled | ✅ a pooled p95 can look healthy while the segment that matters misses entirely | Partial | ✅ | — |
| **Model validation against reality** — simulated flow-time distribution vs the one the business actually had, with a p50/p90/p95 table and a verdict | ✅ "how do we know it is right" stops being judgement and becomes a number | — | — | — |
| **Suggested next steps** from the study's run history, each with its evidence — including **negative results** reported as plainly as promising ones | ✅ | — | AI Companion narrative | — |
| **Live "fork-the-timeline" Operator** (intervene mid-run) | ✅ | — | ✅ animation (not interactive fork) | — |
| Working-hours **calendars / shifts**, holidays, shutdowns | ✅ | ✅ | ✅ | ✅ |
| **Mining-calibrated** parameters, with an **out-of-sample hold-back** | ✅ mined logs → sim inputs, tested on cases the twin never saw | Separate | Separate | — |
| **Distributions** | ✅ fixed, uniform, triangular, truncated normal, negative exponential, **lognormal** (the right-skewed shape service times actually have) and **empirical** (the observed values, resampled) | Documented set | Broad documented set | — |
| **Preemption** — urgent work interrupts work in progress, and RESUMES it | ✅ preempt-resume, so the interrupted case keeps the work already done | — | Partial | — |
| **Costs that do not scale with time** — a per-run charge on an activity | ✅ reported separately from resource cost, because the two have different remedies | — | ✅ activity-based costing | — |
| Standards interchange (**BPSim**) | ✅ OMG/WfMC import + export | — | — | — |
| Self-hosted, no separate simulation module | ✅ | ❌ | ❌ | ❌ |

**Verdict.** ARIS still has the **deepest and most mature** simulation engine, and that is a genuine, years-deep lead.

Engine depth is not the whole contest. The rows nobody else has a column for — **significance testing, parameter sweep with a knee, a sensitivity tornado, and validation against the actual distribution** — are not about simulating better; they are about being able to **defend the number in the room**. "But you guessed that input" and "is 4% real, or is it noise?" are the two questions that kill a simulation-based business case, and both have answers here rather than assurances. With the payback month and the mining hold-back alongside them, the proposition is not *we can model your process* but *we can tell you which of your assumptions is load-bearing, whether the improvement survived the noise, and what month it pays for itself*.

---

## 9. Collaboration, review, publishing & access

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Role-based project sharing (View/Edit) + per-diagram owner | ✅ | ✅ | ✅ | ✅ |
| **OrgAdmin** tier + per-org sharing/AI/SSO policy | ✅ | ✅ | ✅ | ✅ |
| **Domain-managed membership** — an org claims email domains; matching sign-ups auto-join (no stray personal orgs) | ✅ | Enterprise provisioning | Enterprise provisioning | — |
| Send-for-review rounds (comment → approve/decline → resubmit → finish) | ✅ dashboard-tracked | ✅ Process Governance | ✅ Governance | ✅ |
| Versioned publishing + publication **bundles** to a business audience (read-only viewer, invite-by-email) | ✅ | ✅ | ✅ | ✅ |
| Scheduled re-review reminders (cron) | ✅ | ✅ | ✅ | ✅ |
| **Microsoft SSO / enterprise readiness** (view-mode tiers, entitlements, per-org policy) | ✅ **Microsoft sign-in; SSO-required policy; enterprise-mode governance switches** | ✅ | ✅ | ✅ |
| **Real-time multi-user co-editing** | ✅ **Live presence + cursors, soft element locks, version-guarded saves, automatic 3-way merge of non-overlapping edits** | ✅ | ✅ | ✅ |
| Live cursors + presence | ✅ (cursors via Liveblocks; presence/locks always on) | ✅ | ✅ | ✅ |
| No-clobber concurrent save (never lose the whole document) | ✅ **optimistic version guard + auto-merge** | ✅ | ✅ | ✅ |
| Configurable approval-**workflow engine** + full enterprise audit log | **Mid** (lifecycle, not a configurable engine/full audit) | ✅ Deep | ✅ Deep | ✅ |

**Verdict.** Diagramatix is a **real-time collaborative** authoring tool rather than a single-editor one: several people edit the same diagram together with **live presence, cursors and soft locks**, and a **version guard + automatic three-way merge** means concurrent saves never silently overwrite each other — edits to different shapes merge silently, and only a same-shape clash is flagged. The suites lead on a **configurable approval-workflow engine** and a **full enterprise audit log**; real-time co-editing is not among their advantages.

---

## 10. Export, interop & deployment

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| PDF / SVG export | ✅ | ✅ | ✅ | ✅ |
| **Word (.docx)** SOP + technical-notes export (template style-adoption) | ✅ | Partial | Partial | ✅ (SOPs) |
| Visio (.vsdx) round-trip | ✅ import + export (custom shapes or BPMN stencil) | Import/export | Import/export | Import (varies) |
| BPMN XML round-trip | ✅ (versioned XSD) | ✅ | ✅ | ✅ |
| **BPSim** simulation interchange | ✅ import + export | — | — | — |
| **XES (IEEE 1849) / OCEL** event-log interchange | ✅ import + export | ✅ | ✅ | — |
| **Partner Process API** — post a description or a document (SOP, PDF, image) + volumetrics, get pools, lanes, an ordered activity list, a **PDF** and a real project someone can open | ✅ async jobs, run history, two-run comparison, audit rows, SuperAdmin test harness | Via SAP BTP APIs | Via ARIS APIs | — |
| DDL ↔ Domain-model round-trip | ✅ (PostgreSQL/MySQL/SQL Server) | ❌ | ❌ | ❌ |
| **Microsoft 365 (SharePoint/OneDrive)** | ✅ save/open in SharePoint/OneDrive; link Data Objects to live docs w/ preview | Via ecosystem | Via integrations | Varies |
| Full-account portable **backup/restore** (one file) | ✅ | ❌ (SaaS) | Enterprise export | ❌ (SaaS) |
| Deployment | **Self-hosted** (Next.js + Postgres) or hosted | SaaS (SAP BTP) | SaaS / on-prem | Cloud SaaS |
| Pricing | Per-seat / self-host; **bring-your-own AI key or gateway** | Enterprise contract | Enterprise contract | Per-user + AI add-ons |

---

## 11. Where Diagramatix wins

1. **Editable-plan AI generation** with **provider choice** (5 LLMs) and **per-org cost metering** — inspect/edit the plan before layout; text → **all 7 notations**; **image/sketch → editable BPMN**.
2. **Rules-governed, publish-ready layout** (50+ rules) + **40+ live scan rules** (incl. SoD, coverage, boundary-event flow), with **readability as a measured property**: a corpus of stored AI plans is replayed offline on every test run and a ratchet fails the build if overlaps rise.
3. **One self-hosted tool that authors → AI-generates → mines → simulates → documents (SOP) → governs (GRC)** — where the suites need multiple enterprise modules.
4. **Process mining that reads the log you actually have** — Excel, wide "one row per case" exports, and **several systems merged into one lifecycle** with the cross-system hand-off measured at the join. In the import screen, not an ETL project.
5. **Every mined figure declares its own exactness** — filtered, estimated, or not filtered and why. No competitor found makes a number say what it is entitled to claim, and it is what makes one citable.
6. **A miner that tells you when the process changed** — linked run series, period comparison that **refuses** two runs that are not the same process, and alerting that leads with the alarm nobody else leads with: *the source stopped sending*.
7. **A simulator that defends its answer** — significance testing (is the difference real, or noise?), parameter sweep with the knee marked, a **tornado** ranking which assumption is load-bearing, validation against the distribution the business actually had, and a **business case with a payback month**.
8. **Mine → model → simulate, with a hold-back** — mined data calibrates the twin, and the twin is tested against the most recent cases it was never fitted to. The loop the suites do not package, now with an out-of-sample check.
9. **AI SOP generator** — diagram-grounded, per-lane role SOPs with hand-offs, non-destructive regenerate, **Word template style-adoption**.
10. **GRC** — attach risks/controls, **RCM export**, SoD + coverage checks, and control operating-effectiveness mined **directly** from governance ids on events.
11. **APQC PCF** classification + **governed naming** (Entity Lists) with drift detection, over a database-backed **Process Repository** (26 value chains, 277 processes, 381 editable prompts).
12. **A partner-facing Process API** — a third party posts a description or a document (SOP, PDF, image) plus volumetrics and receives pools, lanes, an ordered activity list, a **PDF**, and a real project someone can open. Async jobs, run history, two-run comparison and audit rows.
13. **Self-hosted, no ecosystem lock-in**, per-seat, **bring-your-own AI**, with **full-account portable backup**.
14. **Interop** — Visio round-trip, BPSim, XES/OCEL, DDL↔Domain, and **Microsoft 365** save/open + document links.
15. **Real-time co-authoring** — live presence + cursors, soft element locks, and a **version guard + automatic 3-way merge** so concurrent edits never silently clobber.
16. **Voice-driven, rules-grounded assist** — **assist-while-you-draw** (ghost next-steps) *and* **Abracadabra Mode live voice editing**: speak or type an edit and it is applied live, undoable, validated by the same rules engine that governs generation. Competitors' assist is repository/mining NL chat, not structural canvas editing.

## 12. Where each competitor still wins

- **Signavio:** SAP best-practice grounding, the most **industrialised mining** (connector catalogue, scale), formal governance/publishing, Cloud ALM execution bridge, CMMN/DMN, deep SAP-GRC.
- **ARIS:** EPC + broad notation set, enterprise **EA repository** breadth, industrial mining, the **deepest and most mature simulation engine**, AI Companion over mining data, governance/audit depth.
- **PRIME BPM:** multi-modal AI capture (audio/video/Excel/conversation), built-in **improvement analytics**.
- **All three:** a **configurable approval-workflow engine** and a **full enterprise audit log**; and **mining scale** — connector breadth and conformance hardened over years at enterprise volumes.

*Two qualifications on that last line.* Mining **maturity of the reading** is not a fair entry: slicing with declared exactness, case-level deviation evidence, hand-off and rework analysis, period comparison and alerting are all present. What remains is **scale and connector breadth** — an infrastructure argument rather than an analytical one. And **simulation** splits in two: ARIS holds the deeper engine, Diagramatix the analysis layer around it — significance, sweep, sensitivity, validation, payback.

## 13. Positioning Diagramatix

- "Describe your process — then **edit the plan before it's drawn**, on **the LLM you choose**. AI you actually control and can cost-govern."
- "**Just talk.** Say *'add a task after Review'*, *'put a pool around everything'*, *'delete Prepare and compact'* — and watch it happen, live and undoable. Voice-driven modelling no other BPM tool offers."
- "**Publish-ready** BPMN/ArchiMate in seconds, laid out by 50+ rules — and readability is measured, not hoped for."
- "**Bring the spreadsheet you actually have.** Excel, a status report with one row per case, or three systems' extracts of the same orders — mined in the import screen, not in an ETL project."
- "**Every number says what it is entitled to claim** — whole run, this slice, or an estimate. That is the difference between a figure you can present and one you can be caught out on."
- "**Mine it, model it, simulate it — and defend it.** Discover the real process from logs, simulate the redesign, then find out whether the improvement survived the noise, which assumption is load-bearing, and what month it pays back."
- "**We'll tell you when it changes.** Linked run series, period comparison, and alerts that lead with the one nobody else leads with: your feed went quiet."
- "**Document it (SOP → Word)** and **govern it (risk-control matrix, APQC)** — the operate layer, not just an editor."
- "Round-trips **Visio, BPMN XML, BPSim, XES, OCEL**; saves to **SharePoint/OneDrive**; **self-hosted**, per-seat — no enterprise contract."

Where **not** to compete: **mining scale and connector breadth** (enterprise data volumes, hardened conformance at scale), a **configurable enterprise approval-workflow engine + full audit**, **SAP-ecosystem execution**, deep **enterprise GRC controls-testing**, and (for ARIS) **EPC + EA repository breadth**, **activity-based costing depth**, and the most mature simulation **engine** — years of hardening at scale, which no feature row substitutes for.

---

## Sources

- **Diagramatix codebase audit** — `c:\Git\Diagramatix\diagramatix\` (current branch, **September 2026**, product 2.9): `app/lib/mining/` (discovery, OCEL, XES, xlsx + wide-format + multi-source merge, `filterAnalytics`, `handover`, `teamFlow`, `caseEvidence`, `nextSteps`, `compareRuns`, `alerts`, mining→sim calibration), `app/lib/simulation/` (calendars, skills, queue discipline, significance, sweep, sensitivity, business case, BPSim), `app/lib/sop/`, `app/lib/riskControls/` (RCM), `app/lib/pcf/` (APQC), `app/lib/archimate/`, `app/lib/ai/` (multi-provider models, pricing, metering, readability ratchet), and `VERSION_HISTORY.md` entries 2.4.2381 → 2.9.2517.
- Competitor sources (May–June 2026, carried forward — **re-verify before external use**):
  - [SAP Signavio launches AI Process Modeler, Text-to-Process (Mar 2025)](https://news.sap.com/2025/03/sap-signavio-launches-ai-process-modeler-text-to-process/) · [Text-to-Process V2](https://community.sap.com/t5/technology-blog-posts-by-sap/ai-powered-modeling-gets-an-upgrade-text-to-process-v2-in-sap-signavio-lab/ba-p/14263094) · [Signavio Process Modeler](https://www.signavio.com/products/process-modeler/)
  - [ARIS AI Companion](https://aris.com/aris-ai-companion/) · [ARIS re-defines AI Process Intelligence (Nov 2024)](https://newscenter.softwareag.com/en/news-stories/press-releases/2024/1113-aris-redefines-ai-process-intelligence.html)
  - [PRIME BPM AI agents](https://www.primebpm.com/bpm-ai-agents) · [PRIME Modeller](https://www.primebpm.com/business-process-mapping-modeling-software)
