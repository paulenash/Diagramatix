---
title: "Diagramatix vs Signavio, ARIS, PRIME BPM, Pega, Appian & Microsoft"
subtitle: "Feature & AI comparison — September 2026 edition"
date: "24 September 2026"
---

# Diagramatix vs SAP Signavio, ARIS, PRIME BPM, Pega, Appian & Microsoft — Feature & AI Comparison

**Date: 24 September 2026** · September 2026 edition · product 2.12 · export SCHEMA_VERSION 49

*Diagramatix data read from the current codebase on 24 September 2026. **All six competitors verified against live vendor pages and documentation on 24 September 2026** — see Sources. Competitor capability moves fast, particularly on AI; **re-verify before quoting externally.** Where a competitor's behaviour could not be established from public documentation this document says so rather than guessing — and where a figure an earlier edition quoted can no longer be substantiated by the vendor, it has been withdrawn rather than repeated.*

---

## 1. Who is actually in the room

Seven products, but not one category. A buyer comparing them is usually deciding between three different purchases, and the comparison is only honest if that is said first.

| | What it actually is | Category |
|---|---|---|
| **Diagramatix** | A self-hostable **authoring + AI + operate** platform across **nine notations** — BPMN, EPC, ArchiMate, Standard Flowchart, Value Chain, State Machine, Domain, Context and Process Context. Rules-based layout with measured readability, two-phase AI generation, process mining, discrete-event simulation, GRC, APQC PCF, SOP generation, an ARIS migration path and a partner Process API. | Process authoring & analysis |
| **SAP Signavio** | The process-design tier of SAP's Business Process Transformation Suite — modelling, mining, governance, publishing, simulation, and SAP Business AI. **Joule went generally available on 10 February 2026**; grounded in SAP best-practice content. | Process authoring & analysis (enterprise) |
| **ARIS** (**SAG Aris GmbH**) | Long-established enterprise BPA/EA suite — signature **EPC** plus BPMN, deep repository governance, process mining, the most mature simulation engine here, ARIS AI Companion. **No longer part of Software AG**: spun out as an independent company, announced January 2025. | Process authoring & analysis (enterprise) |
| **PRIME BPM** | Australian cloud BPM suite in two editions (Modeller, Improver) with a strong improvement angle — cycle time, cost, VA/NVA — and **four AI agents**: MapAI, AI Procedure Writer, Digital Process Analyst and PrimeGPT, marketed as a "virtual OPEX team". | Process authoring & analysis (mid-market) |
| **Pega** | An enterprise **execution** platform — case management, decisioning, RPA — fronted by **Pega GenAI Blueprint**, which turns a description, a legacy system or a mined process into a working Pega application design. Leader, 2026 Gartner MQ for Process Intelligence Platforms. | Build-and-run automation |
| **Appian** | An enterprise **execution** platform — low-code apps, case management, RPA — with **Process HQ** (mining over a data fabric) and an AI family of Composer, Agent Studio, DocCenter and AI Copilot. | Build-and-run automation |
| **Microsoft** | Not a BPM product but a **collection you already own**: Power Automate (cloud flows, desktop RPA, process mining), Power Apps, Power BI, Copilot Studio agents, Dataverse, Fabric, SharePoint/Teams, and **Visio** for the drawing. | The incumbent estate |

**Why the split matters.** Pega and Appian answer *"how do we run this process?"* Their modelling surface exists to produce an executable application, and the model is a by-product of the build. Diagramatix, Signavio, ARIS and PRIME answer *"what is this process, is it right, and can we prove it?"* — the model is the deliverable. Microsoft is the third question: *"why buy anything when we have Visio and Power Automate?"*

Against Pega and Appian the argument is **not** that Diagramatix automates better — it does not automate at all. It is that a portable, governed, notation-correct model is a different asset from an application, outlives any one platform, and is what an auditor, a regulator and a new starter actually read. Against Microsoft the argument is that the pieces do not join up — and, as of July 2026, join up **less** than they did.

---

## 2. Executive summary

**The short version.** Diagramatix competes head-on with Signavio, ARIS and PRIME on **authoring + AI generation**, where its editable-plan generation over rules-governed deterministic layout is genuinely distinctive and readability is a *measured* property — a corpus of stored AI plans is replayed offline on every test run and a ratchet fails the build if overlaps rise. **Diagramatix Miner** reads the messy exports people actually have, every figure on screen declares whether it describes the whole run, a slice or an estimate, a deviation hands you the case ids behind it, and a linked run series turns a one-off study into a monitor. The **Simulator** carries the layer that decides whether a business case survives the meeting — is the difference real or noise, which assumption is load-bearing, where does the staffing curve bend, and how do we know the model is right — tested against cases held back at import rather than marking its own homework.

**EPC is no longer a reason to stay on ARIS.** The notation is implemented with its rules enforced, an **ARIS AML** model import brings every model in the file across as a diagram, and **Convert to BPMN** is deterministic — worth trusting because of what it *refuses*: an unbalanced split, a connector that both splits and joins, an event with no decision behind it, a function owned by two departments. It names the places that need a human instead of quietly tidying them.

**Against the three new entrants the picture is different and should be stated plainly.** Pega and Appian are larger, better-funded platforms that do something Diagramatix does not attempt — they run the process. Both have serious mining (Pega was a 2026 Gartner MQ Leader for Process Intelligence). What neither offers is a governed multi-notation model as a first-class, portable deliverable: **Appian does not support BPMN import or export for its standard process models at all**, and Pega's design artefact is a Pega application. Microsoft has the broadest estate and the weakest join: Visio's BPMN is a Plan 2 add-on, and Microsoft **removed** the BPMN-to-Power-Automate export on 14 July 2026, so the one bridge between the drawing and the automation is gone.

On what a single analyst can author, prove, defend and be told about, without a platform migration and without leaving one tool, Diagramatix is the more complete product — self-hosted, per-seat, in one place.

---

## 3. AI Generation

| Capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Natural language → process model | ✅ Two-phase: plan → **editable plan** → layout | ✅ Text to Process | ✅ Text → model | ✅ MapAI | ✅ Blueprint → app design | ✅ Composer | ✅ Copilot → cloud flow |
| Target notations from AI | ✅ **nine notations** | BPMN | EPC or BPMN | BPMN-compliant maps | Pega case lifecycle | Appian process model | Flow, not a notation |
| Editable *intermediate plan* before layout | ✅ **Unique** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Choice of LLM provider | ✅ **7 live** + bring-your-own key | ❌ SAP only | ❌ ARIS only | ❌ | ❌ | ❌ | ❌ Azure OpenAI |
| Fully **local** LLM (Ollama / LM Studio) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Admin-tunable generation rules | ✅ green steer / red enforced | Limited | ❌ | ❌ | ❌ | ❌ | ❌ |
| Image / sketch → editable diagram | ✅ vision + OCR | — | — | — | — | — | — |
| Other input modalities | PDF, text, image | Text | Text | **Excel, audio, video, conversation** | Docs, legacy code, **BPMN files** | Docs | Text |
| AI agents that *act* | ❌ by design | Joule agents | — | **4 named agents** | ✅ | ✅ **Agent Studio** | ✅ **Copilot Studio** |
| AI usage metering + cost governance | ✅ per-org/user, token rates | Enterprise | Enterprise | Add-on | Enterprise | Enterprise | Tenant/capacity |
| Voice-driven live diagram editing | ✅ **Unique** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Claimed time saving | "seconds" to a laid-out diagram | up to 80% | — | up to 90%; ~5 min a procedure | **50–70% of the solution**; "48 hours" | — | — |

**Where the honest concession is.** Pega, Appian and Microsoft are all ahead of Diagramatix on **agentic AI** — AI that takes an action in a running system, not just drafts a picture. Agent Studio, Copilot Studio and Pega's agents reason over enterprise data and execute. Diagramatix deliberately does not: its AI proposes structure a human approves, and the layout engine that follows is deterministic. That is the right trade for a document that has to be defensible, and the wrong trade if what you want is work done without you.

**Where the lead is real.** No other product here exposes an **editable intermediate plan** — a structured, synchronised view of pools, lanes, elements and connectors that you correct *before* any geometry exists. None offers **LLM provider choice** with bring-your-own keys, let alone a **fully local model** for a tenant that cannot let prompts leave the building. None generates across **nine notations**. And none offers canvas-native, rules-validated **voice editing** — speak an edit, see it applied, undo it in one step.

**Pega Blueprint deserves credit.** It is the strongest AI story of the seven for a buyer whose goal is a running application: it ingests documentation, analyses legacy systems, imports **BPMN files**, and takes mined processes straight from Pega Process Mining into a design, claiming 50–70% of the solution. The catch is the artefact — a Pega application design, inside Pega. It is an accelerator for a Pega programme, not a portable model.

**Microsoft's AI is real but aimed elsewhere.** Copilot drafts *cloud flows*, not process models. The 2026 wave-1 work adds a Process Mining **MCP server**, a Copilot Studio **Process Analyst** agent and a Power Platform connector, so you can ask questions of mining data in natural language. Nothing in that stack drafts a governed BPMN model.

**Signavio's AI arrived properly this year.** Joule reached general availability on **10 February 2026** across informational, navigational and transactional patterns — including page explainers, textual comparisons of processes, and conversational questions about cycle times, variant frequency and exception rates. Because Joule spans SAP applications, the process context follows the user into S/4HANA and SuccessFactors, which is a reach no standalone tool can match. SAP notes that further analytical capabilities are planned for later releases.

**ARIS's AI carries the vendor's own health warning,** and it is worth quoting rather than paraphrasing. aris.com states: *"AI features are in the piloting and/or experimental stage. Features might change, be removed, or require additional licenses."* The AI Companion is real — natural-language model generation into EPC or BPMN, repository search without exact keywords, and graphical rendering of mining data — but a buyer should know it is not being sold as settled, and may be priced separately.

**PRIME BPM deserves an upgrade on this axis.** Four named agents now work as what PRIME markets as a "virtual OPEX team": **MapAI** converts documents, spreadsheets, audio, video or a workshop conversation into BPMN-compliant maps and claims to auto-correct missing steps, role gaps and logic errors; the **AI Procedure Writer** turns the same inputs into a standardised procedure in about five minutes; the **Digital Process Analyst** cuts analysis from weeks to minutes and simulates each improvement it proposes; and **PrimeGPT** answers plain-language questions over process data. On breadth of *capture input* they remain the strongest of the seven, and the auto-correction claim is the closest anyone else comes to Diagramatix's rule enforcement — though PRIME's corrects the map, while Diagramatix's refuses to draw the diagram wrong in the first place.

---

## 4. Process mining

### 4.1 Getting the log in

| Input capability | **Diagramatix Miner** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| CSV/TSV, **IEEE XES**, **OCEL** | ✅ all four in-tool | ✅ | ✅ | Partial | ✅ | ✅ | ✅ OCPM 2026 wave 1 |
| **Excel (.xlsx)** read directly, multi-sheet aware | ✅ | via ETL | via ETL | ✅ | via connector | via connector | via Dataverse/Fabric |
| **Wide "one row per case"** exports expanded | ✅ detected automatically | via ETL | via ETL | — | via ETL | via ETL | via ETL |
| **Merge several systems into one lifecycle** | ✅ in-tool, id unification | ✅ via ETL | ✅ via ETL | — | ✅ | ✅ data fabric | ✅ Fabric |
| Cross-system hand-off measured **at the join** | ✅ | — | — | — | — | — | — |
| **Refuses** a merge with no overlapping cases | ✅ says so | n/a | n/a | n/a | n/a | n/a | n/a |
| Column retention opt-in (keep / hash / drop) | ✅ | — | — | — | — | — | — |
| Enterprise connector catalogue | Limited | ✅ | ✅ | — | ✅ | ✅ | ✅ **broadest** |

The suites solve the awkward inputs with **ETL and a connector catalogue**, which is a project. Diagramatix solves the common cases **in the import screen**, which is an afternoon — and refuses where it cannot reconcile, because a merge in which no case appears twice looks exactly like a success. The converse is equally true and is the honest concession: **at enterprise data volume and connector breadth, Microsoft, Pega, Appian and Signavio are simply in a different weight class.** If the question is "read SAP, Salesforce and ServiceNow continuously at scale", that is an infrastructure argument and Diagramatix does not win it.

### 4.2 Reading it

| Analysis capability | **Diagramatix Miner** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Discovery, variants, conformance | ✅ | ✅ deep | ✅ deep | ❌ | ✅ | ✅ | ✅ |
| **Object-centric (OCEL)** | ✅ | ✅ Process Networks **beta** | ✅ | ❌ | — | — | ✅ 2026 wave 1 |
| Slice by date, team or any kept column | ✅ arrivals chart as the brush | ✅ | ✅ | Partial | ✅ | ✅ | ✅ |
| **Every figure declares its own exactness** | ✅ **no equivalent found** | — | — | — | — | — | — |
| Between-steps ranked by elapsed time | ✅ median on the arrows | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Hand-off map from **per-event resources** | ✅ labelled *approximate* when it must be | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Ping-pong and rework rates | ✅ | Partial | Partial | — | ✅ | ✅ | ✅ rework detectors |
| Deviation resolves to **actual case ids** | ✅ and says how many it can name | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| Shows **who or what executed** each step (human / bot / agent) | — | — | — | — | ✅ | ✅ 26.3 | ✅ |
| Recommendations | ✅ deterministic, ranked, actionable | AI narrative | AI narrative | ✅ analytics | ✅ → Blueprint | ✅ AI Copilot | ✅ Copilot |
| Publish to a BI layer | CSV / API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ **Power BI / Fabric** |

Two rows are the differentiators and both are about **honesty rather than capability**. Every figure says whether it describes the whole run, a slice or a sampled estimate — so it can be cited. And the recommendations are computed and ranked **deterministically**; the AI narrates findings it is handed and never sees the run, so it cannot produce a figure the ranking did not.

Two rows go the other way, and both are new. Appian 26.3 and Pega both **label the executor** on a mined diagram — human, RPA bot, AI agent or integration — which is a genuinely good idea for an estate that is half-automated, and Diagramatix has no equivalent. And Microsoft's mining publishes natively into **Power BI and Fabric**, which for an organisation already standardised there is worth more than any analytical nuance.

### 4.3 Watching it, rather than visiting it

| Monitoring capability | **Diagramatix Miner** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Scheduled refresh from a live source | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| **Linked run series** — this run vs the last | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ process comparison |
| Alert when a metric moves | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| **Alerts when the feed goes quiet** | ✅ leads with it | — | — | — | — | — | — |
| Calibrates a simulator from the mined log | ✅ | Partial | ✅ | — | — | — | — |
| **Holds cases back to test the twin** | ✅ | — | — | — | — | — | — |

The one nobody else leads with: *your feed went quiet*. A monitor that only alarms on a metric moving cannot tell the difference between a healthy process and a broken pipeline.

---

## 5. BPMN modelling & standards

| Capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| BPMN 2.0 authoring | ✅ full, rules-enforced | ✅ | ✅ | ✅ | Design-time only | ❌ **not the modeller** | ✅ Visio **Plan 2 only** |
| **BPMN 2.0 XML import / export** | ✅ both ways | ✅ | ✅ | ✅ | ✅ import to Blueprint | ❌ standard models; ✅ mining only | Partial (shapes, not portable XML) |
| **EPC (eEPC)** | ✅ rules enforced | — | ✅ signature notation | — | ❌ | ❌ | ❌ |
| **ARIS AML** model import | ✅ every model becomes a diagram | ❌ | native | ❌ | ❌ | ❌ | ❌ |
| Deterministic EPC → BPMN conversion | ✅ and it **refuses** what it cannot prove | — | ✅ | — | — | — | — |
| ArchiMate | ✅ 3.2 | — | ✅ | — | ❌ | ❌ | Stencils only |
| Other notations | ✅ six more | Limited | ✅ broad | — | ❌ | ❌ | Stencils |
| Live rule validation while drawing | ✅ 40+ scan rules (B01–B41) | ✅ | ✅ | ✅ | — | — | ✅ 76 Visio rules |
| Model is portable off the platform | ✅ | ✅ | ✅ | ✅ | Limited | **Limited** | Limited |

**The Appian row is the one to read twice.** Appian's own documentation and community are explicit: **BPMN 2.0 import and export is not supported for standard Appian process models.** Its Process Mining module reads and writes BPMN, but the models you build to run your business are in Appian's own notation, on the stated reasoning that BPMN describes *what* a process should do while Appian implements *how*. That is a defensible engineering position and a serious governance problem: the executable model and the documented model are different artefacts in different languages, and keeping them in step is manual, forever.

**Pega is similar in shape, better in direction.** Blueprint *imports* BPMN and Pega Process Mining *exports* it, so BPMN is a respected input — but what you end up maintaining is a Pega case lifecycle.

**Microsoft's BPMN is a drawing.** Visio supports BPMN 2.0 with roughly 360 shapes and 76 validation rules, which is more than most people realise — but only on **Visio Plan 2**, not Visio in Microsoft 365 or Plan 1, and in Visio for the web only in the English-US locale. A Visio file is a picture of a process, not a governed model: no repository semantics, no versioned approval, no conformance to a mined log.

---

## 6. The Microsoft question, answered directly

Every Australian mid-market buyer asks it, so it deserves its own section rather than a row.

**What Microsoft genuinely gives you.** Power Automate is a strong automation platform — low-code cloud flows, desktop RPA, and process mining with rework detection, root-cause analysis, process comparison, custom metrics and task mining. The 2026 wave-1 release adds **object-centric process mining**, a modern process-intelligence studio, custom KPIs and **native Microsoft Fabric integration**, plus an MCP server and Copilot Studio agents so mining data can be queried conversationally. Power BI visualises it, Power Apps fronts it, Dataverse stores it, SharePoint and Teams distribute it, and you are probably paying for all of it already. That is a formidable position and this document will not pretend otherwise.

**Where it does not join up.**

1. **The modelling layer is Visio, and Visio is a drawing tool.** BPMN shapes are a Plan 2 entitlement. There is no process repository, no approval workflow over a model, no notation beyond stencils, no conformance between the drawing and the mining.
2. **The bridge between them has been removed.** Visio Plan 2 could map BPMN shapes to Power Automate triggers and actions and export a cloud flow. **Effective 14 July 2026 that capability was removed**; existing diagrams and previously exported flows still work, but new flows must be built in the Power Automate designer. The one place where a BPMN model became an automation is gone, and the direction of travel is away from modelling, not toward it.
3. **Nothing in the estate owns the "what".** Power Automate knows what ran. Power BI knows what it cost. No component holds the authoritative, versioned, reviewed statement of what the process *is* — which is exactly the artefact an audit, an accreditation or a new starter needs.
4. **Consumption pricing, not per-seat.** Process mining and premium connectors bill against capacity. Budgeting an analyst's exploratory work is harder than budgeting a seat.

**The honest counter.** If your processes are *already* Microsoft-shaped, your automation is already in Power Automate, and your reporting is already in Power BI, then Microsoft's mining is the path of least resistance and Diagramatix is not competing for that budget line. Diagramatix competes for the line above it: the model itself — the thing that survives the automation being rewritten.

**Where the two sit together well.** Diagramatix already exports **Visio (.vsdx)**, imports it back, and writes to **SharePoint**; and it will read a Power Automate process-mining export like any other event log. The realistic sale into a Microsoft estate is not displacement — it is the governed authoring layer the estate does not have.

---

## 7. Governance, Risk & Control (GRC)

| GRC capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Risk & control register attached to process steps | ✅ | ✅ | ✅ | Partial | ✅ | ✅ | ❌ |
| Risk & Control Matrix (RCM) export | ✅ Excel, org-numbered | ✅ | ✅ | — | ✅ | ✅ | — |
| Segregation-of-duties checks | ✅ B39 | Partial | ✅ | — | ✅ | ✅ | — |
| Control coverage scan across the model | ✅ B38 | Partial | ✅ | — | — | — | — |
| Control **operating effectiveness from the mined log** | ✅ | Partial | Partial | — | — | — | — |
| APQC PCF classification | ✅ L0–L3 | ✅ | ✅ | — | — | — | — |
| Configurable approval workflow with full audit | Review workflow | ✅ engine | ✅ engine | ✅ | ✅ engine | ✅ engine | ✅ via Power Automate |

Pega and Appian are strong here and should not be undersold — both are used to run regulated case work, and their audit trails are the product, not a feature. Diagramatix's distinctive claim is narrower and sharper: **it tests whether a control actually operated, using the mined log**, and it scans the model for uncovered risk and segregation-of-duties conflicts. Their audit answers *what happened in our system*; this answers *is the control design sound, and did it hold*.

The concession is real: **a configurable, engine-driven approval workflow with full audit is something five of the six competitors have and Diagramatix has in lighter form.**

---

## 8. SOP / procedure generation

| SOP capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Diagram → written procedure | ✅ whole / lane / pool / subprocess | — | — | ✅ from recordings | — | ✅ DocCenter (docs in) | Copilot drafts prose |
| **Grounded in the model** (SOP always matches the diagram) | ✅ | — | — | ❌ recording-driven | — | ❌ | ❌ |
| Editable before export | ✅ | — | — | ✅ | — | ✅ | ✅ |
| Word (.docx) with **org template style adoption** | ✅ | — | — | ✅ | — | — | ✅ native |
| Figure of the diagram embedded | ✅ | — | — | — | — | — | Manual |

PRIME's AI Procedure Writer is the closest competitor and the gap is narrower than an older comparison suggests: it takes documents, video, audio or a conversation and claims a standardised procedure in about five minutes. Diagramatix's is **diagram-grounded**, so the procedure cannot drift from the model it documents — PRIME's is grounded in the recording, which is a different guarantee and a weaker one the moment the process changes. Appian's DocCenter is the inverse — it reads documents into the platform rather than writing them out. Microsoft can obviously produce a Word document; what it cannot do is guarantee the document matches a governed model, because there is no governed model.

---

## 9. Layout, routing & readability

| Capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Deterministic rules-based auto-layout | ✅ 50+ codified rules | Basic | Standard | Auto-map | Auto | Auto | Visio auto-align |
| **Readability measured and ratcheted in CI** | ✅ stored-plan corpus replayed each build | — | — | — | — | — | — |
| Smart connector routing with obstacle avoidance | ✅ | Partial | Partial | Partial | — | — | Partial |
| Ellipse edge connection, configurable palettes, independent typography | ✅ | — | Partial | — | — | — | ✅ Visio |
| Layout survives regeneration | ✅ plan approved before geometry | ❌ | ❌ | ❌ | n/a | n/a | n/a |

This section has no competitor column worth arguing with, and that is the point. Nobody else treats overlap count as a number that can fail a build.

---

## 10. Simulation

| Simulation capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Discrete-event simulation | ✅ | Classic scenario sim | ✅ **deepest engine** | Cycle time / cost | Listed | Listed | ❌ |
| **What-if against real mined data** | ✅ | **Open beta, July 2026** | ✅ overlay from mining | ✅ DPA simulates each improvement | — | — | ❌ |
| Resource calendars, shifts, teams | ✅ | Partial | ✅ schedules, loads, loopbacks | Partial | — | — | ❌ |
| Custom statistical distributions | ✅ | — | ✅ constant, triangular, … | — | — | — | ❌ |
| **Is the difference real, or noise?** (significance) | ✅ | — | Partial | — | — | — | ❌ |
| **Which assumption is load-bearing?** (sensitivity) | ✅ | — | Partial | — | — | — | ❌ |
| **Where does the staffing curve bend?** (sweep) | ✅ | — | Partial | — | — | — | ❌ |
| **How do we know the model is right?** (validation on held-back cases) | ✅ | — | — | — | — | — | ❌ |
| Calibrated from a mined log | ✅ | Beta | ✅ attribute calculation panel | Partial | — | — | ❌ |
| BPSim import/export | ✅ | Partial | ✅ | — | — | — | ❌ |
| Payback / business case | ✅ | Partial | ✅ | ✅ | — | — | ❌ |

**ARIS still has the deepest simulation engine,** and it has moved: a mining-to-simulation overlay now maps measured activity durations and waits onto simulation attributes through an attribute-calculation panel, with custom distributions, resource schedules, process loads and loopback pathways. Credit where it is due — this is the most mature simulation in the comparison.

**Signavio is newer here than we are, not more mature.** Their ability to simulate process changes against real data and test what-if scenarios entered **open beta in July 2026**. That is the opposite of the impression an older comparison leaves, and it is worth saying plainly rather than implying a maturity they have not claimed.

**PRIME's Digital Process Analyst simulates each improvement it recommends** — a genuinely good pairing of analysis and test, though aimed at cycle time and cost rather than a full discrete-event model.

What Diagramatix adds is the **analysis layer around the engine** — the four questions above are the ones that decide whether a business case survives a hostile meeting, and the validation is done against cases **held back at import**, so the twin is not marking its own homework. **No competitor here offers significance testing, sensitivity ranking, parameter sweep and held-back validation as a set.**

Pega and Appian list process simulation among their features; public documentation does not establish a discrete-event engine with resource calendars comparable to ARIS or Diagramatix, so this document does not claim either way. **Microsoft has no process simulation at all** — a gap worth naming in any Power Platform conversation, because a business case built on mined averages has no confidence interval.

---

## 11. Collaboration, review, publishing & access

| Capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| Live co-authoring with presence and cursors | ✅ | ✅ | Partial | Partial | ✅ | ✅ | ✅ |
| Structured review & comment workflow | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | Comments |
| Versioning and publish-to-audience | ✅ | ✅ **strongest** | ✅ | ✅ | ✅ | ✅ | SharePoint |
| Org / project / role permissions | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ M365 |
| Read-only impersonation for support | ✅ | — | — | — | — | — | — |
| Reader audience without a seat | ✅ published view | ✅ Collaboration Hub | ✅ | ✅ | Licence | Licence | ✅ everyone has it |

Signavio's Collaboration Hub remains the benchmark for publishing a process estate to a non-modelling audience. Microsoft's advantage here is brutal and structural: **everyone already has the reader**. Where Diagramatix differs is that the reader view is part of the per-seat product rather than a separate hub or an extra licence tier.

---

## 12. Export, interop & deployment

| Capability | **Diagramatix** | Signavio | ARIS | PRIME | Pega | Appian | Microsoft |
|---|---|---|---|---|---|---|---|
| BPMN 2.0 XML | ✅ | ✅ | ✅ | ✅ | Import | Mining only | Partial |
| **Visio (.vsdx)** export *and* import | ✅ | Partial | Partial | — | — | — | Native |
| ARIS AML import | ✅ | ❌ | native | ❌ | ❌ | ❌ | ❌ |
| XES / OCEL | ✅ | ✅ | ✅ | Partial | ✅ | ✅ | ✅ |
| Word, PDF, SVG, PNG | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| SharePoint integration | ✅ | Partial | Partial | — | — | — | ✅ native |
| Partner-facing **Process API** | ✅ document → PDF + project | ✅ API | ✅ API | — | ✅ | ✅ | ✅ |
| **Self-hostable / on-prem** | ✅ | ❌ cloud | ✅ | ❌ cloud | ✅ | ✅ | ❌ cloud |
| **Fully local LLM option** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Per-seat pricing | ✅ | Enterprise | Enterprise | ✅ | Enterprise | Enterprise | Consumption |

The bottom four rows are the commercial argument in a single block: **self-hostable, per-seat, with an option to run the AI entirely inside your own network.** Of the seven, only Diagramatix offers all three. Pega and Appian can be self-hosted but not per-seat or local-LLM; Microsoft is none of the three.

---

## 13. Where Diagramatix wins

1. **The editable plan.** Correct the structure before any geometry exists. Nobody else has it.
2. **Readability as a measured property**, ratcheted in CI — not an aspiration.
3. **Nine notations**, including EPC with its rules enforced and a deterministic, *refusing* EPC → BPMN conversion.
4. **An ARIS exit.** AML import brings every model across; conversion names the dozen places that need a human.
5. **Mining that declares its own exactness**, resolves a deviation to real case ids, and alarms when the feed goes quiet.
6. **The simulation analysis layer** — significance, sensitivity, sweep, and validation on held-back cases.
7. **Controls tested against the mined log**, not just registered.
8. **Provider choice, bring-your-own keys, and a fully local LLM**, with per-org cost governance.
9. **Voice-driven, rules-validated live editing** — no competitor offers it.
10. **Self-hosted, per-seat, one tool.**

## 14. Where each competitor still wins

- **Signavio:** SAP-ecosystem grounding, best-practice content, the strongest publishing hub, the most industrialised mining, and Joule reaching across every SAP application a user already works in.
- **ARIS:** EA breadth, repository governance at scale, and the deepest simulation engine — now fed directly from mining through an attribute-calculation overlay, with custom distributions, resource schedules and loopbacks. Newly independent as SAG Aris GmbH, which may make them hungrier.
- **PRIME BPM:** the most flexible capture input of the seven (audio, video, Excel, conversation), four working AI agents rather than one assistant, auto-correction of role gaps and logic errors in a generated map, and a Digital Process Analyst that simulates each improvement it recommends.
- **Pega:** it runs the process. Blueprint is the strongest AI-to-working-system path of the seven, backed by mining that feeds it directly. A 2026 Gartner MQ Leader for Process Intelligence.
- **Appian:** it runs the process, over a data fabric, with agentic AI that acts on enterprise data — and mined diagrams that label whether a human, a bot or an agent did the work.
- **Microsoft:** you already own it. Broadest connectors, Fabric and Power BI at the end of the pipe, RPA in the same product, and every reader already licensed.

## 15. Positioning Diagramatix

**Against Signavio, ARIS and PRIME** — the argument is unchanged and strong: more control of AI generation, measured layout, more notations, an ARIS exit, honest mining, a real simulation analysis layer, self-hosted and per-seat.

**Against Pega and Appian** — do not compete on automation; concede it early and clearly. Compete on the model as an asset: portable, notation-correct, governed, readable by people who will never log into the platform. Ask the question neither answers well: *when you replace the platform in seven years, what do you still own?* For Appian specifically, the fact that its standard process models have no BPMN import or export at all is the single most useful thing in this document.

**Against Microsoft** — do not compete on estate, price or reach; that fight is unwinnable and nobody is asking you to have it. Compete on the hole in the middle: Power Automate knows what ran, Power BI knows what it cost, and **nothing owns what the process is** — a gap that widened on 14 July 2026 when the BPMN-to-flow bridge was removed. Sell alongside, not against: export Visio, write to SharePoint, read their mining exports, and be the governed authoring layer the estate does not have.

**In one line:** *their AI helps you talk about processes, or run them; Diagramatix helps you build them — by hand, by keyboard, or by voice — with the correctness guarantees of a governed rules engine behind every change, in a model you still own afterwards.*

---

## Sources

**Diagramatix** — current codebase, 24 September 2026: product 2.12, export SCHEMA_VERSION 49, nine notations.

**Verified live on 24 September 2026:**

- Pega Blueprint — <https://www.pega.com/blueprint>
- Pega, GenAI Blueprint press release — <https://www.pega.com/about/news/press-releases/pega-enhances-power-pega-genai-blueprint-accelerate-transformational-app>
- Pega, process intelligence — <https://www.pega.com/insights/articles/how-work-really-gets-done-turning-process-intelligence-business-impact>
- Pega Community, Blueprint from process data — <https://community.pega.com/blog/how-do-i-use-my-process-data-jump-start-legacy-transformation-pega-genai-blueprint>
- Pega Support, "Generate case life cycles from BPMN" — <https://support.pega.com/discussion/new-pega-genai-blueprint-generate-case-life-cycles-bpmn>
- Appian, Process Intelligence — <https://appian.com/products/platform/process-intelligence>
- Appian, AI Agents — <https://appian.com/products/platform/artificial-intelligence/ai-agents>
- Appian, product announcements — <https://appian.com/products/platform/whats-new>
- Appian Community, BPMN import/export limitation — <https://community.appian.com/discussions/f/general/176/hi-i-am-keen-to-understand-on-how-i-can-import-or-export-process-m>
- Appian Docs, Process Mining models (BPMN in/out) — <https://docs.appian.com/suite/help/22.1/pm-5.0/process_mining/models.html>
- Microsoft Learn, Power Automate 2026 release wave 1 — <https://learn.microsoft.com/en-us/power-platform/release-plan/2026wave1/power-automate/>
- Microsoft Learn, Copilot Studio agent with process mining — <https://learn.microsoft.com/en-us/power-automate/process-mining-mcp-create-cps-agent>
- Microsoft Support, create BPMN-compliant processes in Visio — <https://support.microsoft.com/en-us/visio/create-bpmn-compliant-processes>
- Microsoft Tech Community, BPMN in Visio for the web — <https://techcommunity.microsoft.com/blog/microsoft365insiderblog/create-bpmn-diagrams-in-visio-for-the-web/4216161>
- Microsoft Docs, Visio → Power Automate export **(deprecated 14 July 2026)** — <https://github.com/MicrosoftDocs/power-automate-docs/blob/main/articles/visio-flows.md>
- SAP Signavio, Joule generally available (10 Feb 2026) — <https://news.sap.com/2026/02/process-conversation-joule-sap-signavio-solutions-generally-available/>
- SAP Signavio, May 2026 release — Process Networks (beta), what-if simulation open beta July 2026 — <https://community.sap.com/t5/technology-blog-posts-by-sap/sap-signavio-may-2026-release-unlock-next-gen-process-intelligence-with-the/ba-p/14400741>
- SAP Signavio, February 2026 release — <https://community.sap.com/t5/technology-blog-posts-by-sap/sap-signavio-february-2026-release-sap-signavio-process-insights-and/ba-p/14325159>
- SAP Signavio, object-centric clustering — <https://community.sap.com/t5/technology-blog-posts-by-sap/turn-spaghetti-into-structure-a-hands-on-guide-to-object-centric-clustering/ba-p/14208828>
- SAP Signavio Process Collaboration Hub — <https://www.signavio.com/products/collaboration-hub/>
- ARIS AI Companion (vendor shown as **SAG Aris GmbH**; AI features stated to be piloting/experimental) — <https://aris.com/resources/ai-companion/>
- ARIS Simulation — <https://aris.com/platform-bkp0326/simulation/>
- ARIS, process-mining attributes for simulation — <https://aris.com/resources/process-mining-attributes-simulation/>
- Software GmbH, ARIS and Adabas & Natural to launch as standalone businesses (Jan 2025) — <https://www.softwareag.com/en/blog/insights/adabas-natural-and-aris-launch-as-standalone/>
- Software AG corporate history — <https://en.wikipedia.org/wiki/Software_AG>
- PRIME BPM, AI agents for BPM — <https://www.primebpm.com/bpm-ai-agents>
- PRIME BPM, MapAI — <https://www.primebpm.com/mapai>
- PRIME BPM, AI Procedure Writer — <https://www.primebpm.com/ai-procedure-writer>
- PRIME BPM, PrimeGPT — <https://www.primebpm.com/primegpt>

**Withdrawn from earlier editions.** The claim that SAP Signavio is "grounded in **5,000** SAP best-practice models" could not be substantiated on 24 September 2026 — SAP's current material says only "thousands of best practices". A precise number the vendor no longer publishes is exactly the kind of claim that fails in the room, so it has been replaced with the vendor's own wording. Likewise, **ARIS is no longer "Software AG"** and earlier editions of this document were wrong to say so.
