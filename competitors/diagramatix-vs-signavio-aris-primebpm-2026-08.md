# Diagramatix vs SAP Signavio, ARIS & PRIME BPM — Feature & AI Comparison

*Compiled: **August 2026**. Diagramatix data from the current codebase (export schema v1.2x; BPMN + 6 other diagram types incl. **ArchiMate**, plus a built-in **process-mining module (DiagramatixMINER)**, a discrete-event **Process Simulator** (now with working-time calendars + mining calibration), an **AI SOP generator**, a **Risk & Control (GRC) matrix**, **APQC PCF** process classification, **multi-model AI** with usage metering, a **publishing & review lifecycle**, **real-time co-authoring** (live presence + cursors, soft locks, conflict-merged saves), **Microsoft 365 (SharePoint/OneDrive)** integration, **governed pool/lane naming**, **domain-managed org membership** and **role-based sharing / org admin**). Competitor data from public product pages/documentation accessed May–June 2026 (carried forward from the July edition — **re-verify against live competitor pages before quoting externally**; their AI/mining/simulation features move fast).*

> **Rev. 2026-08-03.** Headline changes since the first August cut: **real-time co-authoring has shipped** — live presence + cursors, soft element locks, and a version guard with **automatic conflict-merge** — so **real-time co-editing is no longer a suite-only advantage**; the **BPMN 2.0 orchestration palette is now complete** (complex gateway, multiple / parallel-multiple events, call activity, and **compensation semantics executed in the simulator**); and org onboarding gained **domain-managed membership**. (The prior August edition had already closed the July gaps — **process mining and GRC** shipped and integrated, plus an **AI SOP generator** and **APQC PCF** anchoring; process mining is **no longer** a "where not to compete" item.)

---

## 1. Executive summary

| | Positioning |
|---|---|
| **Diagramatix** | A focused, self-hostable **authoring + AI + operate** platform for BPMN, ArchiMate, Value Chain, State Machine, Domain, Context, Process Context and Basic diagrams. Differentiators: an opinionated **rules-based layout engine**, a **two-phase AI generation** (edit the plan, *then* lay it out) across **multiple LLM providers**, admin-tunable AI rules, a built-in **Collaboration & Review** workflow, a **discrete-event Process Simulator**, a **process-mining module (event-log discovery, incl. object-centric/OCEL)** that can **calibrate the simulator**, an **AI SOP generator** (BPMN → Word), a **Risk & Control (GRC) matrix**, and **APQC PCF** process classification. |
| **SAP Signavio** | The process-design tier of SAP's **Business Process Transformation Suite** — modelling + process mining, governance, publishing, simulation, and **SAP Business AI** (Joule + Text-to-Process), grounded in 5,000 SAP best-practice models. Enterprise, SAP-ecosystem. |
| **ARIS** (Software AG) | A long-established enterprise **BPA / EA suite** — signature **EPC** notation plus BPMN, deep repository/governance, process mining, mature simulation, and the **ARIS AI Companion** (text-to-model, NL search, GenAI mining insights). Enterprise. |
| **PRIME BPM** | An Australian cloud BPM suite in two editions — **PRIME Modeller** and **PRIME Improver** — with a strong improvement/analysis angle (cycle time, cost, VA/NVA) and **AI add-on agents** (MapAI, AI Procedure Writer, Digital Process Analyst, PrimeGPT). |

**The short version.** Diagramatix competes head-on with all three on **authoring + AI generation**, where its editable-plan + rules-governed deterministic layout is genuinely distinctive — and it has now **closed the two gaps** the July edition still flagged. **Process mining** (real event-log discovery — the single biggest capability that was previously suite-only) ships as **DiagramatixMINER**, and it feeds the simulator (a **mine → model → simulate** loop the suites don't package as tidily for mid-market teams). A **Risk & Control (GRC) matrix** brings governance/compliance modelling in-tool. On top of that, an **AI SOP generator** (BPMN → editable → Word, with template style-adoption) goes directly at PRIME BPM's "AI Procedure Writer", and **APQC PCF** classification anchors process libraries to the industry-standard taxonomy. The simulator gained **working-time calendars** (previously a roadmap item) and **BPSim** interchange. AI generation is now **multi-provider** (Claude, plus Moonshot/Kimi, Google Gemini, Microsoft/Azure OpenAI) with **per-org usage metering and cost tracking**. The three enterprise suites still lead on **scale and maturity** — Signavio on the SAP ecosystem + the most industrialised mining; ARIS on EA breadth + EPC + repository governance + the deepest simulation engine; PRIME BPM on built-in improvement analytics — and on **configurable approval-workflow engines with full audit**. But the category story has shifted twice over: Diagramatix is now a **single self-hosted tool that authors, AI-generates, mines, simulates, documents (SOP) and governs (GRC)** — where the suites require multiple enterprise modules — and, new since the last edition, it is now **real-time collaborative** (live presence + cursors, soft element locks, and a version guard with automatic conflict-merge), closing the one lifecycle capability the suites still held.

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
| "Assist-while-you-draw" (suggest next step, NL search) | ❌ (generation is batch) | ✅ Joule NL search | ✅ NL search / NL→calc-field | ✅ PrimeGPT NL search |
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

---

## 3. Process mining — NEW (previously a gap)

The July edition listed process mining as **suite-only** and told Diagramatix "don't compete here." That has changed: Diagramatix ships **DiagramatixMINER**, an in-tool process-mining module.

| Mining capability | **Diagramatix (MINER)** | **SAP Signavio (Process Intelligence)** | **ARIS Process Mining** | **PRIME BPM** |
|---|---|---|---|---|
| Event-log **discovery** (log → process model) | ✅ discovers a BPMN/state-machine model from an event log | ✅ (industrialised, at scale) | ✅ (industrialised, at scale) | Partial (analytics, not log mining) |
| **Object-centric** event logs (OCEL) | ✅ **builds a domain model from OCEL** (object-centric) | Emerging | Emerging | ❌ |
| Conformance / variant analysis | ✅ discovery + variants | ✅ deep | ✅ deep | ❌ |
| Live connectors to source systems | ✅ **Phase 1 shipped** (import from sources; scheduler pluggable) | ✅ broad connector catalogue | ✅ broad connector catalogue | Limited |
| **Mining → Simulation calibration** | ✅ **mined data calibrates the DES simulator** (arrival rates, durations) — a *mine → model → simulate* loop | Separate modules | Separate modules | — |
| Packaged examples / one-click demo | ✅ capture/adopt **mining packages** + example library | — | — | — |
| Self-hosted, per-seat, no separate mining product | ✅ | ❌ | ❌ | ❌ |

**Verdict.** Signavio and ARIS still have the **most mature, industrial-scale** mining (huge connector catalogues, enterprise-grade conformance, years of hardening). Diagramatix's edge is **integration and accessibility**: mining lives in the *same self-hosted tool* you author, AI-generate, simulate and govern in, supports **object-centric (OCEL)** logs, and uniquely **feeds the simulator** so a discovered as-is can be turned into a simulated to-be without leaving the product. This flips the biggest single line item from the July comparison.

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

## 5. Governance, Risk & Control (GRC) — NEW

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

## 6. SOP / procedure generation — NEW

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

Now with **working-time calendars** (a July roadmap item, shipped) and **mining calibration** (§3).

| Simulation capability | **Diagramatix** | **Signavio** | **ARIS** | **PRIME BPM** |
|---|---|---|---|---|
| Engine | Discrete-event, token-flow, resource contention; Monte-Carlo ranges (p5/p50/p95) | Token-based | Discrete-event (mature, animated) | Scenario / future-state |
| Shared resource pools across *multiple* processes | ✅ portfolio capacity planning | Partial | ✅ | — |
| **As-is vs to-be** with a plain-language **cost verdict** | ✅ (% faster, throughput, $/case, **FTE freed**) | Via scenarios | Via scenarios | ✅ |
| **Live "fork-the-timeline" Operator** (intervene mid-run) | ✅ | — | ✅ animation (not interactive fork) | — |
| Working-hours **calendars / shifts** | ✅ **shipped** | ✅ | ✅ | ✅ |
| **Mining-calibrated** parameters | ✅ **mined logs → sim inputs** | Separate | Separate | — |
| Standards interchange (**BPSim**) | ✅ OMG/WfMC import + export | — | — | — |
| Self-hosted, no separate simulation module | ✅ | ❌ | ❌ | ❌ |

**Verdict.** ARIS still has the **deepest, most mature** simulation. Diagramatix's edge is the combination the suites don't package: **as-is/to-be cost verdict + interactive Operator + BPSim + calendars + mining calibration**, all self-hosted in the authoring tool.

---

## 9. Collaboration, review, publishing & access

*(**Major change since the last edition: real-time co-authoring has shipped** — the single biggest lifecycle gap the previous edition conceded to the suites is closed.)*

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

**Verdict.** Diagramatix is now a **real-time collaborative** authoring tool, not single-editor: multiple people edit the same diagram together with **live presence, cursors and soft locks**, and — crucially — a **version guard + automatic three-way merge** means concurrent saves never silently overwrite each other (edits to different shapes merge silently; only a same-shape clash is flagged). The suites still lead on a **configurable approval-workflow engine** and a **full enterprise audit log** — but **real-time co-editing is no longer their advantage**.

---

## 10. Export, interop & deployment

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| PDF / SVG export | ✅ | ✅ | ✅ | ✅ |
| **Word (.docx)** SOP + technical-notes export (template style-adoption) | ✅ | Partial | Partial | ✅ (SOPs) |
| Visio (.vsdx) round-trip | ✅ import + export (custom shapes or BPMN stencil) | Import/export | Import/export | Import (varies) |
| BPMN XML round-trip | ✅ (versioned XSD) | ✅ | ✅ | ✅ |
| **BPSim** simulation interchange | ✅ import + export | — | — | — |
| DDL ↔ Domain-model round-trip | ✅ (PostgreSQL/MySQL/SQL Server) | ❌ | ❌ | ❌ |
| **Microsoft 365 (SharePoint/OneDrive)** | ✅ save/open in SharePoint/OneDrive; link Data Objects to live docs w/ preview | Via ecosystem | Via integrations | Varies |
| Full-account portable **backup/restore** (one file) | ✅ | ❌ (SaaS) | Enterprise export | ❌ (SaaS) |
| Deployment | **Self-hosted** (Next.js + Postgres) or hosted | SaaS (SAP BTP) | SaaS / on-prem | Cloud SaaS |
| Pricing | Per-seat / self-host; **bring-your-own AI key or gateway** | Enterprise contract | Enterprise contract | Per-user + AI add-ons |

---

## 11. Where Diagramatix wins

1. **Editable-plan AI generation** with **provider choice** (5 LLMs) and **per-org cost metering** — inspect/edit the plan before layout; text → **all 7 notations**; **image/sketch → editable BPMN**.
2. **Rules-governed, publish-ready layout** (50+ rules) + **40+ live scan rules** (incl. SoD, coverage, boundary-event flow).
3. **One self-hosted tool that authors → AI-generates → mines → simulates → documents (SOP) → governs (GRC)** — where the suites need multiple enterprise modules.
4. **Process mining (DiagramatixMINER)** incl. **object-centric (OCEL)** logs, that **calibrates the simulator** — a mine→model→simulate loop.
5. **Discrete-event simulator** — as-is/to-be **cost verdict** (FTE freed), interactive "fork-the-timeline" Operator, **calendars**, **BPSim**, Monte-Carlo ranges.
6. **AI SOP generator** — diagram-grounded, per-lane role SOPs with hand-offs, non-destructive regenerate, **Word template style-adoption**.
7. **GRC** — attach risks/controls, **RCM export**, SoD + coverage checks in the authoring tool.
8. **APQC PCF** classification + **governed naming** (Entity Lists) with drift detection.
9. **Self-hosted, no ecosystem lock-in**, per-seat, **bring-your-own AI**, with **full-account portable backup**.
10. **Interop** — Visio round-trip, BPSim, DDL↔Domain, and **Microsoft 365** save/open + document links.
11. **Real-time co-authoring** — live presence + cursors, soft element locks, and a **version guard + automatic 3-way merge** so concurrent edits never silently clobber. Matches the enterprise suites on collaboration in a **self-hosted, per-seat** tool.

## 12. Where each competitor still wins

- **Signavio:** SAP best-practice grounding, the most **industrialised mining**, formal governance/publishing, Cloud ALM execution bridge, CMMN/DMN, deep SAP-GRC.
- **ARIS:** EPC + broad notation set, enterprise **EA repository** breadth, industrial mining, the **deepest/most mature simulation**, AI Companion over mining data, governance/audit depth.
- **PRIME BPM:** multi-modal AI capture (audio/video/Excel/conversation), built-in **improvement analytics**.
- **All three:** a **configurable approval-workflow engine** and a **full enterprise audit log**; and **mining maturity/scale** (connector breadth, hardened conformance) beyond a newer module. *(Real-time **co-editing** is no longer on this list — Diagramatix now has it.)*

## 13. Positioning Diagramatix

- "Describe your process — then **edit the plan before it's drawn**, on **the LLM you choose**. AI you actually control and can cost-govern."
- "**Publish-ready** BPMN/ArchiMate in seconds, laid out by 50+ rules — no clean-up."
- "**Mine it, model it, simulate it** — discover the real process from logs (incl. object-centric), then simulate the redesign with a **cost verdict**, in one self-hosted tool."
- "**Document it (SOP → Word)** and **govern it (risk-control matrix, APQC)** — the operate layer, not just an editor."
- "Round-trips **Visio, BPMN XML, BPSim**; saves to **SharePoint/OneDrive**; **self-hosted**, per-seat — no enterprise contract."

Where **not** to compete: **industrial-scale mining maturity** (connector catalogues, hardened conformance at enterprise scale), a **configurable enterprise approval-workflow engine + full audit**, **SAP-ecosystem execution**, deep **enterprise GRC controls-testing**, and (for ARIS) **EPC + EA repository breadth** and the most mature simulation. *(Real-time co-editing is now a Diagramatix strength, not a gap.)*

---

## Sources

- **Diagramatix codebase audit** — `c:\Git\Diagramatix\diagramatix\` (current branch, **August 2026**): `app/lib/mining/` (discovery, OCEL, mining→sim calibration), `app/lib/sop/`, `app/lib/riskControls/` (RCM), `app/lib/pcf/` (APQC), `app/lib/archimate/`, `app/lib/simulation/` (calendar, BPSim), `app/lib/ai/` (multi-provider models, pricing, metering).
- Competitor sources (May–June 2026, carried forward — **re-verify before external use**):
  - [SAP Signavio launches AI Process Modeler, Text-to-Process (Mar 2025)](https://news.sap.com/2025/03/sap-signavio-launches-ai-process-modeler-text-to-process/) · [Text-to-Process V2](https://community.sap.com/t5/technology-blog-posts-by-sap/ai-powered-modeling-gets-an-upgrade-text-to-process-v2-in-sap-signavio-lab/ba-p/14263094) · [Signavio Process Modeler](https://www.signavio.com/products/process-modeler/)
  - [ARIS AI Companion](https://aris.com/aris-ai-companion/) · [ARIS re-defines AI Process Intelligence (Nov 2024)](https://newscenter.softwareag.com/en/news-stories/press-releases/2024/1113-aris-redefines-ai-process-intelligence.html)
  - [PRIME BPM AI agents](https://www.primebpm.com/bpm-ai-agents) · [PRIME Modeller](https://www.primebpm.com/business-process-mapping-modeling-software)
