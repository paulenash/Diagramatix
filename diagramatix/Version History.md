# Diagramatix Export Schema — Version History

Extracted from the canonical history block in [`public/diagramatix-export.xsd`](public/diagramatix-export.xsd).

**Two version numbers are tracked**
- **`schemaVersion`** (major.minor) — the export *data-structure* version. Bumped only when fields are added, removed, or renamed. *Major* = breaking change; *minor* = additive (new optional fields). Carried on the `<xs:schema version="…">` attribute.
- **`appVersion`** (major.minor.build) — the Diagramatix *application* version. The build number is the git commit count, so it changes every commit. Injected at runtime via `/api/schema`.

**Current version:** `1.37`. The XSD's own history block starts at **v1.10**; the earlier **v1.2–v1.9** entries below are reconstructed from the `SCHEMA_VERSION` history in [`app/lib/diagram/types.ts`](app/lib/diagram/types.ts). **Schema versioning began at v1.2** (the initial XSD release) — **v1.0–v1.1** predate the export schema (early MVP "boxes + arrows", before a formal/versioned export existed).

> **Maintenance:** keep this file in sync with the schema. On every `SCHEMA_VERSION` bump, update **all three together** — `app/lib/diagram/types.ts` (the constant + its history comment), `public/diagramatix-export.xsd` (its history block + any actual shape change), and **this file** (add a summary-table row *and* a detail section).

> "Schema shape change?" below means the actual **XSD/XML data structure** changed (a new field/element/enum). Most releases bump the version to mark a *feature window* without changing the export shape — the version still advances so importers and the User Guide can detect the release.

---

## Summary (newest first)

| Version | Title | Schema shape change? |
|---|---|---|
| **1.37** | Import competitor BPMN diagrams as-is — diagram-level "free-form / imported layout" (`relaxedLayout`): pools any size/placement (not stacked full-width), rectilinear message flows between non-aligned elements, geometry validation suppressed; AI image import reproduces the vendor's drawn positions + connector attachment/routing (normalised `bounds`) instead of auto-stacking | **Yes** — new optional `relaxedLayout` attribute on `<dgx:data>` |
| **1.36** | Process Portal (org-wide search/browse of published processes; entity "where-used" search by IT-system/team; admin-managed "My Teams" → one-click "Involving me") + primary procedure document per diagram + review-due reminder cron | **Yes** — new optional `<dgx:procedureDoc>` element |
| **1.35** | APQC Process Classification Framework (PCF) — reference library + classify + Create APQC Project/Process + AI grounding + coverage + by-category compliance + tailored frameworks (compose/version/divisions); ©APQC attribution rides on PCF-bearing exports | **Yes** — new optional `<dgx:pcfAttribution>` element |
| **1.34** | DiagramatixMINER standards (no-state logs + Activity→State table, governance IDs → control effectiveness, IEEE XES + OCEL import/export) + Technical Design Notes (SuperAdmin Document Editor + .docx export) + Logical DDL Generation relabel | No |
| **1.33** | Risk & Control — attach Risks/Controls to steps (`element.properties.risk`), coverage + segregation-of-duties checks (B38/B39), Risk-Control Matrix .xlsx export; org-master → project-copy catalog | No (open PropertiesType) |
| **1.32** | DiagramatixMINER Examples — adoptable process-mining sample catalog (`MiningExample`); Accounts Payable starter | No |
| **1.31** | DiagramatixMINER — Process Mining: ingest event logs → discover BPMN + State-Machine → conformance → calibrate a simulation digital twin (`ProcessMiningRun`) | No |
| **1.30** | Simulator resource calendars / working hours — project Calendar + per-team working hours, demand presets, day/time clock; BPSim + `.dgxsim` bundle | No |
| **1.29** | Simulation results & comparison — per-case distribution + histogram, grounded AI assessment, Run History, As-is/To-be example pipeline | No |
| **1.28** | BPMN layout-geometry rules + scanner checks B33/B34/B35 + lane-tiling & EP-resize fixes | No |
| **1.27** | DB-backed User Guide, image library, dictation, backup/restore | No |
| **1.26** | AI clarification (`aiFeedback`) — JSON metadata only | No |
| **1.25** | Simulation connector branch fields serialised in XML | **Yes** — `<dgx:connector>` `branchProbability` / `branchCondition` / `isDefaultFlow` |
| **1.24** | BPMN process Simulator (BPSim-aligned) | No (sim params ride opaquely in `properties.sim`) |
| **1.23** | Entity Lists (governed pool/lane name sources) | No |
| **1.22** | SharePoint/OneDrive integration | **Yes** — `sharepointLink` on data elements |
| **1.21** | Diagram-type identity + backup preview/streaming + restore hardening | No |
| **1.20** | Audit Stage-3 engine fixes (undo/redo, delete cleanup) | No |
| **1.19** | Audit Stage-2 data-integrity / backup fixes | No |
| **1.18** | SuperAdmin/OrgAdmin reorg + message-label rule + project menu | No |
| **1.17** | Context font controls + AI rules + BPMN scanner overhaul | **Yes** — `processFontSize` attribute |
| **1.16** | BPMN right-click picker + editor polish + scanner rules | No |
| **1.15** | Collaboration & Review (Phases 1–3) | **Yes** — enums `review-comment`, `review-comment-link` |
| **1.14** | Bubble Help v2 + Diagram Properties restructure | **Yes** — `<dgx:processOwner>` element |
| **1.13** | Subscriptions Phase 2 foundation (Stripe wiring) | No |
| **1.12** | Subscriptions | No |
| **1.11** | Template groups | No |
| **1.10** | Round-trip serialisation completeness bump | No (restored serialisation of existing v1.9 fields) |
| **1.9** | ArchiMate type + font/database fields (additive XSD catch-up) | **Yes** — `DiagramType "archimate"`, `SymbolType "archimate-shape"`, `ConnectorType "archi-*"` (×11), `poolFontSize`/`laneFontSize`/`database` |
| **1.8** | BPMN `pool.isSystem` first-class + two-phase AI Plan | No (properties key + app workflow) |
| **1.7** | BPMN behaviour batch (event/trigger, sequence rules S1–S8) | No |
| **1.6** | Value Chain label renames + Process Context layout | No (UI label renames) |
| **1.5** | Value Chain diagram type + chevron symbols | **Yes** — `DiagramType "value-chain"`; `chevron`/`chevron-collapsed`/`process-group`; `fillColor`/`description`/`showDescription` |
| **1.4** | State-machine `fork-join` / `submachine` symbols | **Yes** — `SymbolType "fork-join"` / `"submachine"` |
| **1.3** | RepeatType MI values + documented enums/properties | **Yes** — `RepeatType "mi-sequential"`/`"mi-parallel"` |
| **1.2** | Initial XSD release | **Initial schema** |
| **1.0 – 1.1** | Early MVP (boxes + arrows) | — (predate the export schema; no XSD) |

---

## Details (newest first)

### v1.37 — Import competitor BPMN diagrams as-is (free-form / imported layout)  · **shape change**
The one export-shape change is a new **optional boolean `relaxedLayout` attribute** on `<dgx:data>` (alongside `database`): a diagram may carry **`DiagramData.relaxedLayout`**, written only when `true`, so exports without it are unchanged. **Why:** other vendors' BPMN diagrams break two Diagramatix conventions — pools aren't stacked full-width (they can be any size and sit side-by-side) and message flows are rectilinear between elements that aren't vertically aligned. Previously importing one produced a wall of red validation errors and the editor silently re-stacked the pools + forced messages vertical. **Feature scope:** a diagram-level **"Free-form / imported layout"** toggle (Diagram Properties, BPMN only) that (a) suppresses the pure-geometry validation rules (`containment`, `lane-tiling`, `element-overlap`, `pool-header-overrun`, `hanging-message`, container-connector, duplicate-container-name) in both the live and project-wide scanners; (b) stops the reducer's full-width pool cascade + vertical-stack shove so pools keep independent size/placement; and (c) lets message flows route rectilinearly (like sequence connectors) between non-aligned elements instead of the forced shared-x vertical dogleg. **AI image import** gains a **"Reproduce original layout"** option: the vision plan additionally captures each shape's normalised `bounds` and each connector's attachment sides + drawn waypoints, and a dedicated preserved-layout engine path rebuilds the vendor's actual positions (scaled to canvas px, aspect-preserved, with a jitter-repair pass — pool ordering, lane-to-pool snapping, column clustering, containment repair) and sets `relaxedLayout: true`. If the AI's coordinates are unusable it silently falls back to the validated auto-stack layout. Pinned by unit tests T0708–T0711.

### v1.36 — Process Portal + primary procedure document + review-due reminders  · **shape change**
The one export-shape change is a new **optional `<dgx:procedureDoc>` element** on `DiagramDataType` (after `<processOwner>`): a diagram may carry an optional **`DiagramData.procedureDoc`** (`{ url, name? }`) — the written SOP linked to the process — mirroring the `<processOwner>` pattern (required `url`, optional `name`). Exports without one are unchanged. **Feature scope (all runtime/app, NOT part of the diagram export):** the **Process Portal** (`/portal`) — an org-wide, access-scoped **search-first** discovery surface over *published* processes, with facets for APQC category, type, owner, review status, and **entity "where-used"** (IT-system / team-role, matched to the Org Entity Lists with team→role roll-up, un-catalogued labels flagged) plus a one-click **"Involving me"** view; **admin-managed team membership** (new `OrgMemberTeam` table; OrgAdmin for their org, SuperAdmin for all) drives "Involving me"; a per-diagram **primary procedure document** surfaced read-only in the Portal + viewer; and a **review-due reminder cron** that fires the (already-defined) `review-due` notification when a published diagram/bundle passes its next-review date. The Portal reads denormalised `Diagram` columns (`procedureDoc*`, `pcf*`, `entityRefs`) derived from `data` on every save — a query optimisation only, so they are **not** in the diagram export. Pinned by unit tests T0696–T0703.

### v1.35 — APQC Process Classification Framework (PCF)  · **shape change**
Adds a full APQC PCF capability (L0–L5). The one export-shape change is a new **optional top-level `<dgx:pcfAttribution>` element** on the export root (between `<project>` and `<diagrams>`): whenever an export carries **PCF-derived content** — a diagram-level classification or an element tagged with a `pcfId`/code — it now includes APQC's **verbatim ©notice**, because APQC's royalty-free licence grants copy/modify/redistribute rights *provided every copy and derivative carries the notice*. Exports with no PCF content are unchanged. Diagrams may carry an optional **`DiagramData.pcf`** classification (`{ nodeId, pcfId, hierarchyId, name, frameworkId, variant, …}`) and elements an optional **`properties.pcfHierarchyId`/`pcfId`** (the open `PropertiesType` already permitted the latter). **Feature scope:** reference frameworks import from APQC `.xlsx` (new runtime tables `PcfFramework` + `PcfNode`); diagrams classify against a node; **Create APQC Project** seeds a folder tree (root + relative depth) and **Create APQC Process** generates a BPMN model (decompose non-Task nodes into Collapsed Subprocesses, or AI-generate a Task-level leaf, with optional APQC numbering); a new **`Project.pcf`** column records the association and defaults the diagram flow; the AI generator is grounded on the selected branch; **coverage** analytics show which processes are modelled; **compliance** rolls control-effectiveness up **by APQC category**; and orgs build **tailored frameworks** (compose branches with `sourcePcfId` provenance, extend with custom nodes, curate, divisions) with a **version-upgrade wizard** that re-points classifications + provenance by stable `pcfId`. OSB benchmark *values* are never imported (only a `metricsAvailable` flag). Pinned by unit tests T0660–T0672.

### v1.34 — DiagramatixMINER standards + Technical Design Notes + Logical DDL
No diagram-export shape change — Miner ingest/interchange, an application document, and a relabel; the version advances with the release window. **Miner standards:** an event log may now omit the **State** column — an editable **Activity→State** table supplies the lifecycle the discovery, conformance and generated State-Machine rely on, so a classic 3-column (Case, Activity, Timestamp) log imports directly. Events may carry **Control / Risk / Policy IDs**; a mined **governance** aggregate (new `ProcessMiningRun.governance` JSON column) computes per-control *applied / expected / bypassed / effectiveness* and feeds control operating-effectiveness in the Risk-Control Matrix directly (alongside the conformance-deviation path). Logs **import and export as IEEE XES (1849)** and **OCEL 2.0/1.0** in addition to CSV/TSV (export is variant-level; OCEL import is a single-object projection). A new activity-only Service-Desk mining example ships with three choosable periods. **Technical Design Notes:** the User-Guide editor generalises into a **Document Editor** over a `collection` discriminator (`user-guide` vs `tech-design`) on `HelpChapter`/`HelpSection`; a SuperAdmin-only Technical Design Notes document (Simulator / Miner / RCM design + interchange-standards summaries) is seeded and read at `/tech-notes`, and any document exports to a Word **`.docx`** file. **Logical DDL:** the Diagramatix DDL generator is relabelled **"Logical DDL Generation"** (it emits the curated logical data model of the diagram domain). Pinned by unit tests T0639–T0650.

### v1.33 — Risk & Control
`element.properties.risk` may carry `{ riskRefs[], controlRefs[] }` (each a catalog item id + cached code/label) — the only diagram-export change, permitted by the open `PropertiesType` (as with v1.24 sim params / v1.30 `calendarId`), so the XSD structure is unchanged. New DB tables `RiskControlLibrary` + `RiskControlItem` + `RiskControlLink` (an org master adopted into a project copy, like Entity Lists; scoped backup carries them). Two structure rules — **B38** control-coverage, **B39** segregation-of-duties — plus a multi-sheet **Risk-Control Matrix `.xlsx`** export (audit grid + registers + traceability + coverage). Control operating-effectiveness is proven from a mined run's conformance deviations.

### v1.32 — DiagramatixMINER Examples
An adoptable process-mining sample catalog (mirrors Simulator Examples). New runtime table `MiningExample` (global catalog; `package` JSON carries a compressed event log + reference State-Machine diagrams). One-click "Load & open" adopts a ready `ProcessMiningRun` + the reference diagrams into a fresh project; SuperAdmins author more by capturing a run. Ships the Accounts Payable invoice-lifecycle starter. Runtime only — no diagram-export or XSD shape change.

### v1.31 — DiagramatixMINER (Process Mining)
Ingest event logs → discover the implied BPMN + a candidate State-Machine, check state-change conformance against a reference State-Machine, and calibrate a simulation "digital twin" from the mined timing/resource data (cycle times, arrivals, branch probabilities, teams, working hours) that opens in the Simulator. New runtime table `ProcessMiningRun` (compressed variants + stats + performance; backup picks it up automatically). Discovered diagrams are ordinary bpmn/state-machine diagrams — no diagram-export or XSD shape change.

### v1.30 — Simulator resource calendars / working hours
A project-level Calendar + per-team working hours (with an off-shift dim cue and a day/time clock in the animation), demand presets, and full **BPSim** + `.dgxsim` bundle import/export for the simulation-parameter layer. Simulation runtime/parameters are application database tables, not part of the diagram export — no XSD shape change.

### v1.29 — Simulation results & comparison
No schema shape change — simulation runtime, results and example-catalogue only; the version advances with the release window. **Per-case distribution:** the engine now retains individual case flow times (not just each replication's average), so the report shows true per-case **Typical (p50)**, **Near worst (p95)** and **Spread (sd)** plus a **distribution histogram** — the old p50/p95 were run-averages that badly understated the tail (e.g. an As-is near-worst of ~310 min was showing as ~192); the run-to-run figure is kept as a **± confidence** on the mean. **Grounded AI assessment:** an "✨ Explain these results" button on a comparison writes a plain-English verdict — the deltas are computed deterministically and Claude (Opus 4.8) writes the prose from *only* those figures, so it can't misstate a number. **Run History:** runs can be **named** (which pins them) and browsed; unnamed runs prune to the last few per scenario; **any two saved runs** can be compared side by side (e.g. "Large Sales Team (25)" vs "Small Sales Team (3)"), with histograms + assessment. **As-is/To-be example pipeline:** variant-pinned scenarios now survive capture → seed → adopt, and a worked **Aardwolf Loans — As-is vs To-be** comparison ships in the example catalogue. Pinned by unit tests T0542–T0550.

### v1.28 — BPMN layout-geometry rules + scanner checks + lane-tiling & EP-resize fixes
No schema shape change — layout / validation / editor-interaction only; the version advances with the release window. **Rules** (code-enforced, Group 8 "Auto-Layout Placement"): **R8.14** the process Start Event clears its innermost Pool/Lane/Sub-lane inner boundary by ≥ 1 event width (was anchored to the pool header, ignoring the lane's own 36px header); **R8.15** the first connector ≤ 70% of a task width (the first element comes to the start — in the pool just the first element + its data objects, inside an EP the whole inner flow slides left); **R8.16** event labels (esp. edge-mounted) nudged clear of other elements and other event labels; **R8.17** no element placed on top of another (a de-overlap pass separates near-coincident "Cause-A" siblings); **R8.18** the End event hugs its last element within the same ≤ 70% gap. **Scanner checks (`diagramChecks` RULES):** **B33** event-label overlap, **B34** element overlap, **B35** lane tiling (lanes must tile contiguously). **Fixes:** lanes re-tile after late Expanded-Subprocess growth — fixes overlapping lanes that scrambled the on-screen lane order and made a lane boundary un-draggable; and a selected Expanded Subprocess's edge resize no longer drifts the whole element (the selection overlay's edge zone now owns the drag). All pinned by unit tests (T0514–T0530) plus a live-drag Playwright harness.

### v1.27 — DB-backed User Guide + image library + dictation + backup/restore
Application/admin features only — the diagram data structure and the XSD are **unchanged**; the version advances with the release window (same convention as v1.10 / v1.21). Includes the in-app SuperAdmin User Guide editor, an image library (screen capture + upload), global voice dictation, Save & View, Markdown export, SharePoint documents, and a table-level User Guide backup/restore (content + the whole image library, ids preserved).

### v1.26 — AI clarification metadata
`DiagramData` gains optional `aiFeedback` (the AI's open questions + the user's answers, for a clarification round). Lives in the saved JSON, **not** the BPMN XML interchange — no XSD shape change.

### v1.25 — Simulation connector fields serialised  · **shape change**
A `<dgx:connector>` may now carry the decision-gateway branch routing as optional attributes: `branchProbability` (0..100), `branchCondition` (an expression), `isDefaultFlow` (the else edge). Previously in-model only — emitted now, the same way the v1.10 fix restored `bottleneck`. Additive + optional; older exports remain valid; export-only (no importer change). *(Matching DDL-generator columns + User-Guide/Features notes followed separately.)*

### v1.24 — BPMN process Simulator (BPSim-aligned discrete-event simulation)
Per-element baseline simulation parameters (arrival / cycle / wait distributions, team + resource units, loop / multi-instance, event triggers, token property assignments) ride **opaquely** in `element.properties.sim` — the open `PropertiesType` already permits this, so no enumerated schema change. The decision-branch routing fields were added to the Connector data model but the XML/XSD export was left unchanged at 1.24 (deferred to 1.25). Teams, studies, scenarios and runs are application database tables, not part of the diagram export.

### v1.23 — Entity Lists (governed name sources for BPMN pools/lanes)
External Participants, IT Systems, and an Organisation → Org Unit → Team → Role hierarchy, maintained at Org and Project level. No project-XML field changed — pools/lanes still carry a plain label; the names are simply drawn from a project's adopted/created structure. Version bumped to mark the feature window (same convention as v1.21).

### v1.22 — SharePoint/OneDrive integration  · **shape change**
Data Objects / Data Stores may carry a `sharepointLink` (the linked file's metadata). Additive optional field on data elements; older exports remain valid.

### v1.21 — Diagram-type identity + backup preview/streaming + restore hardening
No shape change. Per-type 2-char codes + pastel colours live in the admin-managed `DiagramTypeStyle` table (not embedded in an export). Backups gain a pre-flight preview, member/Org selection, and live streaming progress; user + rules/prompts restores are now transactional. Version bumped to mark the feature window.

### v1.20 — Audit Stage-3 engine fixes
No shape change. Undo/redo now preserves title/fonts/database/processOwner/parentDiagramIds (so a round-tripped export is unaffected by an undo); `DELETE_ELEMENT` cleans up connectors on a removed host's boundary events; property setters clear the stale redo branch. All behavioural.

### v1.19 — Audit Stage-2 data-integrity fixes
No shape change. Backend/restore only: author-attribution FKs made nullable + SET NULL; full backup now captures + restores every model; wipe-restore breaks the Diagram↔PublishedVersion FK cycle. None touch the export shape.

### v1.18 — SuperAdmin / OrgAdmin reorg + messageBPMN label rule + project menu
No shape change — all behavioural.
- **messageBPMN labels** now anchor to the **source** attachment point (Paul's rule, Scenario 4): the label moves rigidly with the source endpoint; when only the target side moves, the label stays put. Applied across MOVE/RESIZE paths.
- Black-box pool bottom-edge engagement fixed — a boundary click starts a resize on the first attempt.
- **Project tile** destructive actions moved to a right-click context menu with three tiers: `×` (delete project, diagrams → Unorganised), `×+` (delete, diagrams → Archive; OrgAdmin), `×++` (hard delete project + every diagram; SuperAdmin + Owner). Inline icons collapse to just clone (⧉).
- **Role colours:** SuperAdmin entry points/actions are RED; OrgAdmin remains orange — across every chip, header and admin nav link.
- SuperAdmin pages renamed from "Admin —" to plain names; back link styled as a blue hyperlink honouring `?from=`.
- Bubble Help editor migrated to `/dashboard/admin/bubble-help`; BPMN Scanner Rules moved to the SuperAdmin nav.
- Registered Users table sortable/filterable per column; OrgAdmin landing page at `/dashboard/org-admin`.
- New scan rule **B32** (Pool/Lane labels must fit the rotated header); new AI rule **R7.05** (black-box pool names use Shift-Enter on word boundaries).
- Connector-drag auto-scrolls near a viewport edge; Diagram Issues popup is draggable; dirty-aware Save/Cancel across the admin editors.

### v1.17 — Context font controls + AI rules + BPMN scanner overhaul  · **shape change**
**One shape change:** `<dgx:data>` gains optional `processFontSize` (xs:decimal) — the Context-Diagram process-system label size, independent from entity labels (`fontSize`), connector labels (`connectorFontSize`) and title (`titleFontSize`). Default 16; pre-1.17 exports omit it.

Behaviour-only changes under the same bump:
- Context Diagram AI Generate code-enforces C3.* (process radius cap, entity-face spread, ≥20 px cluster spacing, label stagger); endpoint nudge wraps around circle circumference.
- Per-Context font controls (Entity Names / Process Names / Flow Labels).
- Process Context AI Generate enforces P2.08–P2.11; hardcoded process-numbering removed.
- BPMN scanner rule registry gains stable codes **B01..B31** (flat viewer at `/dashboard/admin/scanner-rules`); B14 rewritten as a per-Task trigger matrix; B29/B30 sequence-clip rules; B31 manual-task-no-IT-message.
- BPMN AI Generate accepts image attachments (PNG/JPEG/WebP/GIF) — Sonnet vision reverse-engineers BPMN from a screenshot; two-phase plan pipeline.
- messageBPMN emits 4 waypoints + invisible leaders so AI message flows are body-draggable.
- "Create Prompt from Diagram" admin block (Technical Description + Staff Narrative).
- AI Plan Formats viewer per diagram type; admin link moved to the leftmost menu item; Matrix toggle moved bottom-left.

### v1.16 — BPMN right-click picker + editor polish + scanner rules
No shape change (GatewayTypeEnum/GatewayRoleEnum already existed). Documents behavioural changes:
- Gateway right-click "type-picker" exposes `gatewayType` *and* `properties.gatewayRole` in one menu.
- Intermediate-event Trigger list drops "Terminate" (reserved for end events); existing `terminate` values stay readable.
- Intermediate events gain a "Flow Type" section (None / Catching / Throwing → `flowType`).
- Properties label "Element" → "Gateway Type".
- Four additive diagram-check rules: activity must have incoming AND outgoing sequence (event-subs / process-scope EPs exempt); 4+-bend sequences flagged orange; Task/Sub-Process type should match its message flows.
- Sub-process right-click "Repeat" section (None / Loop / MI Sequential / MI Parallel → `repeatType`).
- Ad-hoc-aware rules: `adhoc-ep-no-start-end`, `adhoc-ep-no-sequence-between-children`; `activity-no-incoming/outgoing` made EP-aware.
- Scan-highlight overlay no longer draws through element centres.
- New data-artefact warnings: `data-object-no-association`, `data-store-no-association`.

### v1.15 — Collaboration & Review (Phases 1–3)  · **shape change**
Two additive enum members, round-tripped as ordinary diagram content:
- `SymbolTypeEnum` + `review-comment` (a reviewer's pink note; `element.properties` carries reviewId / reviewerId / reviewerName / reviewerEmail).
- `ConnectorTypeEnum` + `review-comment-link` (pink link note → element).

The rest — Collaboration Groups, DiagramReview / DiagramReviewer, Notifications — is relational metadata, **not** embedded in an export. Pre-1.15 exports contain neither enum value.

### v1.14 — Bubble Help v2 + Diagram Properties restructure  · **shape change**
Adds one optional element to `<dgx:data>`: `<dgx:processOwner name="…" email="…"/>` (both attributes optional). Pre-1.14 exports omit it; importers treat it as no owner. Bubble Help itself is admin-managed catalog data (BubbleHelp Prisma table) and is **not** embedded in exports.

### v1.13 — Subscriptions Phase 2 foundation (Stripe wiring)
No shape change. New `User` Stripe columns + `SubscriptionLevel.stripePriceId` are user-level/catalog metadata only. Same release covers the Visio v1.6 stencil (fresh BaseID GUIDs), focus-edit zoom on label edits, and the Pool/Lane "Label" → "Name" rename.

### v1.12 — Subscriptions
No shape change. Subscriptions are user-level metadata (`SubscriptionLevel` rows + `User.subscriptionLevelId` / `subscriptionAssignedAt` + `UsageCounter` rows), never embedded in an export. Version bumped to mark the feature window.

### v1.11 — Template groups
No project-export shape change. The new `DiagramTemplate.group` field is serialised in `.diag_tems` template-export files and the `/api/backup` payload (both JSON, not covered by this XSD). Version bumped so consumers can detect the feature window.

### v1.10 — Round-trip serialisation completeness bump
No schema shape change. v1.9 fields that were declared in the XSD but dropped by the serialiser are now emitted + parsed faithfully:
- `<dgx:data>` attributes `poolFontSize`, `laneFontSize`, `database`
- `<dgx:connector>` attribute `bottleneck`

Behavioural changes shipped in this release (Task/Sub-Process Name + autosize, Pool/Lane grow-only, Visio bulk import, scan for issues, Deleted Diagrams hierarchy, etc.) don't alter the data shape. See the `SCHEMA_VERSION` history in `app/lib/diagram/types.ts` for those.

---

> The entries below (**v1.2 – v1.9**) are reconstructed from the `SCHEMA_VERSION` history in `app/lib/diagram/types.ts` — the XSD's own history block doesn't reach this far back.

### v1.9 — ArchiMate + font/database fields (additive XSD catch-up)  · **shape change**
Additive, no breaking changes: `DiagramType "archimate"`, `SymbolType "archimate-shape"`, `ConnectorType "archi-*"` (the 11 ArchiMate relationships); `DiagramData` attributes `poolFontSize`, `laneFontSize`, `database`. *(These were declared here but the serialiser didn't actually emit them until v1.10.)*

Behaviour changes (no schema impact): auto-connect 3-state toggle (on / to-only / off); auto-connect rejects cross-pool candidates and boundary-event endpoints; Insert / Remove Space markers (green INSERT / red REMOVE, direction-aware shift); EP isolation (cross-boundary moves, scoped resize, render above lane/pool backgrounds); sublanes as first-class parents; lane-divider drag redistributes height between adjacent lanes; connector self-avoidance; boundary-event side picking (outer/inner face).

### v1.8 — BPMN `pool.isSystem` first-class + two-phase AI Plan
No enumerated schema change (`isSystem` rides as a properties key in the open `PropertiesType`). `pool.properties.isSystem` is set by the AI Plan (falls back to a label regex). Two-phase AI Plan workflow for BPMN (Plan + Apply Layout endpoints, 4-tab structural editor, plan JSON persisted via `Prompt.planJson`). Pool behaviour: message connectors blocked on white-box pools; orphan messages highlighted red; deleting a lane shrinks the pool height; right-edge resize grip only during a drag. Click model: white-box pool/lane headers are the only selection hit zones (bodies bubble).

### v1.7 — BPMN behaviour batch
No schema shape change. BPMN: Event Type conversion dropdown, Trigger rename, palette reorder, wider pool/lane headers (45/36 px), pool height accommodates vertical name text, sequence-connector rules **S1–S8**, Event Expanded Subprocess isolation, force-connect override (Shift+Ctrl+Click), validation-synced target highlighting, message-connector task-type auto-set (Send / Receive / User), nested-EP shade lightening. AI: document attachment, speech dictation. UI: zoom slider, PDF title export, select-all on focus, no inline edit for events/data elements, Import/Export menu rename.

### v1.6 — Value Chain label renames + Process Context layout
No schema shape change (enum values unchanged). Value-chain display labels renamed: Chevron → Process, Collapsed → Collapsed Process, Process Group → Value Chain. Process Context: zigzag layout, process numbering (P-XX-NN), hourglass auto-scheduler with open-directed connectors, system/team/hourglass actor auto-detection. AI prompts gain a `diagramType` field + dictation. Process ↔ Collapsed Process conversion. Theme auto-reapply on snap/delete; auto-tint value-chain containers.

### v1.5 — Value Chain diagram type + chevron symbols  · **shape change**
Adds `DiagramType "value-chain"`; `SymbolType` values `chevron`, `chevron-collapsed`, `process-group`; new chevron properties `fillColor`, `description`, `showDescription`.

### v1.4 — State-machine fork-join / submachine  · **shape change**
Adds `SymbolType` values `fork-join` / `submachine` for state-machine diagrams; `linkedDiagramId` now also used by submachine.

### v1.3 — RepeatType MI values + documented enums  · **shape change**
Adds `RepeatType` values `mi-sequential` / `mi-parallel`; documents `GatewayRoleEnum`, `SubprocessTypeEnum`, `PoolTypeEnum` and the `element.properties` keys (`adHoc`, `labelOffsetX/Y`, `labelWidth`, `multiplicity`, `role`, `state`, `linkedDiagramId`).

### v1.2 — Initial XSD release  · **initial schema**
The first formalised, versioned export schema — the baseline `<diagramatix-export>` structure (elements, connectors, data) that every later version evolves from.

### v1.0 – v1.1 — Early MVP (pre–export-schema)
These predate the export schema entirely: the early "boxes + arrows" MVP, before a formal/versioned `.xml` / XSD export existed. The schema-version sequence starts at v1.2, so 1.0/1.1 aren't recorded in the schema. *(A precise 1.0/1.1 changelog would have to come from early git history or release notes rather than the export schema.)*
