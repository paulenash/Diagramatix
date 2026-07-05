# Diagramatix Feature Comparison — July 2026 (rev 2)
## Diagramatix vs SAP Signavio, ARIS, and PRIME BPM

**Prepared:** 5 July 2026
**Supersedes:** the 4 July 2026 refresh (which itself superseded the 21 June edition)
**Scope:** The current Diagramatix feature catalogue compared against publicly described capabilities of SAP Signavio, Software AG **ARIS**, and **PRIME BPM**. Celonis is referenced as the process-mining benchmark where relevant.

---

## What changed since the last refresh

The 21 June comparison called out **process mining/conformance** as Diagramatix's clearest gap; the 4 July refresh closed it. Since then Diagramatix has also shipped the *other* historically-missing enterprise pillar — **Risk & Compliance / GRC** — and, critically, wired it to the mining engine:

- **Risk & Control on the process model.** Attach **Risks and Controls** (and Policies, Regulations, Audit Findings, KRIs, KPIs) to the real process steps, from an org-master catalog each project adopts. Controls carry type (preventive/detective/corrective), automation (manual/automated/IT-dependent), owner, framework reference, evidence, test method and residual-risk rating.
- **Risk-Control Matrix (RCM) export.** One click produces the auditor-standard, flat **Activity × Risk × Control** grid (plus registers, a coverage summary and a full **traceability** sheet), in Excel.
- **Coverage + Segregation-of-Duties checks.** The diagram scan flags a Risk with no mitigating Control, and a lane that both raises and approves the same work.
- **Traceability graph.** A directed **activity → risk → control → policy → regulation** (with KRIs/KPIs) graph, exportable — end-to-end from a BPMN step to the controls and regulations that govern it.
- **Control operating-effectiveness from mined data.** Tie a Control to the mining-conformance deviation a bypass would produce, and the RCM shows it was **"bypassed in N of M cases"** — evidence the control is actually *operating*, computed from the real event log.
- **A 3rd example catalog** — *Risk & Control (GRC) Examples* — parallel to the Simulator and Mining galleries, with a one-click Order-to-Cash study (real process + risks/controls + a mined run proving effectiveness).

Net effect: Diagramatix now spans **model → publish → mine → conform → simulate → govern → improve** in one workspace. The two capabilities that used to be "enterprise-suite only" — process mining and GRC — are both present *and integrated with each other*, which even the enterprise suites keep in separate products.

---

## Basis of comparison

The Diagramatix side is grounded in the shipped feature catalogue. The comparator side is based on public product pages and documentation — this is a **public-document comparison, not a hands-on bake-off**:

- **Strong** — clear public evidence of a matching or very close capability.
- **Partial** — an adjacent capability, but not the exact Diagramatix feature as described.
- **Not found** — no reliable public evidence for that exact feature (this does **not** prove absence).

---

## Executive summary

**Diagramatix** is now a **full-loop process *and governance* platform for the SMB and mid-market**: author in any notation, publish to a business audience, mine the real process from event logs, check conformance, calibrate a digital twin, simulate the redesign — and govern it with risks, controls and a Risk-Control Matrix, all without leaving the tool. Its distinctive, hard-to-match claims are now:

- **A closed mine → conform → simulate → improve loop in one product.** Most tools do *either* mining (Celonis, Signavio PI, ARIS Mining) *or* modelling+simulation (Signavio Modeler, ARIS, PRIME). Diagramatix does both and **wires mining output straight into a calibrated simulation twin** — a workflow even the enterprise suites keep in separate modules.
- **Governance on the process, proven by data.** Attach Risks & Controls to the real steps, produce a Risk-Control Matrix, and — uniquely at this tier — see each control's **operating effectiveness** ("bypassed in N of M cases") computed from the *mined conformance*. Enterprise GRC suites keep risk/control and process mining in separate products; Diagramatix does both on one model.
- **Entity-lifecycle mining + state-machine conformance.** Beyond directly-follows BPMN discovery, Diagramatix mines the business entity's **state machine** and replays it against a reference lifecycle — conformance framed as *legal states/transitions*, unusually precise for this tier.
- **Broad multi-notation editing** (BPMN, ArchiMate, UML, Value Chain, State Machine, Domain, Context…), **text-, image- and voice-to-diagram**, **Microsoft Visio round-trip** (VSDX export *and* re-import), **diagram health checking**, and **automatic sub-process linking** — a self-service experience the enterprise suites don't emphasise.

**SAP Signavio** remains the strongest comparator for **enterprise process transformation** at SAP-aligned organisations: process repository, Collaboration Hub, governance/versioning, **Process Intelligence** mining with live system connectors, and **SAP-GRC-aligned** risk/control. It out-scales Diagramatix on repository governance, enterprise mining connectors and org-wide analytics — but is heavier, costlier, keeps mining and GRC in separate products, and isn't a self-service multi-notation + Visio round-trip editor.

**ARIS** is still the **deepest enterprise-architecture platform**: large-scale architecture, repository governance, multi-method modelling, process mining/intelligence, simulation, and a dedicated **Risk & Compliance Manager (ARCM)**. It leads Diagramatix on enterprise scale, governance discipline and formal GRC depth; Diagramatix leads on self-service, AI/image/voice generation, Visio round-trip, the integrated mining-to-twin loop, and control-effectiveness proven directly from mined data.

**PRIME BPM** stays closest to Diagramatix in the **business-user improvement segment** (BPMN mapping, APQC libraries, RACI, value/time/cost analysis, approvals). Diagramatix now clearly leads it on **process mining, conformance, digital-twin simulation, risk/control + RCM, multi-notation breadth and Visio round-trip**.

**Bottom line:** For an organisation that wants to *model, publish, mine, govern and simulate its processes as one workflow* — without an enterprise budget or a multi-tool stack — Diagramatix is now uniquely complete, and the **mining-driven control effectiveness** is something even Signavio/ARIS don't offer on a single model. The remaining honest gaps versus Signavio/ARIS/Celonis are **enterprise-scale mining connectors and org-wide analytics dashboards, and deep repository governance** — the things that matter most to very large, regulated transformation programmes.

---

## High-level positioning

| Product | Strongest fit | Relative weakness vs Diagramatix (2026) |
|---|---|---|
| **Diagramatix** | Full-loop SMB/mid-market: multi-notation + AI/image/voice generation, Visio round-trip, publish/review, **process mining + conformance + digital-twin simulation**, **risk & control + Risk-Control Matrix with mining-proven control effectiveness**, health checking | Enterprise-scale mining connectors & org-wide process-intelligence dashboards; deep repository governance at ARIS/Signavio scale |
| **SAP Signavio** | Enterprise BPM & SAP-aligned transformation, repository, Collaboration Hub, Process Intelligence, SAP-GRC risk/control, governance, simulation | Not a self-service multi-notation + Visio editor; no image/voice-to-diagram; mining + GRC are separate products, not one model; heavier & costlier |
| **ARIS** | Enterprise process architecture, governance, process mining/intelligence, simulation, Risk & Compliance Manager | Less lightweight/self-service; image/voice + Visio round-trip less clear; GRC + mining in separate modules; higher barrier to entry |
| **PRIME BPM** | Business-user BPM improvement, BPMN mapping, APQC library, RACI, analysis, approvals | No comparable process mining/conformance, digital-twin simulation, or Risk-Control Matrix; narrower notation range; no Visio round-trip |

---

## Capability comparison (grouped)

| Capability area | Diagramatix | SAP Signavio | ARIS | PRIME BPM |
|---|---|---|---|---|
| Multi-notation modelling (BPMN, ArchiMate, UML, Value Chain, State Machine, Domain, Context) | **Strong** | Partial (BPMN-centric + some) | **Strong** | Partial (BPMN-centric) |
| AI text-to-diagram — **all** notations | **Strong** | Partial (AI BPMN) | Partial (AI Companion) | Partial (AI mapping) |
| Image-to-diagram (sketch/screenshot → editable) | **Strong** | Not found | Not found | Partial (image → map) |
| Voice dictation → AI Generate | **Strong** | Not found | Not found | Not found |
| Smart connector routing / BPMN-aware auto-connect | **Strong** | Partial | Partial | Partial |
| Microsoft Visio round-trip (VSDX export **and** re-import) | **Strong** | Partial (import/export) | Partial | Not found |
| BPMN 2.0 XML import / Flowchart→BPMN translation | **Strong** | **Strong** | **Strong** | Partial |
| Cross-functional pools / lanes / sub-lanes | **Strong** | **Strong** | **Strong** | **Strong** |
| Diagram health check & connector scan | **Strong** | Partial | Partial | Not found |
| Automatic sub-process linking / drill-down | **Strong** | **Strong** (repository) | **Strong** (repository) | Partial |
| Publishing & review lifecycle (versioned, re-review reminders) | **Strong** | **Strong** (Collaboration Hub) | **Strong** | **Strong** (publication) |
| Collaboration, comments & sign-off | **Strong** | **Strong** | **Strong** | **Strong** |
| Governed naming from org/entity lists | **Strong** | Partial (dictionary/glossary) | **Strong** (repository objects) | Partial |
| **Process discovery from event logs (→ BPMN)** | **Strong** (DiagramatixMINER) | **Strong** (Process Intelligence) | **Strong** (ARIS Mining) | Not found |
| **Entity state-machine lifecycle mining** | **Strong** (distinctive) | Partial | Partial | Not found |
| **Conformance checking (token replay, fitness %)** | **Strong** | **Strong** | **Strong** | Not found |
| **Digital-twin calibration from the log** | **Strong** (one-click, integrated) | Partial (PI + separate sim) | Partial (mining + separate sim) | Not found |
| Discrete-event / BPSim simulation, scenarios, Monte Carlo | **Strong** | **Strong** | **Strong** | Partial |
| Working-hours calendars in simulation | **Strong** | Partial | **Strong** | Not found |
| **Risk & Control on the process model (attach to steps)** | **Strong** | **Strong** (SAP GRC) | **Strong** (ARCM) | Partial (RACI/notes) |
| **Risk-Control Matrix (RCM) export + coverage / SoD checks** | **Strong** | **Strong** (GRC module) | **Strong** (ARCM) | Partial |
| **GRC traceability graph (risk ↔ control ↔ policy ↔ regulation ↔ KRI/KPI)** | **Strong** | **Strong** | **Strong** | Not found |
| **Control operating-effectiveness from mined conformance (on the model)** | **Strong** (distinctive, integrated) | Partial (separate PI + GRC) | Partial (separate mining + ARCM) | Not found |
| Enterprise-scale mining connectors (live system extraction) | Partial (CSV/event-log import) | **Strong** | **Strong** | Not found |
| Org-wide process-intelligence dashboards / KPIs | Partial | **Strong** | **Strong** | Partial |
| Repository governance at enterprise scale | Partial | **Strong** | **Strong** | Partial |
| SharePoint / OneDrive integration | **Strong** | Partial | Partial | Not found |
| Backup / restore / portable account snapshot | **Strong** | Partial | Partial | Partial |
| Self-serve tiered subscriptions | **Strong** | Not found (enterprise sales) | Not found (enterprise sales) | Partial |

---

## Where Diagramatix now leads

1. **Mining-proven control effectiveness on one model.** Risks/controls sit on the same process the mining engine analyses, so the Risk-Control Matrix shows whether each control actually *operates* ("bypassed in N of M cases") — the enterprise suites keep GRC and process mining in separate products.
2. **The integrated loop.** Mining output feeds a calibrated simulation twin in one click — discovery, conformance and simulation aren't separate modules with separate effort.
3. **Entity-lifecycle conformance.** State-machine discovery + replay against a reference lifecycle (legal states/transitions) is more precise than DFG-only conformance and rare at this tier.
4. **Input breadth + self-service economics.** Text, image and voice to diagram across every notation; Visio round-trip both directions; free tier + self-serve upgrade vs enterprise sales motions.

## Where Diagramatix still trails (honest gaps)

1. **Enterprise mining at scale.** Diagramatix mines uploaded event logs; Celonis/Signavio PI/ARIS extract live from source systems (SAP, ServiceNow…) with pre-built connectors and org-wide dashboards.
2. **Repository governance.** ARIS/Signavio offer deep repository objects, glossaries, lifecycle governance and enterprise access control beyond project sharing.
3. **Org-wide analytics surface.** No org-wide KPI / process-intelligence dashboarding layer (yet).

*(Risk/compliance is no longer a gap — see the GRC rows above.)*

---

## Recommended positioning statements

- **vs Signavio/ARIS:** "The full model-to-mine-to-govern-to-simulate loop, self-service, without the enterprise stack or the enterprise bill — with control effectiveness proven from your own event data on the same model."
- **vs Celonis:** "Bring your event log; get discovery, conformance, a runnable digital twin **and** a Risk-Control Matrix that shows which controls were bypassed — not just a dashboard."
- **vs PRIME BPM:** "Everything PRIME does for BPMN improvement, plus real process mining, conformance, digital-twin simulation and a data-proven Risk-Control Matrix."

---

*Assessments reflect public product material as of July 2026 and the current Diagramatix feature catalogue. "Not found" indicates no confirmed public evidence, not proven absence. Competitor GRC cells (SAP GRC / ARIS ARCM) reflect documented enterprise modules and warrant a human verification pass before external use.*
