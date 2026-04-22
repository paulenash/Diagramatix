# Diagramatix vs SAP Signavio — BPMN & Value Chain Feature Comparison

*Compiled: April 2026. Diagramatix data from current codebase (app version 1.8.x). Signavio data from public product pages, user guides, and SAP Help Portal accessed April 2026.*

---

## 1. Executive summary

**Diagramatix** is a focused diagramming and design tool for BPMN, Value Chain, State Machine, Domain, Context, Process Context, and Basic flowcharts. Its differentiators are an **opinionated layout engine** (50+ codified positioning rules), **two-phase AI generation** (plan-first, layout-after, with a fully editable plan), and a tight interaction model (select-and-click-to-connect, smart auto-connect, drop-on-connector splitting, insert-space marker, force-connect).

**SAP Signavio** is the process-design tier of SAP's broader **Business Process Transformation Suite**. Beyond modelling, Signavio integrates with **Process Intelligence** (process mining), **Process Governance** (approval workflows), **Process Collaboration Hub** (publishing), **Cloud ALM** (transfer-to-implementation), and SAP Business AI.

The short version: **Diagramatix beats Signavio on layout quality, AI-driven auto-generation, and price-point focus.** **Signavio wins decisively on governance, execution / process mining integration, and enterprise ecosystem depth.** The products are aimed at very different user segments — Diagramatix at individuals and small teams who want a great authoring experience; Signavio at enterprise BPM programmes inside SAP customers.

---

## 2. BPMN modelling

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| BPMN 2.0 notation | Partial (core shapes + common markers) | ✅ Full BPMN 2.0 |
| Process, Collaboration, Choreography, Conversation diagrams | Process + Collaboration (pools, message flows) | ✅ All four |
| Task types (user, service, send, receive, manual, script, business-rule) | ✅ All 6 + 7th "none" | ✅ All |
| Event triggers (message, timer, error, signal, escalation, etc.) | ✅ 9+ event-types | ✅ Full BPMN catalogue |
| Gateways (exclusive / parallel / inclusive / event-based) | ✅ First three; event-based palette entry | ✅ All four |
| Pools / lanes / sub-lanes (white-box + black-box) | ✅ Nested, black-box = external or system | ✅ |
| Subprocesses — collapsed + expanded | ✅ | ✅ |
| Event Expanded Subprocess | ✅ Auto-detected, wrapped in normal sub (R29), stacked at bottom (R49) | ✅ |
| Boundary events (interrupting + non-interrupting, 4 sides) | ✅ Outer-facing exit point (R47); language detection for "non-interrupting" (R46) | ✅ |
| Data objects, data stores, groups, text annotations | ✅ | ✅ |
| Templates (built-in + user) | ✅ Admin-curated + personal | ✅ "Reusable elements" + SAP best-practice library of 5,000+ models |
| BPMN validation / syntax checking | Partial (gateway matching enforced; element constraints in layout rules) | ✅ Real-time syntax + modelling conventions + configurable rule packs |
| CMMN / DMN | ❌ | ✅ (DMN decision tables, CMMN cases) |

### Verdict

Signavio has the deeper notation support (CMMN/DMN, full BPMN 2.0) and more formal validation. Diagramatix has the full BPMN palette you'll use 95% of the time, plus unique features: **AI-generation-aware rules** (R43, R45, R50, R55) that place a generated plan correctly on first render.

---

## 3. BPMN layout & routing

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| Orthogonal connector routing | ✅ Rectilinear with obstacle avoidance | ✅ |
| Direct + curvilinear alternates | ✅ Per-connector selection | Partial (style-level) |
| Automatic node positioning | ✅ Deep: 50+ codified layout rules | ✅ Basic auto-layout |
| Pool / lane auto-sizing | ✅ R52 (never overlap), R57 (grows to enclose descendants) | ✅ |
| Gateway branch placement | ✅ R45 (4+ branch asymmetric stacking); R55 (nested re-stack around gateway Y) | Manual / basic |
| Nested gateway alignment | ✅ R44 (decision + paired merge aligned to predecessor Y) | Manual |
| Decision-gateway label placement rules | ✅ R42 (source-anchored per-side placement at pixel precision) | Standard BPMN |
| Event-side nearest-to-target | ✅ R53 | Manual |
| Boundary event Y-alignment with connected task | ✅ R50 | Manual |
| Move elements → connectors re-route live | ✅ | ✅ |
| Drop-on-connector splits the flow | ✅ | ❌ (not documented) |
| Insert-space marker (push content to make room) | ✅ Ctrl+click marker, 4-directional Shift-drag | ❌ |

### Verdict

**Diagramatix wins on layout quality.** Signavio's auto-layout is a utility; Diagramatix's is a modelling philosophy — its rule set is explicitly aimed at producing publish-ready diagrams without manual tidy-up, especially from AI output.

---

## 4. AI & automation

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| Natural-language → BPMN diagram | ✅ 2-phase Plan + Apply. Plan is fully editable JSON before layout runs. Prompt attachments (PDF, text) supported. | ✅ Natural-language input; AI-generated models grounded in 5,000+ SAP best practices |
| AI-generated annotation | ✅ R56 — attaches "AI Generated" + prompt name to Start Event | ❌ (not documented) |
| Editable plan view between Plan and Apply | ✅ 4 tabs (Pools/Lanes, Elements, Connectors, Raw JSON), all live-synced | ❌ (AI output goes straight to canvas) |
| Saved prompts (including persisted plan JSON) | ✅ | ❌ |
| AI recommendations grounded in industry content | ❌ | ✅ SAP best-practice library |
| AI-suggested KPIs / performance indicators | ❌ | ✅ |

### Verdict

**Different design philosophies.** Signavio's AI is about leveraging enterprise content (SAP best practices); Diagramatix's AI is about **quality and iteration** — the plan JSON is the source of truth, users shape it before layout, re-plan freely, save-and-reload with state intact.

---

## 5. Interaction & authoring UX

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| Select / Connect protocol | ✅ 3-state: Idle → Selected → Connection-Creation, colour-coded outlines | Standard drag-from-handles |
| Force-connect (bypasses validation) | ✅ Shift+Ctrl+click | Unknown |
| Auto-connect on drop | ✅ 3-case heuristic (left-neighbour, vertical-overlap, gateway-group) | Unknown |
| Insert-space marker for pushing content | ✅ 4-directional | ❌ |
| Drop-on-connector splits connector | ✅ | ❌ |
| Multi-select + rubber-band (Shift-drag) | ✅ | ✅ |
| Alignment tools (standard + smart) | ✅ Smart-align uses union-find clustering | ✅ Basic align |
| Templates (stamp pre-made groups) | ✅ | ✅ |
| Undo / redo | ✅ Ctrl+Z / Ctrl+Y | ✅ |
| Keyboard nudge (5 px / 1 px with Shift) | ✅ | Standard |
| Hand-drawn display mode | ✅ Italic font + wobbly SVG filter | ❌ |
| Quick-add popup (right-click) | ✅ BPMN only | ❌ |

### Verdict

**Diagramatix is the better authoring experience** for a single modeller. The insert-space marker, drop-on-connector, smart alignment, and hand-drawn mode are all features Signavio doesn't document.

---

## 6. Value Chain

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| Value Chain / high-level process overview | ✅ Dedicated diagram type (chevrons + pentagons) | ✅ Value Chain diagrams + Navigation Maps |
| Chevron symbol (notched pentagon) | ✅ Primary process shape | ✅ |
| Value Analysis — VA / NNVA / NVA classification per process | ✅ Badges on chevrons + cycle / wait time properties | Partial (Process Intelligence provides real mined data) |
| Bottleneck highlighting on flows | ✅ Checkbox in Properties → purple overlay | Partial (surfaced via Process Intelligence KPIs) |
| 5 chevron colour themes (Sunrise, Ocean, Garden, Berry, Earth) | ✅ | Standard colours |
| Description popover below chevron | ✅ Auto-wrap, inline-editable | ❌ |
| Auto horizontal-snap for interlocking chevrons | ✅ 75% vertical overlap triggers snap | Manual |
| Nested Value Chains with auto-shading | ✅ 25% lighter per nesting level | ❌ |
| Drill-through from collapsed chevron to linked diagram | ✅ +marker icon, green = linked | ✅ via Navigation Maps |
| Linkage to measured process performance (process mining) | ❌ | ✅ via SAP Process Intelligence |

### Verdict

**Mixed.** Diagramatix's Value Chain diagram is visually richer and more opinionated (chevron themes, nesting with auto-shade, VA/NNVA/NVA badges, bottleneck overlay, description popovers). Signavio's is more utilitarian but **connects to live process mining** — Signavio can show you where the bottleneck *actually is* from event-log data, while Diagramatix relies on the modeller to mark it up manually.

---

## 7. Export & interop

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| PDF export (scalable) | ✅ 100% / 75% / 50% / 25% | ✅ |
| SVG export | ✅ | ✅ |
| Visio (.vsdx) export | ✅ V2 and V3 (BPMN only) | ✅ |
| Native JSON round-trip | ✅ | ✅ |
| XML export with XSD schema + version tracking | ✅ | ✅ |
| DDL import (PostgreSQL / MySQL / SQL Server) → Domain diagram | ✅ | ❌ |
| DDL generation from Domain diagram | ✅ | ❌ |
| Transfer to executable / runtime (SAP Cloud ALM, BPMN engine, Camunda etc.) | ❌ | ✅ SAP Cloud ALM bridge |
| Published read-only portal for end-users | ❌ (share link only) | ✅ Process Collaboration Hub |

### Verdict

Signavio has the richer enterprise outputs — **Cloud ALM bridge** for transferring models to implementation, and a dedicated **Process Collaboration Hub** for publishing read-only models to the wider organisation. Diagramatix's DDL-to-Domain-diagram round-trip is a niche feature Signavio doesn't have.

---

## 8. Governance, collaboration & enterprise features

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| Real-time multi-user editing | ❌ Single-editor | ✅ Cloud-native collaborative modelling |
| Commenting / review | ❌ | ✅ |
| Approval workflows for diagram publishing | ❌ | ✅ BPMN-based approval flows in Process Governance |
| Version history | ✅ DiagramHistory snapshots | ✅ |
| Variant management (multi-variant processes) | ❌ | ✅ |
| Organisation roles | ✅ 8 coarse roles (Owner, Admin, RiskOwner, ProcessOwner, ControlOwner, InternalAudit, BoardObserver, Viewer) | ✅ |
| Element-level ACLs | ❌ | Partial |
| Impersonation (superuser view-as) | ✅ (cookie-based, paul@nashcc.com.au) | ✅ |
| Projects + folders | ✅ Drag between folders | ✅ |
| Sharing | Basic share/unshare | ✅ Full lifecycle |
| Audit trail (who changed what) | Implicit via DiagramHistory | ✅ Full audit + compliance |

### Verdict

**Signavio dominates here.** Diagramatix is designed for individuals and small teams; Signavio is an enterprise governance platform. Real-time co-editing, approval workflows, variant management, and audit trails are table-stakes for Signavio buyers.

---

## 9. Process execution & mining

| Feature | Diagramatix | SAP Signavio |
|---|---|---|
| Token-flow simulation | ❌ | ✅ BPMN simulation (scenario testing, path analysis) |
| Process mining (event-log discovery) | ❌ | ✅ SAP Signavio Process Intelligence |
| Conformance checking (model vs logs) | ❌ | ✅ |
| KPI dashboards from executed processes | ❌ | ✅ |
| BPMN execution engine | ❌ | ❌ (design-time only; executes via Cloud ALM / partner engines) |
| Workflow deployment | ❌ | ✅ via Process Governance |

### Verdict

**Signavio wins decisively.** Diagramatix is a modelling tool, full stop — no runtime, no simulation, no mining. Signavio spans design-time AND run-time / analysis through its broader suite (Process Intelligence, Process Governance, Cloud ALM).

---

## 10. Pricing & deployment

| | Diagramatix | SAP Signavio |
|---|---|---|
| Deployment | Self-hosted Next.js / Postgres (on-prem) | SaaS (SAP BTP cloud) |
| Minimum seat commitment | None | Enterprise contract |
| Typical pricing | Direct / free to internal use | Enterprise (public pricing not disclosed; typically USD 100k+/yr) |
| On-prem option | ✅ | Limited |

---

## 11. Where Diagramatix is stronger

1. **Layout quality out-of-the-box** — 50+ codified rules produce publish-ready diagrams without manual cleanup, especially from AI output. Signavio's auto-layout is rudimentary by comparison.
2. **AI-generation UX** — 2-phase Plan + Apply with an editable plan view is a genuinely novel pattern. Users can iterate on structure before any positioning runs.
3. **Interaction polish** — insert-space marker, drop-on-connector split, smart auto-connect, force-connect, hand-drawn mode.
4. **Value Chain richness** — chevron themes, nested auto-shading, description popovers, VA/NNVA/NVA badges, bottleneck overlays, horizontal-snap interlocking.
5. **Focused scope, focused UX** — BPMN + 6 other diagram types in a single coherent tool. No enterprise-suite bloat.
6. **Self-hosted, no cloud lock-in.**
7. **Lower price-point** for individuals and small teams.
8. **DDL ↔ Domain diagram round-trip** — a niche feature Signavio lacks.

## 12. Where Signavio is stronger

1. **Full BPMN 2.0 + CMMN + DMN** — Diagramatix covers the common 80% of BPMN; Signavio covers the formal spec plus the adjacent decision/case-management standards.
2. **Real-time collaboration** — multiple users editing the same diagram simultaneously. Diagramatix is single-editor.
3. **Approval & publishing workflows** — Process Governance provides formal BPMN-based approval flows. Diagramatix has no such concept.
4. **Publishing to read-only portal** — Process Collaboration Hub for organisation-wide visibility.
5. **Process mining integration** — Signavio Process Intelligence discovers real processes from event logs, something Diagramatix can't do at all.
6. **BPMN simulation** — token-flow scenario testing, bottleneck analysis from modelled processes.
7. **SAP ecosystem integration** — transfer to Cloud ALM for Clean Core ERP implementation, integration with 5,000+ SAP best-practice models.
8. **Variant management** for complex process landscapes.
9. **Element-level permissions and audit** for compliance-driven environments.

---

## 13. Strategic positioning

Diagramatix and Signavio are **complements more than competitors** in most enterprise accounts — Diagramatix is a modelling / design tool; Signavio is a full process lifecycle platform. Where they overlap is the *diagram-authoring* experience, and there Diagramatix has a quality and UX lead the rules-based layout engine makes hard to replicate.

**Positioning Diagramatix against Signavio** would emphasise:

- "Get publish-ready BPMN in seconds, not hours."
- "AI generation that produces clean diagrams without manual re-layout."
- "Self-hosted, per-seat pricing — no enterprise contract needed."
- "All the diagram authoring, none of the suite bloat."

**Where not to try to compete**:

- Process mining / real-event-log analysis (different product category)
- Enterprise governance lifecycle (approval flows, formal publishing)
- SAP ecosystem (Cloud ALM, best-practice content) — Diagramatix is not tied to any ERP

---

## Sources

- Diagramatix codebase audit — `c:\Git\Diagramatix\diagramatix\` (current branch, April 2026).
- [SAP Signavio Process Modeler product page](https://www.signavio.com/products/process-modeler/)
- [SAP Signavio Business Process Transformation Suite](https://www.signavio.com/)
- [SAP Signavio Process Governance product page](https://www.signavio.com/products/process-governance/)
- [SAP Signavio BPMN 2.0 overview](https://www.signavio.com/bpmn-2-0-for-efficient-process-design/)
- [Business Process Modeling for Process Optimization — SAP Signavio](https://www.signavio.com/business-process-modeling-for-process-optimization/)
- [SAP Signavio Process Collaboration Hub User Guide (PDF, Mar 2026)](https://help.sap.com/doc/966865eb1a274bccadc05e0bded96694/SHIP/en-US/sap-signavio-process-collaboration-hub-user-guide-EN.pdf)
- [SAP Signavio Process Governance User Guide (PDF, Dec 2025)](https://help.sap.com/doc/b7ce20596d9a47b198e52dd845964179/SHIP/en-US/sap-signavio-process-governance-user-guide-en.pdf)
- [SAP Signavio approval workflows documentation](https://documentation.signavio.com/suite/en-us/Content/process-manager/userguide/approval-workflows.htm)
- [Using SAP Best Practices Packages with SAP Signavio (SAP Community)](https://community.sap.com/t5/technology-blog-posts-by-sap/using-sap-best-practices-packages-with-sap-signavio/ba-p/13537457)
