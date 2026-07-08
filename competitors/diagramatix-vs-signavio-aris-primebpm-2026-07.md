# Diagramatix Feature Comparison — July 2026 (rev 4)
## Diagramatix vs SAP Signavio, ARIS, and PRIME BPM

**Prepared:** 8 July 2026
**Supersedes:** the 7 July 2026 edition (rev 3) — which superseded the 5 July (rev 2), 4 July refresh and 21 June editions
**Scope:** The current Diagramatix feature catalogue compared against publicly described capabilities of SAP Signavio, Software AG **ARIS**, and **PRIME BPM**. Celonis is referenced as the process-mining benchmark where relevant.

---

## Update — 8 July 2026 (rev 4): the APQC Process Classification Framework, done as a living framework

Since rev 3, Diagramatix added a full **APQC Process Classification Framework® (PCF)** capability — and, importantly, went past *"we ship the APQC library"* (PRIME BPM's headline claim, and an ARIS/Signavio reference-content feature) to **wire the standard into the live process estate**:

- **Reference library (L0).** The Cross-Industry framework **plus every industry variant** (Banking, Healthcare, Retail, Telecommunications, Utilities, Aerospace, Automotive, Consumer Products/Electronics, Education, Government, Life Sciences, Petroleum, Insurance…) imported from the APQC workbooks as a searchable 5-level hierarchy (Category → Process Group → Process → Activity → Task), including the legacy workbook format and per-family version history.
- **Classify + structure (L1–L2).** Tag any diagram against a PCF element (keyed on APQC's **stable process id**, so tags survive version changes), and **Create APQC Project** — spin up a project whose folder tree mirrors a chosen PCF branch to any depth.
- **Generate from the standard (the flagship).** **Create APQC Process** turns a standard process into a real BPMN model in one click: a higher-level process **decomposes** into collapsed sub-processes; a task-level process is **AI-generated**, grounded on the APQC branch; optional **APQC numbering** codes every step. Nobody else turns an APQC entry into a running, editable model.
- **Coverage analytics (L4a).** A live view of which APQC processes are **modelled vs. gaps**, by category and level — a standards-coverage map of the whole estate.
- **Control-effectiveness by APQC category (L4b).** The org compliance monitor rolls control operating-effectiveness and conformance fitness up **by APQC category** — the standard becomes the reporting spine for governance.
- **Tailored, upgradeable frameworks (L5 — the standout).** An org **composes its own framework** from one or more industry variants, **extends** it with custom processes, **curates** it to its own terminology and codes, and **scopes it to divisions** — every node keeping **provenance** back to APQC. A **version-upgrade wizard** imports a newer APQC release, **diffs** it (added / renamed / removed) and **re-points** classifications and tailored nodes by stable id, flagging anything removed. Attribution travels automatically into every export that carries PCF content.

**Net effect:** competitors treat APQC as a **static content library** you copy from. Diagramatix treats it as a **living framework** you classify against, **generate from**, measure **coverage** and **compliance** against, and **compose, version and divisionalise** as your own — provenance-linked back to the standard. This converts PRIME BPM's "we have the APQC library" from a differentiator into table stakes, and gives Diagramatix a governed-process-architecture story that the enterprise suites deliver only across multiple products.

---

## Update — 7 July 2026 (rev 3): continuous, org-wide compliance monitoring

Since the 5 July edition, Diagramatix extended GRC from a point-in-time matrix to **continuous, organisation-wide compliance monitoring**:

- **Compliance Monitoring console.** A new **org-level** console (a peer of the Simulator, Miner and Risk & Control screens) that trends **control operating-effectiveness over time** across *every* project in the organisation, assembled from the retained process-mining runs. It shows an org-wide **effectiveness-vs-conformance-fitness trend**, per-control trend charts, **below-threshold and declining-control alerts**, and a by-project posture table — with per-run **include/exclude** so throwaway/test runs don't skew the trend.
- **Org-wide Risk & Control numbering + Org Owner.** Risk / Control / Policy codes (`R-001`, `C-001`…) are now a single **organisation-wide** sequence shared across all of an org's projects, so the same control reads the same code everywhere. A SuperAdmin-settable **Org Owner** governs which organisation a project — and its numbering — belongs to.
- **RCM analytics + on-model highlight.** An in-console **analytics** view (coverage, inherent/residual risk posture, control type/automation mix, operating-effectiveness distribution) plus **red/green highlighting** of risk- and control-carrying steps directly on the diagram, and one-click navigation from a control to the exact step it guards.

**Net effect:** the governance story moves from *"produce a Risk-Control Matrix"* to *"monitor whether controls keep operating — organisation-wide, over time."* This begins to close the previously-noted **org-wide analytics** gap for the **compliance** domain specifically (control-effectiveness trending across projects) — a capability the enterprise suites deliver only by combining a separate process-intelligence product with a separate GRC product.

---

## Earlier context — the GRC addition (5 July 2026)

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
- **Governance on the process, proven by data — and monitored over time.** Attach Risks & Controls to the real steps, produce a Risk-Control Matrix, and — uniquely at this tier — see each control's **operating effectiveness** ("bypassed in N of M cases") computed from the *mined conformance*, now **trended organisation-wide over time** in a dedicated **Compliance Monitoring** console with declining-control alerts. Enterprise GRC suites keep risk/control and process mining in separate products; Diagramatix does both on one model *and* monitors compliance continuously.
- **APQC PCF as a living framework, not a static library.** Classify diagrams against the standard, **generate a running BPMN model from an APQC process** in one click, measure **coverage** and roll **control-effectiveness up by APQC category**, and **compose/version/divisionalise your own tailored framework** with provenance back to APQC and an upgrade wizard that re-points by stable id. PRIME BPM ships the APQC *library*; ARIS/Signavio ship APQC-aligned *reference models*; none turn it into a generate-from, coverage-measured, org-tailorable framework wired to live models, mining and controls.
- **Entity-lifecycle mining + state-machine conformance.** Beyond directly-follows BPMN discovery, Diagramatix mines the business entity's **state machine** and replays it against a reference lifecycle — conformance framed as *legal states/transitions*, unusually precise for this tier.
- **Broad multi-notation editing** (BPMN, ArchiMate, UML, Value Chain, State Machine, Domain, Context…), **text-, image- and voice-to-diagram**, **Microsoft Visio round-trip** (VSDX export *and* re-import), **diagram health checking**, and **automatic sub-process linking** — a self-service experience the enterprise suites don't emphasise.

**SAP Signavio** remains the strongest comparator for **enterprise process transformation** at SAP-aligned organisations: process repository, Collaboration Hub, governance/versioning, **Process Intelligence** mining with live system connectors, and **SAP-GRC-aligned** risk/control. It out-scales Diagramatix on repository governance, enterprise mining connectors and org-wide analytics — but is heavier, costlier, keeps mining and GRC in separate products, and isn't a self-service multi-notation + Visio round-trip editor.

**ARIS** is still the **deepest enterprise-architecture platform**: large-scale architecture, repository governance, multi-method modelling, process mining/intelligence, simulation, and a dedicated **Risk & Compliance Manager (ARCM)**. It leads Diagramatix on enterprise scale, governance discipline and formal GRC depth; Diagramatix leads on self-service, AI/image/voice generation, Visio round-trip, the integrated mining-to-twin loop, and control-effectiveness proven directly from mined data.

**PRIME BPM** stays closest to Diagramatix in the **business-user improvement segment** (BPMN mapping, APQC libraries, RACI, value/time/cost analysis, approvals). Diagramatix now clearly leads it on **process mining, conformance, digital-twin simulation, risk/control + RCM, multi-notation breadth and Visio round-trip** — and, on PRIME's own home turf, has turned the **APQC library** into a *living framework*: classify, **generate a model from a PCF process**, coverage analytics, control-effectiveness by category, and org-tailored/upgradeable frameworks with provenance — well beyond a browsable library.

**Bottom line:** For an organisation that wants to *model, publish, mine, govern and simulate its processes as one workflow* — without an enterprise budget or a multi-tool stack — Diagramatix is now uniquely complete, and the **mining-driven control effectiveness** is something even Signavio/ARIS don't offer on a single model. The remaining honest gaps versus Signavio/ARIS/Celonis are **enterprise-scale mining connectors and org-wide analytics dashboards, and deep repository governance** — the things that matter most to very large, regulated transformation programmes.

---

## High-level positioning

| Product | Strongest fit | Relative weakness vs Diagramatix (2026) |
|---|---|---|
| **Diagramatix** | Full-loop SMB/mid-market: multi-notation + AI/image/voice generation, Visio round-trip, publish/review, **process mining + conformance + digital-twin simulation**, **risk & control + Risk-Control Matrix with mining-proven control effectiveness**, **continuous org-wide compliance monitoring**, **APQC PCF as a living framework (classify / generate-from / coverage / by-category compliance / tailor + version + divisions with provenance)**, health checking | Enterprise-scale mining connectors & general org-wide process-intelligence dashboards; deep repository governance at ARIS/Signavio scale |
| **SAP Signavio** | Enterprise BPM & SAP-aligned transformation, repository, Collaboration Hub, Process Intelligence, SAP-GRC risk/control, governance, simulation | Not a self-service multi-notation + Visio editor; no image/voice-to-diagram; mining + GRC are separate products, not one model; heavier & costlier |
| **ARIS** | Enterprise process architecture, governance, process mining/intelligence, simulation, Risk & Compliance Manager | Less lightweight/self-service; image/voice + Visio round-trip less clear; GRC + mining in separate modules; higher barrier to entry |
| **PRIME BPM** | Business-user BPM improvement, BPMN mapping, APQC library, RACI, analysis, approvals | No comparable process mining/conformance, digital-twin simulation, or Risk-Control Matrix; narrower notation range; no Visio round-trip; **its APQC library is browse/reference only** — no generate-from-PCF, coverage, by-category compliance, or org-tailored/upgradeable framework |

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
| **Continuous compliance monitoring — control effectiveness trended over time, org-wide across all projects** | **Strong** (distinctive, integrated) | Partial (separate PI + GRC) | Partial (separate mining + ARCM) | Not found |
| **Org-wide risk/control numbering + SuperAdmin Org Owner** | **Strong** | Partial | **Strong** (repository) | Not found |
| APQC PCF reference library (Cross-Industry + all industry variants, searchable, versioned) | **Strong** | Partial (reference content) | Partial (reference models) | **Strong** (APQC library) |
| Classify diagrams against a PCF element (keyed on APQC's stable process id) | **Strong** | Partial | Partial | Partial (map to APQC) |
| **Generate a running BPMN model from a PCF process (decompose → sub-processes / AI, APQC-numbered)** | **Strong** (distinctive) | Not found | Not found | Not found |
| **APQC coverage analytics (which standard processes are modelled vs. gaps, by category/level)** | **Strong** | Partial | Partial | Not found |
| **Control-effectiveness / conformance rolled up by APQC category** | **Strong** (distinctive, integrated) | Partial (separate PI + GRC) | Partial (separate mining + ARCM) | Not found |
| **Org-tailored PCF framework — compose from variants + extend + curate + divisions, with provenance to APQC** | **Strong** (distinctive) | Partial (repository customisation) | Partial (repository/method) | Not found |
| **APQC version-upgrade wizard — diff (added/renamed/removed) + re-point classifications & provenance by stable id** | **Strong** (distinctive) | Not found | Not found | Not found |
| Enterprise-scale mining connectors (live system extraction) | Partial (CSV/event-log import) | **Strong** | **Strong** | Not found |
| Org-wide process-intelligence dashboards / KPIs | Partial | **Strong** | **Strong** | Partial |
| Repository governance at enterprise scale | Partial | **Strong** | **Strong** | Partial |
| SharePoint / OneDrive integration | **Strong** | Partial | Partial | Not found |
| Backup / restore / portable account snapshot | **Strong** | Partial | Partial | Partial |
| Self-serve tiered subscriptions | **Strong** | Not found (enterprise sales) | Not found (enterprise sales) | Partial |

---

## Where Diagramatix now leads

1. **Mining-proven control effectiveness on one model.** Risks/controls sit on the same process the mining engine analyses, so the Risk-Control Matrix shows whether each control actually *operates* ("bypassed in N of M cases") — the enterprise suites keep GRC and process mining in separate products.
2. **Continuous, org-wide compliance monitoring.** The Compliance Monitoring console trends each control's operating-effectiveness *over time* across every project in the organisation, with declining-control and below-threshold alerts and a by-project posture view — governance as an ongoing monitor, not a one-off matrix. Enterprise suites provide this only by stitching a process-intelligence product to a separate GRC product.
3. **The integrated loop.** Mining output feeds a calibrated simulation twin in one click — discovery, conformance and simulation aren't separate modules with separate effort.
4. **Entity-lifecycle conformance.** State-machine discovery + replay against a reference lifecycle (legal states/transitions) is more precise than DFG-only conformance and rare at this tier.
5. **APQC as a living, org-owned framework.** Not just a browsable library (PRIME) or static reference models (ARIS/Signavio): classify against it, **generate running models from it**, measure **coverage** and **compliance by category**, and **compose/version/divisionalise** your own tailored framework with provenance and a stable-id upgrade wizard. This is the "governed process architecture, provenance-linked to APQC, wired to live models/mining/controls" that no single competitor product offers.
6. **Input breadth + self-service economics.** Text, image and voice to diagram across every notation; Visio round-trip both directions; free tier + self-serve upgrade vs enterprise sales motions.

## Where Diagramatix still trails (honest gaps)

1. **Enterprise mining at scale.** Diagramatix mines uploaded event logs; Celonis/Signavio PI/ARIS extract live from source systems (SAP, ServiceNow…) with pre-built connectors and org-wide dashboards.
2. **Repository governance.** ARIS/Signavio offer deep repository objects, glossaries, lifecycle governance and enterprise access control beyond project sharing.
3. **Org-wide analytics surface (general process intelligence).** For **compliance** specifically this is now covered — the Compliance Monitoring console trends control effectiveness org-wide across projects. A general **process-intelligence KPI dashboard** (throughput, cycle-time and cost analytics across the whole organisation, live) is still not present.

*(Risk/compliance is no longer a gap — see the GRC rows above; org-wide compliance trending is now shipped.)*

---

## Recommended positioning statements

- **vs Signavio/ARIS:** "The full model-to-mine-to-govern-to-simulate loop, self-service, without the enterprise stack or the enterprise bill — with control effectiveness proven from your own event data on the same model, and monitored organisation-wide over time."
- **vs Celonis:** "Bring your event log; get discovery, conformance, a runnable digital twin **and** a Risk-Control Matrix that shows which controls were bypassed — not just a dashboard."
- **vs PRIME BPM:** "Everything PRIME does for BPMN improvement, plus real process mining, conformance, digital-twin simulation and a data-proven Risk-Control Matrix — and where PRIME gives you the APQC *library*, we let you **generate models from it, measure coverage, report compliance by category, and build your own tailored, upgradeable framework**."
- **On process standards / APQC:** "Don't just browse the APQC framework — classify against it, generate running models from it, see exactly what you've modelled versus the standard, report control-effectiveness by APQC category, and compose your own governed, upgradeable framework that stays provenance-linked to APQC across releases."
- **On compliance:** "Not just a Risk-Control Matrix — a live compliance monitor that trends whether your controls keep operating, organisation-wide, from your own event data, and flags the ones sliding below threshold."

---

*Assessments reflect public product material as of 8 July 2026 and the current Diagramatix feature catalogue. "Not found" indicates no confirmed public evidence, not proven absence. Competitor GRC / process-intelligence / APQC-content cells (SAP GRC + Signavio PI / ARIS ARCM + ARIS Mining; PRIME BPM's APQC library; ARIS/Signavio reference models) reflect documented capabilities and warrant a human verification pass before external use.*
