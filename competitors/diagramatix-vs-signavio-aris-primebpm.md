# Diagramatix vs SAP Signavio, ARIS & PRIME BPM — Feature & AI Comparison

*Compiled: June 2026. Diagramatix data from the current codebase (export schema v1.25; BPMN + 6 other diagram types, plus a built-in discrete-event **Process Simulator**, a **publishing & review lifecycle**, **Microsoft 365 (SharePoint/OneDrive) integration**, **governed pool/lane naming** and **role-based sharing / org admin**). Competitor data from public product pages and documentation accessed May–June 2026 — see Sources. Competitor AI and simulation features in particular are evolving rapidly; verify against the live product pages before quoting externally.*

> Supersedes `diagramatix-vs-sap-signavio.md` (Signavio-only, written at Diagramatix v1.8.x).

---

## 1. Executive summary

| | Positioning |
|---|---|
| **Diagramatix** | A focused, self-hostable **authoring + AI generation** tool for BPMN, Value Chain, State Machine, Domain, Context, Process Context and Basic diagrams. Differentiators: an opinionated **rules-based layout engine**, a unique **two-phase AI generation** (edit the plan, *then* lay it out), admin-tunable AI rules, a built-in **Collaboration & Review** workflow, and a built-in **discrete-event Process Simulator** (capacity planning, **as-is vs to-be cost comparison**, live "fork-the-timeline" Operator interventions, BPSim-aligned). |
| **SAP Signavio** | The process-design tier of SAP's **Business Process Transformation Suite**. Modelling plus process mining, governance, publishing, simulation, and **SAP Business AI** (Joule + Text-to-Process), grounded in 5,000 SAP best-practice models. Enterprise, SAP-ecosystem. |
| **ARIS** (Software AG) | A long-established enterprise **BPA / EA suite**. Signature **EPC** notation plus BPMN, deep repository/governance, process mining, and the **ARIS AI Companion** (text-to-model, NL search, GenAI mining insights). Enterprise. |
| **PRIME BPM** | A cloud BPM suite (Australian) in two editions — **PRIME Modeller** and **PRIME Improver** — with a strong improvement/analysis angle (cycle time, cost, VA/NVA) and a set of **AI add-on agents** (MapAI, AI Procedure Writer, Digital Process Analyst, PrimeGPT). |

**The short version.** Diagramatix competes head-on with all three on the *authoring + AI-generation* experience, where its editable-plan + rules-governed deterministic layout is genuinely distinctive. **New since the last edition: a built-in discrete-event Simulator** moves Diagramatix into a category — process simulation, with as-is/to-be cost cases — that was previously the enterprise suites' alone, and adds touches they don't combine (a live, interactive "fork-the-timeline" Operator, a plain-language cost/FTE verdict, BPSim import/export, all self-hosted). Alongside it, Diagramatix has filled in the *operational* layer that small-and-mid teams need — a **publishing & review lifecycle**, **role-based project sharing + an org-admin tier**, **governed pool/lane naming** (its lightweight answer to an enterprise glossary), and **Microsoft 365 (SharePoint/OneDrive)** integration — so it's no longer "just an editor." The three enterprise suites still each win on what *surrounds* modelling at scale — Signavio on the SAP ecosystem + mining, ARIS on EA breadth + EPC + repository governance + a deeper, more mature simulation engine, PRIME BPM on built-in process-improvement analytics. None of the three is self-hostable per-seat the way Diagramatix is. Process **mining** (real event-log discovery) remains a suite-only capability.

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
| Glossary / **governed naming** (reusable term dictionary) | ✅ **Entity Lists** — pools/lanes named from a maintained Org → Unit → Team → Role hierarchy + External-Participant + IT-Systems lists (org-master → editable project copy) | ✅ **Dictionary** (central glossary of reusable terms) | ✅ Repository-level naming governance | Partial |

**Verdict.** The three suites have deeper formal notation coverage (CMMN/DMN; EPC for ARIS) and more formal validation. Diagramatix covers the BPMN you'll use day-to-day, adds **governed pool/lane naming** (Entity Lists — its lightweight take on Signavio's Dictionary / an ARIS repository), and pairs it all with layout/AI features the others don't.

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

## 5. Collaboration, Review & Access

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Collaboration Groups (invite by name/email, accept/decline, transfer ownership) | ✅ | ✅ (enterprise users/teams) | ✅ | ✅ |
| **Role-based project sharing** (View / Edit, per project) | ✅ owner grants View/Edit by name/email; per-diagram "Diagram Owner" accountability | ✅ enterprise RBAC | ✅ enterprise RBAC | ✅ |
| **Organisation admin** + sharing policy | ✅ **OrgAdmin role** with share oversight, per-org cross-org-sharing toggle, and silent admin membership | ✅ enterprise admin/governance | ✅ enterprise admin/governance | ✅ |
| Send a diagram for review with objective + due date | ✅ | Via Governance workflows | Via governance | Via workflows |
| In-diagram review comments (pink note auto-linked to an element, tagged per reviewer) | ✅ | ✅ Commenting | ✅ Commenting | ✅ |
| Reviewer status tracking (pending → submitted → approved / declined), re-submit & finish rounds | ✅ Built-in, dashboard-tracked, colour-coded by due date | ✅ Formal BPMN-based approval workflows (Process Governance) | ✅ Governance/release workflows | ✅ |
| **Versioned publishing** — immutable published versions, current-version pointer, supersedure | ✅ | ✅ | ✅ | ✅ |
| **Publish to a business-user audience** — read-only viewer + cross-diagram link traversal | ✅ **Publication bundles** to *explicit* audiences, **invite-by-email**, dedicated viewer | ✅ (portal/publishing) | ✅ (publishing) | ✅ |
| **Scheduled re-review** — review cadence + automated review-due reminders | ✅ owner-set next-review date / cadence; **cron review-due notifications** | ✅ | ✅ | ✅ |
| Real-time multi-user co-editing | ❌ Single-editor | ✅ | ✅ | ✅ |
| Formal approval-*workflow* engine + enterprise audit log | **Mid** — draft→published lifecycle, versioned + superseded, bundle publishing to audiences, review-cadence reminders; *not* a configurable approval-workflow engine or full audit log | ✅ Deep (Process Governance + audit) | ✅ Deep (repository governance + audit) | ✅ |

**Verdict.** Diagramatix is **mid-tier, not basic, on collaboration / governance**: a genuine review loop (send → comment → approve/decline → re-submit → finish), a real publishing lifecycle (draft→published, immutable/superseded versions, **publication bundles to business-user audiences with a read-only viewer**, scheduled re-review reminders), *and* an access layer — **role-based project sharing plus an OrgAdmin tier with share oversight and per-org sharing policy**. That closes most of the small-and-mid-team gap. The suites still win on **real-time co-editing**, a **configurable BPMN approval-workflow engine**, and a **full enterprise audit log**.

---

## 6. Process mining, simulation & execution

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Process **mining** (event-log discovery / conformance) | ❌ | ✅ Process Intelligence | ✅ ARIS Process Mining | Partial (analytics, not log mining) |
| Discrete-event **simulation** | ✅ **Built-in DES engine — see §6.1** | ✅ | ✅ (mature, animated) | ✅ (future-state / improvement scenarios) |
| Cost & capacity analysis (cycle time, cost, VA/NVA) | ✅ **Cost-per-case, total cost, utilisation, bottleneck ranking — quantified by the simulator** (+ Value Analysis badges) | Via mining KPIs / simulation | Via simulation / mining KPIs | ✅ **Core strength** (Improver edition) |
| Transfer to execution / workflow engine | ❌ | ✅ Cloud ALM bridge | ✅ | Limited |

**Verdict.** Process **mining** (discovering the real process from system logs) is still suite-only — Signavio and ARIS lead, and Diagramatix doesn't compete there. But **simulation is no longer a gap**: Diagramatix now ships a full discrete-event engine that quantifies cost, capacity and the case for a redesign (§6.1). ARIS retains the deepest, most mature simulation (animation, advanced resource/calendar models); Diagramatix's edge is *accessibility + distinctive touches* in the same tool you author and AI-generate in.

### 6.1 Simulation — detailed

Diagramatix has moved from "design-time only" to a **built-in event-based (discrete-event) Process Simulator**: work items flow over a simulated clock, tasks seize limited team capacity so realistic queues and wait times *emerge from contention*, and Monte-Carlo replications give ranges (mean / p50 / p95), not a single misleading number. It runs in the same tool, with no separate enterprise module.

| Simulation capability | **Diagramatix** | **Signavio** | **ARIS** | **PRIME BPM** |
|---|---|---|---|---|
| Engine | Discrete-event, token-flow, resource contention; Monte-Carlo ranges (p5/p50/p95) | Token-based | Discrete-event (mature, animated) | Scenario / future-state analysis |
| Shared resource pools across *multiple* processes (portfolio) | ✅ One team pool shared across diagrams → genuine cross-process capacity planning | Partial | ✅ | — |
| **As-is vs To-be** comparison with a cost **verdict** | ✅ **Pin scenarios to different process variants; plain-language verdict** (e.g. "28% faster, +12% throughput, $4.2k less per case, frees ~1.4 FTE") | Via scenarios | Via scenarios | ✅ future-state cost/time |
| Cost modelling (cost/hour → cost-per-case, total cost, savings) | ✅ | ✅ | ✅ | ✅ |
| **Live, interactive replay with mid-run intervention** | ✅ **"Fork the timeline" Operator** — add capacity / inject a surge *mid-run* and re-run deterministically; animated token replay + utilisation heatmap | — | ✅ animation (not an interactive fork) | — |
| Subprocess roll-up incl. **linked diagrams** | ✅ inline *and* linked drill-down (nested + parallel instances isolated) | ✅ | ✅ | partial |
| Planned timed interventions (capacity surge, outage, demand spike, work injection) | ✅ | — | partial | — |
| Standards-based interchange (**BPSim**) | ✅ **OMG/WfMC BPSim import + export** | — | — | — |
| Worked-example library to learn / demo from (one-click load) | ✅ | — | — | — |
| Working-hours **calendars** / shift models | ⏳ roadmap | ✅ | ✅ | ✅ |
| Self-hosted, per-seat, *no separate simulation module* | ✅ | ❌ | ❌ | ❌ |

**What's distinctive about Diagramatix's simulation.** Three things the suites don't combine: (1) an **as-is vs to-be** comparison that pins each scenario to a *structurally different* process variant and returns a **plain-language cost verdict** (% faster, throughput, $/case, FTE freed) — turning "X% faster" into a business case; (2) a **live, interactive Operator** that lets you intervene *during* a slowed-clock replay ("fork the timeline") and watch a backlog clear or build, deterministically; (3) **BPSim** (the OMG/WfMC standard) import/export, so simulation parameters interchange with other tools. All of it is **self-hosted** and integrated with authoring + AI — no enterprise contract, no separate module.

**Where the suites still lead on simulation.** ARIS in particular has a **deeper, more mature** engine — richer resource models, working-time **calendars/shifts**, and long-established animation. Diagramatix's calendar/shift modelling is on the roadmap (it currently treats capacity as continuously available). And neither Diagramatix nor a single simulation run substitutes for **process mining**, where the suites discover the *actual* as-is process from event logs rather than relying on modeller-entered estimates.

---

## 7. Export, interop & deployment

| Feature | Diagramatix | Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| PDF / SVG export | ✅ (scalable PDF) | ✅ | ✅ | ✅ |
| Visio (.vsdx) round-trip | ✅ **Import + export** (custom Visio Shapes file or standard BPMN stencil) | Import/export | Import/export | Import (varies) |
| BPMN XML round-trip | ✅ (versioned XSD, schema v1.25) | ✅ | ✅ | ✅ |
| DDL ↔ Domain-model round-trip | ✅ (PostgreSQL / MySQL / SQL Server) | ❌ | ❌ | ❌ |
| **Microsoft 365 (SharePoint / OneDrive)** integration | ✅ **Sign in with Microsoft; save / open diagram files in SharePoint or OneDrive; link Data Objects/Stores to live documents with an embedded preview** | Via SAP + MS ecosystem (varies) | Via integrations | Varies |
| **Full-account portable backup / restore** | ✅ **one `.diag` file = every project, diagram, template + prefs; restore anywhere** (with live-progress guided backups) | ❌ (SaaS-managed) | Enterprise export | ❌ (SaaS-managed) |
| Deployment | **Self-hosted** (Next.js + Postgres) or hosted | SaaS (SAP BTP) | SaaS / on-prem (enterprise) | Cloud SaaS |
| Pricing model | Per-seat / self-host; free for internal use | Enterprise contract | Enterprise contract | Per-user subscription + AI add-ons |

---

## 8. Where Diagramatix wins

1. **Editable-plan AI generation** — the only one of the four that lets you inspect and edit the AI's structured plan *before* layout, then re-plan freely. The plan JSON is the source of truth.
2. **Rules-governed, publish-ready layout** — 50+ codified rules produce clean diagrams from AI output with no manual tidy-up; the generation rules are admin-editable.
3. **Built-in discrete-event Simulator** — capacity planning + **as-is vs to-be cost comparison with a plain-language verdict**, a live "fork-the-timeline" Operator, planned interventions, Monte-Carlo ranges, and **BPSim** import/export — all self-hosted, in the same tool, with no separate enterprise simulation module.
4. **Interaction polish** — drop-on-connector split, insert-space marker, smart auto-connect, force-connect, hand-drawn mode.
5. **Multi-notation in one focused tool** — BPMN + 6 other types without enterprise-suite weight.
6. **Self-hosted, no ecosystem lock-in**, per-seat pricing — with a **full-account portable backup** (one `.diag` file, restore anywhere) the SaaS suites can't match.
7. **Visio round-trip** with a purpose-built shapes file, plus the niche **DDL ↔ Domain** round-trip.
8. **Collaboration, publishing & access lifecycle** — send-for-review rounds, draft→published versioning, publication bundles to a business-user audience (invite-by-email + read-only viewer), scheduled re-review reminders, **role-based sharing and an OrgAdmin tier**.
9. **Microsoft 365 integration** — Microsoft sign-in plus SharePoint/OneDrive save-open and Data-Object file links with embedded preview.
10. **Governed naming** — consistent pool/lane names drawn from a maintained Org/Participant/IT-Systems library (Entity Lists), adopted per project.

## 9. Where each competitor wins

- **Signavio:** SAP best-practice grounding for AI, **process mining**, formal governance/publishing, Cloud ALM execution bridge, CMMN/DMN. (Simulation exists, but Diagramatix now competes here.)
- **ARIS:** EPC + broad notation set, enterprise repository & EA breadth, **process mining**, a **deeper/more mature simulation engine** (calendars, advanced resource models, animation), AI Companion that also works over mining data, governance/audit depth.
- **PRIME BPM:** multi-modal AI capture (audio/video/Excel/conversation → map), built-in improvement analytics (cost/time/VA-NVA, future-state simulation), SOP generation.

## 10. Positioning Diagramatix

- "Describe your process — then **edit the plan before it's drawn**. AI generation you actually control."
- "**Publish-ready BPMN in seconds**, laid out by 50+ rules you can tune — no manual clean-up."
- "Model it, then **simulate it** — capacity, bottlenecks, and the **cost case for a redesign** (as-is vs to-be), without a separate enterprise tool."
- "Round-trips **Visio**, BPMN XML and **BPSim**; saves to **SharePoint/OneDrive**; **self-hosted**, per-seat — no enterprise contract."
- "**Governed naming**, **role-based sharing** and an **org-admin tier** — the operational layer, not just an editor."
- "All the authoring, AI, review, publishing **and simulation** a team needs — none of the suite bloat."

Where **not** to compete: **process mining / real event-log analysis** (the suites discover the actual process from logs; Diagramatix simulates modeller-entered estimates), formal enterprise governance lifecycle, SAP-ecosystem execution, deep/mature simulation with shift calendars (ARIS), and (for ARIS) EPC + EA repository breadth.

---

## Sources

- Diagramatix codebase audit — `c:\Git\Diagramatix\diagramatix\` (current branch, June 2026; export schema v1.25; 26 published feature-catalog entries).
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
