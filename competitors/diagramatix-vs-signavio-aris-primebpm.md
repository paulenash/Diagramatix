# Diagramatix vs SAP Signavio, ARIS & PRIME BPM — Feature & AI Comparison

*Compiled: May 2026. Diagramatix data from the current codebase (export schema v1.15; BPMN + 6 other diagram types + Collaboration & Review). Competitor data from public product pages and documentation accessed May 2026 — see Sources. Competitor AI features in particular are evolving rapidly; verify against the live product pages before quoting externally.*

> Supersedes `diagramatix-vs-sap-signavio.md` (Signavio-only, written at Diagramatix v1.8.x).

---

## 1. Executive summary

| | Positioning |
|---|---|
| **Diagramatix** | A focused, self-hostable **authoring + AI generation** tool for BPMN, Value Chain, State Machine, Domain, Context, Process Context and Basic diagrams. Differentiators: an opinionated **rules-based layout engine**, a unique **two-phase AI generation** (edit the plan, *then* lay it out), admin-tunable AI rules, and a built-in **Collaboration & Review** workflow. |
| **SAP Signavio** | The process-design tier of SAP's **Business Process Transformation Suite**. Modelling plus process mining, governance, publishing, simulation, and **SAP Business AI** (Joule + Text-to-Process), grounded in 5,000 SAP best-practice models. Enterprise, SAP-ecosystem. |
| **ARIS** (Software AG) | A long-established enterprise **BPA / EA suite**. Signature **EPC** notation plus BPMN, deep repository/governance, process mining, and the **ARIS AI Companion** (text-to-model, NL search, GenAI mining insights). Enterprise. |
| **PRIME BPM** | A cloud BPM suite (Australian) in two editions — **PRIME Modeller** and **PRIME Improver** — with a strong improvement/analysis angle (cycle time, cost, VA/NVA) and a set of **AI add-on agents** (MapAI, AI Procedure Writer, Digital Process Analyst, PrimeGPT). |

**The short version.** Diagramatix competes head-on with all three on the *authoring + AI-generation* experience, where its editable-plan + rules-governed deterministic layout is genuinely distinctive. The three enterprise suites each win decisively on what surrounds modelling — Signavio on the SAP ecosystem + mining, ARIS on EA breadth + EPC + repository governance, PRIME BPM on built-in process-improvement analytics. None of the three is self-hostable per-seat the way Diagramatix is.

---

## 2. AI Generation — detailed comparison

This is the headline. All four products now do "describe a process → get a BPMN diagram", but they differ sharply in **how much control you get over the result** and **what the AI is grounded in**.

| Capability | **Diagramatix** | **SAP Signavio** | **ARIS (AI Companion)** | **PRIME BPM (MapAI)** |
|---|---|---|---|---|
| Natural-language → BPMN | ✅ Two-phase: Plan (Sonnet) → editable plan → Apply layout | ✅ "Text to Process" (V2 experimental: larger inputs, more complex processes) | ✅ Text description → structured model | ✅ "Generate a BPMN map in minutes from text" |
| Target notations from AI | BPMN (2-phase) + one-shot for State Machine, Domain, Context, Process Context, Value Chain | BPMN | **EPC or BPMN** | BPMN-compliant maps |
| Other input modalities | PDF + text-file attachments fed into the prompt | Text | Text | **Excel, text, audio, video, even a conversation** |
| Editable *intermediate plan* before layout | ✅ **Unique** — 4 live-synced tabs (Pools/Lanes, Elements, Connectors, Raw JSON); nothing is positioned until you Apply | ❌ Output drops onto the canvas; you edit the diagram | ❌ Generates the model; you edit it | ❌ Generates the map; you edit it |
| Re-plan / iterate before committing | ✅ Re-send to the model freely; plan is the source of truth | Re-prompt regenerates | Re-prompt regenerates | Re-generate |
| Saved prompts (with the plan persisted) | ✅ Prompt + last plan JSON saved together | Not documented | Not documented | Not documented |
| User/admin-tunable generation rules | ✅ **Admin-editable AI Rules per diagram type**; green rules steer the model, red rules are enforced by the layout engine | Limited (recommendations from SAP best practices) | Not documented as user-editable | Not documented as user-editable |
| Grounding / knowledge base | The model + your rules; no external content library | ✅ **5,000 SAP best-practice models** + Process AI recommendations | ARIS repository + GenAI on Process Mining | Its own BPM methodology + guardrails |
| Deterministic, publish-ready auto-layout of AI output | ✅ 50+ codified layout rules run *after* the plan is approved | Basic auto-layout | Standard layout | Auto-map (auto-corrects gaps) |
| "AI-assisted modelling while you draw" (suggest next step, NL search) | ❌ (generation is batch, not inline) | ✅ Joule NL search across diagrams/dictionary | ✅ NL search, NL→calculated-field code | ✅ PrimeGPT NL search & reporting |
| Claimed time saving | "Seconds" to a laid-out diagram | Up to **80%** less modelling time | — | Up to **90%** less mapping time |
| Underlying model | Anthropic **Claude** (Sonnet for the plan) | SAP Business AI / Joule | Software AG GenAI | Not disclosed |

### What each one is really good at

**Diagramatix — control + clean layout.** The defining difference is the **two-phase flow**: the model returns a *structured plan* (pools, lanes, tasks, gateways, connections) that you can inspect and edit across four synchronised tabs *before any geometry is computed*. When you hit **Apply Layout**, a deterministic engine of 50+ rules positions everything for a publish-ready result. Generation behaviour is **governed by admin-editable rules** split into "green" (sent to the model to steer structure) and "red" (enforced locally by the layout engine), so an organisation can encode its own conventions. Recent additions include first-class **event-based gateways** (the AI emits them and the engine wires them like an exclusive split/merge) and the **Admin → AI Plan Format** viewer that shows the exact prompt the model receives. Trade-off: generation is **batch**, not an inline "assist-as-you-type" companion, and there's no external best-practice content library.

**SAP Signavio — enterprise grounding.** "Text to Process" turns a written description into BPMN, and its standout is **grounding in 5,000 SAP best-practice models** plus Process AI recommendations — useful when you're modelling standard ERP-adjacent processes. **Joule** adds natural-language search across diagrams and the dictionary. The AI output goes straight to the canvas (no editable intermediate-plan step is documented), and customisation of generation rules is limited to its recommendation engine.

**ARIS — text-to-model across notations + analytics.** The **AI Companion** generates structured models from text and is notable for targeting **EPC *or* BPMN** (EPC is ARIS's heritage notation). Beyond generation it leans into **analytics-side GenAI**: natural-language search of the repository, turning NL into calculated-field code, and generating visual insights over Process Mining data. Strong where the value is the *repository and process intelligence*, not just the drawing.

**PRIME BPM — multi-modal capture + improvement.** **MapAI** is the most flexible on *input*: it can build a BPMN map from **Excel, text, audio, video, or a recorded conversation**, claiming ~90% less mapping time and auto-correcting process gaps. It's paired with improvement-oriented agents — **AI Procedure Writer** (SOPs from recordings/conversations), **Digital Process Analyst** (inefficiency/automation analysis with 37+ best-practice guardrails; *Improver edition only*), and **PrimeGPT** (NL search/reporting). The AI features are **add-ons** to the editions.

### AI verdict

- Pick **Diagramatix** if you want **maximum control over the generated structure and a clean, rules-driven layout you don't have to tidy up**, with generation conventions you can edit yourself.
- Pick **Signavio** if your processes map onto **SAP best practices** and you want generation tied into the SAP ecosystem.
- Pick **ARIS** if you need **EPC as well as BPMN** and AI that also works over a **process-mining/repository** backend.
- Pick **PRIME BPM** if your starting point is **messy real-world capture** (interviews, recordings, spreadsheets) and you want the AI to also drive **process improvement**.

Diagramatix is the only one of the four whose AI exposes an **editable intermediate plan** and whose **layout of AI output is governed by an explicit, user-editable rule set**.

---

## 3. BPMN modelling

| Feature | Diagramatix | SAP Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| BPMN 2.0 notation | Core shapes + common markers (the 95% you use) | ✅ Full BPMN 2.0 | ✅ BPMN 2.0 (+ EPC, UML, other notations) | ✅ BPMN-compliant maps |
| Gateways incl. event-based | ✅ exclusive / parallel / inclusive / **event-based** (emitted by AI + wired by engine) | ✅ All four | ✅ All four | ✅ |
| Pools / lanes / sub-lanes; white-box + black-box | ✅ Nested; black-box = external or system | ✅ | ✅ | ✅ |
| Subprocesses (collapsed + expanded) incl. event subprocess | ✅ Auto-detected event subprocess, boundary events on 4 sides | ✅ | ✅ | ✅ |
| CMMN / DMN | ❌ | ✅ DMN + CMMN | ✅ (DMN; broad notation set) | ❌ |
| EPC (event-driven process chains) | ❌ | ❌ | ✅ **Signature notation** | ❌ |
| Validation / modelling conventions | Gateway matching + layout-rule constraints | ✅ Real-time syntax + configurable rule packs | ✅ Repository-level conventions | ✅ Methodology checks |
| Best-practice / reusable content library | Templates (built-in + personal) | ✅ 5,000+ models | ✅ Reference models | ✅ Methodology + frameworks |

**Verdict.** The three suites have deeper formal notation coverage (CMMN/DMN; EPC for ARIS) and more formal validation. Diagramatix covers the BPMN you'll use day-to-day and pairs it with layout/AI features the others don't.

---

## 4. Layout & routing

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Deterministic, rules-based auto-layout | ✅ **50+ codified rules**; tuned for publish-ready output (esp. from AI) | Basic auto-layout | Standard auto-layout | Auto-map |
| Orthogonal routing with obstacle avoidance | ✅ | ✅ | ✅ | ✅ |
| Direct + curvilinear per-connector | ✅ | Partial (style-level) | Partial | — |
| Gateway-branch / nested-gateway placement rules | ✅ Asymmetric stacking, paired-merge Y-alignment | Manual / basic | Manual / basic | — |
| Drop-on-connector splits the flow | ✅ | ❌ (not documented) | ❌ (not documented) | ❌ (not documented) |
| Insert-space marker (push content to make room) | ✅ 4-directional | ❌ | ❌ | ❌ |

**Verdict.** **Diagramatix's layout is its strongest single differentiator.** For the enterprise suites auto-layout is a utility; for Diagramatix it's a design philosophy aimed at zero manual tidy-up — which is exactly what makes its AI output usable immediately.

---

## 5. Collaboration & Review

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Collaboration Groups (invite by name/email, accept/decline, transfer ownership) | ✅ | ✅ (enterprise users/teams) | ✅ | ✅ |
| Send a diagram for review with objective + due date | ✅ | Via Governance workflows | Via governance | Via workflows |
| In-diagram review comments (pink note auto-linked to an element, tagged per reviewer) | ✅ | ✅ Commenting | ✅ Commenting | ✅ |
| Reviewer status tracking (pending → submitted → approved / declined), re-submit & finish rounds | ✅ Built-in, dashboard-tracked, colour-coded by due date | ✅ Formal BPMN-based approval workflows (Process Governance) | ✅ Governance/release workflows | ✅ |
| Real-time multi-user co-editing | ❌ Single-editor | ✅ | ✅ | ✅ |
| Formal approval/publishing lifecycle + audit | Basic (review rounds + version history) | ✅ Deep (Process Governance + audit) | ✅ Deep (repository governance + audit) | ✅ |

**Verdict.** Diagramatix now has a **genuine, lightweight review loop** (send → comment → approve/decline → re-submit → finish), which closes a gap versus the suites for small-team use. The suites still win on **real-time co-editing** and **formal, audited approval/publishing governance**.

---

## 6. Process mining, simulation & execution

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Process mining (event-log discovery / conformance) | ❌ | ✅ Process Intelligence | ✅ ARIS Process Mining | Partial (analytics, not log mining) |
| Simulation (token-flow / scenario) | ❌ | ✅ | ✅ | ✅ (improvement scenarios, future-state) |
| Built-in process-improvement analytics (cycle time, cost, VA/NVA) | ✅ Value Analysis badges + bottleneck overlay (manual mark-up) | Via mining KPIs | Via mining KPIs | ✅ **Core strength** (Improver edition) |
| Transfer to execution / workflow engine | ❌ | ✅ Cloud ALM bridge | ✅ | Limited |

**Verdict.** This is where the suites are in a different category. Diagramatix is design-time only and relies on the modeller to mark up value/bottlenecks; Signavio and ARIS discover the real process from logs; PRIME BPM's Improver edition turns analysis into quantified improvement cases.

---

## 7. Export, interop & deployment

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| PDF / SVG export | ✅ (scalable PDF) | ✅ | ✅ | ✅ |
| Visio (.vsdx) round-trip | ✅ **Import + export** (custom Visio Shapes file or standard BPMN stencil) | Import/export | Import/export | Import (varies) |
| BPMN XML round-trip | ✅ (versioned XSD, schema v1.15) | ✅ | ✅ | ✅ |
| DDL ↔ Domain-model round-trip | ✅ (PostgreSQL / MySQL / SQL Server) | ❌ | ❌ | ❌ |
| Deployment | **Self-hosted** (Next.js + Postgres) or hosted | SaaS (SAP BTP) | SaaS / on-prem (enterprise) | Cloud SaaS |
| Pricing model | Per-seat / self-host; free for internal use | Enterprise contract | Enterprise contract | Per-user subscription + AI add-ons |

---

## 8. Where Diagramatix wins

1. **Editable-plan AI generation** — the only one of the four that lets you inspect and edit the AI's structured plan *before* layout, then re-plan freely. The plan JSON is the source of truth.
2. **Rules-governed, publish-ready layout** — 50+ codified rules produce clean diagrams from AI output with no manual tidy-up; the generation rules are admin-editable.
3. **Interaction polish** — drop-on-connector split, insert-space marker, smart auto-connect, force-connect, hand-drawn mode.
4. **Multi-notation in one focused tool** — BPMN + 6 other types without enterprise-suite weight.
5. **Self-hosted, no ecosystem lock-in**, per-seat pricing.
6. **Visio round-trip** with a purpose-built shapes file, plus the niche **DDL ↔ Domain** round-trip.
7. **Built-in lightweight review loop** for small teams.

## 9. Where each competitor wins

- **Signavio:** SAP best-practice grounding for AI, process mining, simulation, formal governance/publishing, Cloud ALM execution bridge, CMMN/DMN.
- **ARIS:** EPC + broad notation set, enterprise repository & EA breadth, process mining, AI Companion that also works over mining data, governance/audit depth.
- **PRIME BPM:** multi-modal AI capture (audio/video/Excel/conversation → map), built-in improvement analytics (cost/time/VA-NVA, future-state simulation), SOP generation.

## 10. Positioning Diagramatix

- "Describe your process — then **edit the plan before it's drawn**. AI generation you actually control."
- "**Publish-ready BPMN in seconds**, laid out by 50+ rules you can tune — no manual clean-up."
- "Round-trips **Visio** and BPMN XML; **self-hosted**, per-seat — no enterprise contract."
- "All the authoring, AI and review a team needs — none of the suite bloat."

Where **not** to compete: process mining / real event-log analysis, formal enterprise governance lifecycle, SAP-ecosystem execution, and (for ARIS) EPC + EA repository breadth.

---

## Sources

- Diagramatix codebase audit — `c:\Git\Diagramatix\diagramatix\` (current branch, May 2026; export schema v1.15).
- [SAP Signavio launches AI-assisted Process Modeler, Text-to-Process (SAP News, Mar 2025)](https://news.sap.com/2025/03/sap-signavio-launches-ai-process-modeler-text-to-process/)
- [SAP Business AI release highlights Q1 2026 (SAP News)](https://news.sap.com/2026/04/sap-business-ai-release-highlights-q1-2026/)
- [Text to Process V2 in SAP Signavio (SAP Community)](https://community.sap.com/t5/technology-blog-posts-by-sap/ai-powered-modeling-gets-an-upgrade-text-to-process-v2-in-sap-signavio-lab/ba-p/14263094)
- [SAP Signavio Process Modeler product page](https://www.signavio.com/products/process-modeler/)
- [ARIS AI Companion](https://aris.com/aris-ai-companion/)
- [Unleash the Power of AI in Process Modeling with the ARIS AI Companion](https://aris.com/resources/ai-based-model-gen/)
- [ARIS re-defines AI-driven Process Intelligence (Software AG news, Nov 2024)](https://newscenter.softwareag.com/en/news-stories/press-releases/2024/1113-aris-redefines-ai-process-intelligence.html)
- [PRIME BPM — AI agents (MapAI, AI Procedure Writer, Digital Process Analyst, PrimeGPT)](https://www.primebpm.com/bpm-ai-agents)
- [PRIME Modeller — AI-powered business process mapping](https://www.primebpm.com/business-process-mapping-modeling-software)
- [PRIME BPM home](https://www.primebpm.com/)
