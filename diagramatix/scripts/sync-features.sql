-- Diagramatix Feature catalog sync (generated) — upsert by name + publish.
-- Idempotent + re-runnable. Paste into the prod Postgres SQL editor.
-- Updates existing features to match the seed and (re)publishes them;
-- inserts the ones prod is missing. Features only on prod are left untouched.

BEGIN;

-- Process Simulator
UPDATE "Feature" SET "summary"='Run your BPMN as a discrete-event simulation — see where work queues, who the bottleneck is, and prove the cost case for a redesign before you change anything.', "details"='- Event-based engine — work items (tokens) flow over a simulated clock; tasks seize limited team capacity, so realistic queues and wait times emerge from contention
- Annotate on the model — per-element arrival, cycle and wait times as statistical distributions (fixed, uniform, triangular, normal, exponential), edited in the Properties panel or a single Simulation Data table
- Full BPMN behaviour — decision-branch probabilities and conditions, loops and multi-instance, expanded and event subprocesses (interrupting + non-interrupting)
- Subprocess roll-up — a subprocess linked to its own diagram drills down and rolls its child''s tasks, teams and times up into the parent (nested links and parallel instances included)
- Shared team pools — teams are reusable resource pools shared across processes; one Study assembles a portfolio of diagrams to reveal cross-process overload
- As-is vs To-be comparison — pin scenarios to different process variants and compare side by side with a plain-language verdict (e.g. "28% faster, +12% throughput, $4.2k less per case, frees ~1.4 FTE")
- Cost & capacity planning — team cost-per-hour drives cost-per-case, total cost and savings, so a redesign has a business case, not just a speed number
- Scenarios, what-ifs & planned interventions — duplicate a baseline, override a capacity or rate, or schedule a timed capacity surge / outage / demand spike / work injection
- Monte-Carlo ranges — replications give mean / p50 / p95 ranges and a bottleneck ranking, not a single misleading number
- Live Matrix replay + Operator — watch green tokens flow and stack at bottlenecks, then ''fork the timeline'': intervene mid-run and re-run deterministically; plus a utilisation heatmap
- Ready-made examples — load a worked example (loan origination, car-repair rework loop) into your own project and demo in two clicks
- BPSim-aligned — parameters follow the OMG/WfMC BPSim standard, with import/export for interchange with other tools',
  "publishedName"="name", "publishedSummary"='Run your BPMN as a discrete-event simulation — see where work queues, who the bottleneck is, and prove the cost case for a redesign before you change anything.', "publishedDetails"='- Event-based engine — work items (tokens) flow over a simulated clock; tasks seize limited team capacity, so realistic queues and wait times emerge from contention
- Annotate on the model — per-element arrival, cycle and wait times as statistical distributions (fixed, uniform, triangular, normal, exponential), edited in the Properties panel or a single Simulation Data table
- Full BPMN behaviour — decision-branch probabilities and conditions, loops and multi-instance, expanded and event subprocesses (interrupting + non-interrupting)
- Subprocess roll-up — a subprocess linked to its own diagram drills down and rolls its child''s tasks, teams and times up into the parent (nested links and parallel instances included)
- Shared team pools — teams are reusable resource pools shared across processes; one Study assembles a portfolio of diagrams to reveal cross-process overload
- As-is vs To-be comparison — pin scenarios to different process variants and compare side by side with a plain-language verdict (e.g. "28% faster, +12% throughput, $4.2k less per case, frees ~1.4 FTE")
- Cost & capacity planning — team cost-per-hour drives cost-per-case, total cost and savings, so a redesign has a business case, not just a speed number
- Scenarios, what-ifs & planned interventions — duplicate a baseline, override a capacity or rate, or schedule a timed capacity surge / outage / demand spike / work injection
- Monte-Carlo ranges — replications give mean / p50 / p95 ranges and a bottleneck ranking, not a single misleading number
- Live Matrix replay + Operator — watch green tokens flow and stack at bottlenecks, then ''fork the timeline'': intervene mid-run and re-run deterministically; plus a utilisation heatmap
- Ready-made examples — load a worked example (loan origination, car-repair rework loop) into your own project and demo in two clicks
- BPSim-aligned — parameters follow the OMG/WfMC BPSim standard, with import/export for interchange with other tools',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Process Simulator';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Process Simulator', 'Run your BPMN as a discrete-event simulation — see where work queues, who the bottleneck is, and prove the cost case for a redesign before you change anything.', '- Event-based engine — work items (tokens) flow over a simulated clock; tasks seize limited team capacity, so realistic queues and wait times emerge from contention
- Annotate on the model — per-element arrival, cycle and wait times as statistical distributions (fixed, uniform, triangular, normal, exponential), edited in the Properties panel or a single Simulation Data table
- Full BPMN behaviour — decision-branch probabilities and conditions, loops and multi-instance, expanded and event subprocesses (interrupting + non-interrupting)
- Subprocess roll-up — a subprocess linked to its own diagram drills down and rolls its child''s tasks, teams and times up into the parent (nested links and parallel instances included)
- Shared team pools — teams are reusable resource pools shared across processes; one Study assembles a portfolio of diagrams to reveal cross-process overload
- As-is vs To-be comparison — pin scenarios to different process variants and compare side by side with a plain-language verdict (e.g. "28% faster, +12% throughput, $4.2k less per case, frees ~1.4 FTE")
- Cost & capacity planning — team cost-per-hour drives cost-per-case, total cost and savings, so a redesign has a business case, not just a speed number
- Scenarios, what-ifs & planned interventions — duplicate a baseline, override a capacity or rate, or schedule a timed capacity surge / outage / demand spike / work injection
- Monte-Carlo ranges — replications give mean / p50 / p95 ranges and a bottleneck ranking, not a single misleading number
- Live Matrix replay + Operator — watch green tokens flow and stack at bottlenecks, then ''fork the timeline'': intervene mid-run and re-run deterministically; plus a utilisation heatmap
- Ready-made examples — load a worked example (loan origination, car-repair rework loop) into your own project and demo in two clicks
- BPSim-aligned — parameters follow the OMG/WfMC BPSim standard, with import/export for interchange with other tools', false, 10, 'Process Simulator', 'Run your BPMN as a discrete-event simulation — see where work queues, who the bottleneck is, and prove the cost case for a redesign before you change anything.', '- Event-based engine — work items (tokens) flow over a simulated clock; tasks seize limited team capacity, so realistic queues and wait times emerge from contention
- Annotate on the model — per-element arrival, cycle and wait times as statistical distributions (fixed, uniform, triangular, normal, exponential), edited in the Properties panel or a single Simulation Data table
- Full BPMN behaviour — decision-branch probabilities and conditions, loops and multi-instance, expanded and event subprocesses (interrupting + non-interrupting)
- Subprocess roll-up — a subprocess linked to its own diagram drills down and rolls its child''s tasks, teams and times up into the parent (nested links and parallel instances included)
- Shared team pools — teams are reusable resource pools shared across processes; one Study assembles a portfolio of diagrams to reveal cross-process overload
- As-is vs To-be comparison — pin scenarios to different process variants and compare side by side with a plain-language verdict (e.g. "28% faster, +12% throughput, $4.2k less per case, frees ~1.4 FTE")
- Cost & capacity planning — team cost-per-hour drives cost-per-case, total cost and savings, so a redesign has a business case, not just a speed number
- Scenarios, what-ifs & planned interventions — duplicate a baseline, override a capacity or rate, or schedule a timed capacity surge / outage / demand spike / work injection
- Monte-Carlo ranges — replications give mean / p50 / p95 ranges and a bottleneck ranking, not a single misleading number
- Live Matrix replay + Operator — watch green tokens flow and stack at bottlenecks, then ''fork the timeline'': intervene mid-run and re-run deterministically; plus a utilisation heatmap
- Ready-made examples — load a worked example (loan origination, car-repair rework loop) into your own project and demo in two clicks
- BPSim-aligned — parameters follow the OMG/WfMC BPSim standard, with import/export for interchange with other tools', false, 10, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Process Simulator');

-- Multi-Notation Diagramming
UPDATE "Feature" SET "summary"='One workspace for every diagram type your team needs — from BPMN to ArchiMate to UML.', "details"='- BPMN 2.0 — pools, lanes, sub-processes, gateways, events, message flows, boundary events
- Process Context — system + actor diagrams with edge connection points
- State Machine — initial / final / composite states, transitions with guards
- Domain models — UML class + enumeration; relational (PK/FK/NOT NULL) variants
- Value Chain (Porter-style)
- ArchiMate — structural, dependency, and dynamic relations
- Use Case — actors, system boundaries, use case ovals',
  "publishedName"="name", "publishedSummary"='One workspace for every diagram type your team needs — from BPMN to ArchiMate to UML.', "publishedDetails"='- BPMN 2.0 — pools, lanes, sub-processes, gateways, events, message flows, boundary events
- Process Context — system + actor diagrams with edge connection points
- State Machine — initial / final / composite states, transitions with guards
- Domain models — UML class + enumeration; relational (PK/FK/NOT NULL) variants
- Value Chain (Porter-style)
- ArchiMate — structural, dependency, and dynamic relations
- Use Case — actors, system boundaries, use case ovals',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Multi-Notation Diagramming';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Multi-Notation Diagramming', 'One workspace for every diagram type your team needs — from BPMN to ArchiMate to UML.', '- BPMN 2.0 — pools, lanes, sub-processes, gateways, events, message flows, boundary events
- Process Context — system + actor diagrams with edge connection points
- State Machine — initial / final / composite states, transitions with guards
- Domain models — UML class + enumeration; relational (PK/FK/NOT NULL) variants
- Value Chain (Porter-style)
- ArchiMate — structural, dependency, and dynamic relations
- Use Case — actors, system boundaries, use case ovals', false, 20, 'Multi-Notation Diagramming', 'One workspace for every diagram type your team needs — from BPMN to ArchiMate to UML.', '- BPMN 2.0 — pools, lanes, sub-processes, gateways, events, message flows, boundary events
- Process Context — system + actor diagrams with edge connection points
- State Machine — initial / final / composite states, transitions with guards
- Domain models — UML class + enumeration; relational (PK/FK/NOT NULL) variants
- Value Chain (Porter-style)
- ArchiMate — structural, dependency, and dynamic relations
- Use Case — actors, system boundaries, use case ovals', false, 20, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Multi-Notation Diagramming');

-- AI-Assisted BPMN Generation
UPDATE "Feature" SET "summary"='Describe the process in plain English; Diagramatix builds a structured BPMN diagram you can refine.', "details"='- Natural-language prompt → end-to-end BPMN diagram in seconds
- Generates pools, lanes, tasks, gateways, and events automatically
- Editable AI rules so you control conventions (sub-process splitting, gateway types, naming)
- Generation history per diagram — try multiple prompts, pick the best
- Powered by Anthropic Claude',
  "publishedName"="name", "publishedSummary"='Describe the process in plain English; Diagramatix builds a structured BPMN diagram you can refine.', "publishedDetails"='- Natural-language prompt → end-to-end BPMN diagram in seconds
- Generates pools, lanes, tasks, gateways, and events automatically
- Editable AI rules so you control conventions (sub-process splitting, gateway types, naming)
- Generation history per diagram — try multiple prompts, pick the best
- Powered by Anthropic Claude',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='AI-Assisted BPMN Generation';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'AI-Assisted BPMN Generation', 'Describe the process in plain English; Diagramatix builds a structured BPMN diagram you can refine.', '- Natural-language prompt → end-to-end BPMN diagram in seconds
- Generates pools, lanes, tasks, gateways, and events automatically
- Editable AI rules so you control conventions (sub-process splitting, gateway types, naming)
- Generation history per diagram — try multiple prompts, pick the best
- Powered by Anthropic Claude', false, 30, 'AI-Assisted BPMN Generation', 'Describe the process in plain English; Diagramatix builds a structured BPMN diagram you can refine.', '- Natural-language prompt → end-to-end BPMN diagram in seconds
- Generates pools, lanes, tasks, gateways, and events automatically
- Editable AI rules so you control conventions (sub-process splitting, gateway types, naming)
- Generation history per diagram — try multiple prompts, pick the best
- Powered by Anthropic Claude', false, 30, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='AI-Assisted BPMN Generation');

-- Smart Connector Routing
UPDATE "Feature" SET "summary"='Connectors that route cleanly around obstacles — no manual zig-zagging.', "details"='- Orthogonal (rectilinear), curvilinear (Bézier), and direct modes per connector
- Automatic hump-over crossings where sequence flows pass each other
- Smart endpoint slots on every side with edge-aware routing
- Waypoint editing for fine-grained control without losing the auto-routing fallback',
  "publishedName"="name", "publishedSummary"='Connectors that route cleanly around obstacles — no manual zig-zagging.', "publishedDetails"='- Orthogonal (rectilinear), curvilinear (Bézier), and direct modes per connector
- Automatic hump-over crossings where sequence flows pass each other
- Smart endpoint slots on every side with edge-aware routing
- Waypoint editing for fine-grained control without losing the auto-routing fallback',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Smart Connector Routing';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Smart Connector Routing', 'Connectors that route cleanly around obstacles — no manual zig-zagging.', '- Orthogonal (rectilinear), curvilinear (Bézier), and direct modes per connector
- Automatic hump-over crossings where sequence flows pass each other
- Smart endpoint slots on every side with edge-aware routing
- Waypoint editing for fine-grained control without losing the auto-routing fallback', false, 40, 'Smart Connector Routing', 'Connectors that route cleanly around obstacles — no manual zig-zagging.', '- Orthogonal (rectilinear), curvilinear (Bézier), and direct modes per connector
- Automatic hump-over crossings where sequence flows pass each other
- Smart endpoint slots on every side with edge-aware routing
- Waypoint editing for fine-grained control without losing the auto-routing fallback', false, 40, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Smart Connector Routing');

-- Microsoft Visio Round-Trip
UPDATE "Feature" SET "summary"='Author in Diagramatix, share with Visio users, get edits back — no loss in translation.', "details"='- Export any BPMN diagram as a native `.vsdx` file
- Dedicated "Diagramatix Shapes" v1.6 stencil with proper BPMN markers
- Re-import Visio-edited `.vsdx` back into Diagramatix with style preserved
- Free downloadable stencil for recipients editing in Visio',
  "publishedName"="name", "publishedSummary"='Author in Diagramatix, share with Visio users, get edits back — no loss in translation.', "publishedDetails"='- Export any BPMN diagram as a native `.vsdx` file
- Dedicated "Diagramatix Shapes" v1.6 stencil with proper BPMN markers
- Re-import Visio-edited `.vsdx` back into Diagramatix with style preserved
- Free downloadable stencil for recipients editing in Visio',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Microsoft Visio Round-Trip';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Microsoft Visio Round-Trip', 'Author in Diagramatix, share with Visio users, get edits back — no loss in translation.', '- Export any BPMN diagram as a native `.vsdx` file
- Dedicated "Diagramatix Shapes" v1.6 stencil with proper BPMN markers
- Re-import Visio-edited `.vsdx` back into Diagramatix with style preserved
- Free downloadable stencil for recipients editing in Visio', false, 50, 'Microsoft Visio Round-Trip', 'Author in Diagramatix, share with Visio users, get edits back — no loss in translation.', '- Export any BPMN diagram as a native `.vsdx` file
- Dedicated "Diagramatix Shapes" v1.6 stencil with proper BPMN markers
- Re-import Visio-edited `.vsdx` back into Diagramatix with style preserved
- Free downloadable stencil for recipients editing in Visio', false, 50, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Microsoft Visio Round-Trip');

-- BPMN 2.0 XML Import
UPDATE "Feature" SET "summary"='Bring diagrams in from any BPMN-compliant tool.', "details"='- Standard BPMN 2.0 XML parser (pools, lanes, tasks, gateways, events, message flows, sub-processes)
- Layout heuristics auto-position elements when the XML lacks coordinates
- Validation report flags unsupported BPMN features',
  "publishedName"="name", "publishedSummary"='Bring diagrams in from any BPMN-compliant tool.', "publishedDetails"='- Standard BPMN 2.0 XML parser (pools, lanes, tasks, gateways, events, message flows, sub-processes)
- Layout heuristics auto-position elements when the XML lacks coordinates
- Validation report flags unsupported BPMN features',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='BPMN 2.0 XML Import';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'BPMN 2.0 XML Import', 'Bring diagrams in from any BPMN-compliant tool.', '- Standard BPMN 2.0 XML parser (pools, lanes, tasks, gateways, events, message flows, sub-processes)
- Layout heuristics auto-position elements when the XML lacks coordinates
- Validation report flags unsupported BPMN features', false, 60, 'BPMN 2.0 XML Import', 'Bring diagrams in from any BPMN-compliant tool.', '- Standard BPMN 2.0 XML parser (pools, lanes, tasks, gateways, events, message flows, sub-processes)
- Layout heuristics auto-position elements when the XML lacks coordinates
- Validation report flags unsupported BPMN features', false, 60, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='BPMN 2.0 XML Import');

-- Cross-Functional Flowcharts (Pools / Lanes / Sub-Lanes)
UPDATE "Feature" SET "summary"='Model your organisation as it really works — multi-pool, multi-lane, multi-sub-lane.', "details"='- Drag-drop pools onto the canvas; lanes auto-fit
- Sub-lanes (lanes within lanes) for matrix orgs
- Lane-and-pool grow-only on content add (no surprise shrinking)
- Independent lane font sizes, header widths, and label rotation',
  "publishedName"="name", "publishedSummary"='Model your organisation as it really works — multi-pool, multi-lane, multi-sub-lane.', "publishedDetails"='- Drag-drop pools onto the canvas; lanes auto-fit
- Sub-lanes (lanes within lanes) for matrix orgs
- Lane-and-pool grow-only on content add (no surprise shrinking)
- Independent lane font sizes, header widths, and label rotation',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Cross-Functional Flowcharts (Pools / Lanes / Sub-Lanes)';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Cross-Functional Flowcharts (Pools / Lanes / Sub-Lanes)', 'Model your organisation as it really works — multi-pool, multi-lane, multi-sub-lane.', '- Drag-drop pools onto the canvas; lanes auto-fit
- Sub-lanes (lanes within lanes) for matrix orgs
- Lane-and-pool grow-only on content add (no surprise shrinking)
- Independent lane font sizes, header widths, and label rotation', false, 70, 'Cross-Functional Flowcharts (Pools / Lanes / Sub-Lanes)', 'Model your organisation as it really works — multi-pool, multi-lane, multi-sub-lane.', '- Drag-drop pools onto the canvas; lanes auto-fit
- Sub-lanes (lanes within lanes) for matrix orgs
- Lane-and-pool grow-only on content add (no surprise shrinking)
- Independent lane font sizes, header widths, and label rotation', false, 70, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Cross-Functional Flowcharts (Pools / Lanes / Sub-Lanes)');

-- Drag-Drop Palette + Smart Editing UX
UPDATE "Feature" SET "summary"='Built for fast iteration — drag, drop, type, done.', "details"='- Per-diagram-type palette (only relevant symbols)
- Snap-to-element alignment guides while dragging
- Insert Space — push everything to the right (or down) to make room
- Focus-edit zoom — double-click any label and the canvas snaps to centre it for easy typing
- Drop on a connector to insert an element mid-flow
- Quick-add menu for one-click element creation at cursor',
  "publishedName"="name", "publishedSummary"='Built for fast iteration — drag, drop, type, done.', "publishedDetails"='- Per-diagram-type palette (only relevant symbols)
- Snap-to-element alignment guides while dragging
- Insert Space — push everything to the right (or down) to make room
- Focus-edit zoom — double-click any label and the canvas snaps to centre it for easy typing
- Drop on a connector to insert an element mid-flow
- Quick-add menu for one-click element creation at cursor',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Drag-Drop Palette + Smart Editing UX';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Drag-Drop Palette + Smart Editing UX', 'Built for fast iteration — drag, drop, type, done.', '- Per-diagram-type palette (only relevant symbols)
- Snap-to-element alignment guides while dragging
- Insert Space — push everything to the right (or down) to make room
- Focus-edit zoom — double-click any label and the canvas snaps to centre it for easy typing
- Drop on a connector to insert an element mid-flow
- Quick-add menu for one-click element creation at cursor', false, 80, 'Drag-Drop Palette + Smart Editing UX', 'Built for fast iteration — drag, drop, type, done.', '- Per-diagram-type palette (only relevant symbols)
- Snap-to-element alignment guides while dragging
- Insert Space — push everything to the right (or down) to make room
- Focus-edit zoom — double-click any label and the canvas snaps to centre it for easy typing
- Drop on a connector to insert an element mid-flow
- Quick-add menu for one-click element creation at cursor', false, 80, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Drag-Drop Palette + Smart Editing UX');

-- Reusable Templates with Groups
UPDATE "Feature" SET "summary"='Save your common patterns once; reuse them across every project.', "details"='- User-defined templates per diagram type
- Group templates under named, collapsible headers
- Built-in template library shipped with Diagramatix
- Per-user collapse state remembered between sessions',
  "publishedName"="name", "publishedSummary"='Save your common patterns once; reuse them across every project.', "publishedDetails"='- User-defined templates per diagram type
- Group templates under named, collapsible headers
- Built-in template library shipped with Diagramatix
- Per-user collapse state remembered between sessions',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Reusable Templates with Groups';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Reusable Templates with Groups', 'Save your common patterns once; reuse them across every project.', '- User-defined templates per diagram type
- Group templates under named, collapsible headers
- Built-in template library shipped with Diagramatix
- Per-user collapse state remembered between sessions', false, 90, 'Reusable Templates with Groups', 'Save your common patterns once; reuse them across every project.', '- User-defined templates per diagram type
- Group templates under named, collapsible headers
- Built-in template library shipped with Diagramatix
- Per-user collapse state remembered between sessions', false, 90, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Reusable Templates with Groups');

-- Drill-Down Navigation
UPDATE "Feature" SET "summary"='Link diagrams together for true hierarchical process documentation.', "details"='- Sub-processes link to nested BPMN diagrams
- Chevron-collapsed symbols link to any diagram type
- One-click drill-back arrow returns to the parent diagram
- "Linked from" list on every diagram shows its parents (auto-scanned)',
  "publishedName"="name", "publishedSummary"='Link diagrams together for true hierarchical process documentation.', "publishedDetails"='- Sub-processes link to nested BPMN diagrams
- Chevron-collapsed symbols link to any diagram type
- One-click drill-back arrow returns to the parent diagram
- "Linked from" list on every diagram shows its parents (auto-scanned)',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Drill-Down Navigation';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Drill-Down Navigation', 'Link diagrams together for true hierarchical process documentation.', '- Sub-processes link to nested BPMN diagrams
- Chevron-collapsed symbols link to any diagram type
- One-click drill-back arrow returns to the parent diagram
- "Linked from" list on every diagram shows its parents (auto-scanned)', false, 100, 'Drill-Down Navigation', 'Link diagrams together for true hierarchical process documentation.', '- Sub-processes link to nested BPMN diagrams
- Chevron-collapsed symbols link to any diagram type
- One-click drill-back arrow returns to the parent diagram
- "Linked from" list on every diagram shows its parents (auto-scanned)', false, 100, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Drill-Down Navigation');

-- Project & Folder Organisation
UPDATE "Feature" SET "summary"='Group diagrams by project, organise within folders, sort however you like.', "details"='- Multiple projects per user
- Nested folder hierarchy within each project
- Drag-and-drop reordering, or sort by name / modified date
- Per-project sort preference remembered',
  "publishedName"="name", "publishedSummary"='Group diagrams by project, organise within folders, sort however you like.', "publishedDetails"='- Multiple projects per user
- Nested folder hierarchy within each project
- Drag-and-drop reordering, or sort by name / modified date
- Per-project sort preference remembered',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Project & Folder Organisation';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Project & Folder Organisation', 'Group diagrams by project, organise within folders, sort however you like.', '- Multiple projects per user
- Nested folder hierarchy within each project
- Drag-and-drop reordering, or sort by name / modified date
- Per-project sort preference remembered', false, 110, 'Project & Folder Organisation', 'Group diagrams by project, organise within folders, sort however you like.', '- Multiple projects per user
- Nested folder hierarchy within each project
- Drag-and-drop reordering, or sort by name / modified date
- Per-project sort preference remembered', false, 110, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Project & Folder Organisation');

-- Properties Panel with Per-Element Configuration
UPDATE "Feature" SET "summary"='Click any element and edit every property without leaving the canvas.', "details"='- Name, type, dimensions, colour
- Type-specific properties: BPMN task type, gateway role, event trigger
- UML attribute / operation editor for class diagrams
- Connector waypoint, label offset, and arrow direction editing',
  "publishedName"="name", "publishedSummary"='Click any element and edit every property without leaving the canvas.', "publishedDetails"='- Name, type, dimensions, colour
- Type-specific properties: BPMN task type, gateway role, event trigger
- UML attribute / operation editor for class diagrams
- Connector waypoint, label offset, and arrow direction editing',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Properties Panel with Per-Element Configuration';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Properties Panel with Per-Element Configuration', 'Click any element and edit every property without leaving the canvas.', '- Name, type, dimensions, colour
- Type-specific properties: BPMN task type, gateway role, event trigger
- UML attribute / operation editor for class diagrams
- Connector waypoint, label offset, and arrow direction editing', false, 120, 'Properties Panel with Per-Element Configuration', 'Click any element and edit every property without leaving the canvas.', '- Name, type, dimensions, colour
- Type-specific properties: BPMN task type, gateway role, event trigger
- UML attribute / operation editor for class diagrams
- Connector waypoint, label offset, and arrow direction editing', false, 120, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Properties Panel with Per-Element Configuration');

-- Custom Display Modes (Normal + Hand-Drawn)
UPDATE "Feature" SET "summary"='Switch any diagram between polished and sketchy with one click.', "details"='- Normal mode: clean, presentation-ready output
- Hand-drawn mode: sketch-style strokes, monochrome
- Per-diagram setting (some can be polished, others draft)
- Export reflects the display mode',
  "publishedName"="name", "publishedSummary"='Switch any diagram between polished and sketchy with one click.', "publishedDetails"='- Normal mode: clean, presentation-ready output
- Hand-drawn mode: sketch-style strokes, monochrome
- Per-diagram setting (some can be polished, others draft)
- Export reflects the display mode',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Custom Display Modes (Normal + Hand-Drawn)';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Custom Display Modes (Normal + Hand-Drawn)', 'Switch any diagram between polished and sketchy with one click.', '- Normal mode: clean, presentation-ready output
- Hand-drawn mode: sketch-style strokes, monochrome
- Per-diagram setting (some can be polished, others draft)
- Export reflects the display mode', false, 130, 'Custom Display Modes (Normal + Hand-Drawn)', 'Switch any diagram between polished and sketchy with one click.', '- Normal mode: clean, presentation-ready output
- Hand-drawn mode: sketch-style strokes, monochrome
- Per-diagram setting (some can be polished, others draft)
- Export reflects the display mode', false, 130, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Custom Display Modes (Normal + Hand-Drawn)');

-- Configurable Colour Themes per Project & per Diagram
UPDATE "Feature" SET "summary"='Match your brand or process taxonomy with custom colours.', "details"='- Per-symbol-type colour overrides
- Project-wide theme that all diagrams inherit by default
- Per-diagram override when a specific diagram needs different colours
- Black & white "hand-drawn" override',
  "publishedName"="name", "publishedSummary"='Match your brand or process taxonomy with custom colours.', "publishedDetails"='- Per-symbol-type colour overrides
- Project-wide theme that all diagrams inherit by default
- Per-diagram override when a specific diagram needs different colours
- Black & white "hand-drawn" override',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Configurable Colour Themes per Project & per Diagram';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Configurable Colour Themes per Project & per Diagram', 'Match your brand or process taxonomy with custom colours.', '- Per-symbol-type colour overrides
- Project-wide theme that all diagrams inherit by default
- Per-diagram override when a specific diagram needs different colours
- Black & white "hand-drawn" override', false, 140, 'Configurable Colour Themes per Project & per Diagram', 'Match your brand or process taxonomy with custom colours.', '- Per-symbol-type colour overrides
- Project-wide theme that all diagrams inherit by default
- Per-diagram override when a specific diagram needs different colours
- Black & white "hand-drawn" override', false, 140, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Configurable Colour Themes per Project & per Diagram');

-- Bulk Visio Export
UPDATE "Feature" SET "summary"='Export every BPMN diagram in a project as one multi-page `.vsdx` file.', "details"='- One Visio page per diagram, ordered alphabetically
- Single download for an entire project''s worth of process documentation
- Non-BPMN diagrams skipped silently
- Round-trips on bulk import too',
  "publishedName"="name", "publishedSummary"='Export every BPMN diagram in a project as one multi-page `.vsdx` file.', "publishedDetails"='- One Visio page per diagram, ordered alphabetically
- Single download for an entire project''s worth of process documentation
- Non-BPMN diagrams skipped silently
- Round-trips on bulk import too',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Bulk Visio Export';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Bulk Visio Export', 'Export every BPMN diagram in a project as one multi-page `.vsdx` file.', '- One Visio page per diagram, ordered alphabetically
- Single download for an entire project''s worth of process documentation
- Non-BPMN diagrams skipped silently
- Round-trips on bulk import too', false, 150, 'Bulk Visio Export', 'Export every BPMN diagram in a project as one multi-page `.vsdx` file.', '- One Visio page per diagram, ordered alphabetically
- Single download for an entire project''s worth of process documentation
- Non-BPMN diagrams skipped silently
- Round-trips on bulk import too', false, 150, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Bulk Visio Export');

-- Backup & Restore
UPDATE "Feature" SET "summary"='One-click full-account snapshot to a portable `.diag` file.', "details"='- Every project, diagram, template, user preference in one file
- Restore brings everything back as it was
- Use for moving between accounts, archival, or "try this on a copy"',
  "publishedName"="name", "publishedSummary"='One-click full-account snapshot to a portable `.diag` file.', "publishedDetails"='- Every project, diagram, template, user preference in one file
- Restore brings everything back as it was
- Use for moving between accounts, archival, or "try this on a copy"',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Backup & Restore';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Backup & Restore', 'One-click full-account snapshot to a portable `.diag` file.', '- Every project, diagram, template, user preference in one file
- Restore brings everything back as it was
- Use for moving between accounts, archival, or "try this on a copy"', false, 160, 'Backup & Restore', 'One-click full-account snapshot to a portable `.diag` file.', '- Every project, diagram, template, user preference in one file
- Restore brings everything back as it was
- Use for moving between accounts, archival, or "try this on a copy"', false, 160, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Backup & Restore');

-- Diagram Title Block with Version / Authors / Status
UPDATE "Feature" SET "summary"='Professional title block stamp for every diagram.', "details"='- Free-text version string + authors list
- Status: Draft / Final / Production with visual badge
- Per-diagram toggle to show or hide
- Renders in export files too',
  "publishedName"="name", "publishedSummary"='Professional title block stamp for every diagram.', "publishedDetails"='- Free-text version string + authors list
- Status: Draft / Final / Production with visual badge
- Per-diagram toggle to show or hide
- Renders in export files too',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Diagram Title Block with Version / Authors / Status';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Diagram Title Block with Version / Authors / Status', 'Professional title block stamp for every diagram.', '- Free-text version string + authors list
- Status: Draft / Final / Production with visual badge
- Per-diagram toggle to show or hide
- Renders in export files too', false, 170, 'Diagram Title Block with Version / Authors / Status', 'Professional title block stamp for every diagram.', '- Free-text version string + authors list
- Status: Draft / Final / Production with visual badge
- Per-diagram toggle to show or hide
- Renders in export files too', false, 170, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Diagram Title Block with Version / Authors / Status');

-- Tiered Subscriptions with Self-Serve Upgrade
UPDATE "Feature" SET "summary"='Start free, upgrade when you need more — at any time.', "details"='- 30-day free trial covers every feature
- Three paid tiers (Introductory / Professional / Expert) with progressively higher limits
- Self-serve checkout (Stripe), self-serve cancellation, no support call required
- AUD billing; international cards accepted',
  "publishedName"="name", "publishedSummary"='Start free, upgrade when you need more — at any time.', "publishedDetails"='- 30-day free trial covers every feature
- Three paid tiers (Introductory / Professional / Expert) with progressively higher limits
- Self-serve checkout (Stripe), self-serve cancellation, no support call required
- AUD billing; international cards accepted',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Tiered Subscriptions with Self-Serve Upgrade';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Tiered Subscriptions with Self-Serve Upgrade', 'Start free, upgrade when you need more — at any time.', '- 30-day free trial covers every feature
- Three paid tiers (Introductory / Professional / Expert) with progressively higher limits
- Self-serve checkout (Stripe), self-serve cancellation, no support call required
- AUD billing; international cards accepted', false, 180, 'Tiered Subscriptions with Self-Serve Upgrade', 'Start free, upgrade when you need more — at any time.', '- 30-day free trial covers every feature
- Three paid tiers (Introductory / Professional / Expert) with progressively higher limits
- Self-serve checkout (Stripe), self-serve cancellation, no support call required
- AUD billing; international cards accepted', false, 180, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Tiered Subscriptions with Self-Serve Upgrade');

-- Collaboration & Diagram Review
UPDATE "Feature" SET "summary"='Circulate a diagram to colleagues, gather comments, and track sign-off — all inside Diagramatix.', "details"='- Collaboration Groups: invite teammates by name or email, with in-app notifications, accept/decline, leave, remove, and ownership transfer
- Send any diagram to one or more groups with an objective and a due date
- Reviewers comment directly on the diagram — drag a pink Review Comment onto any element; it auto-links and is tagged with the reviewer
- Dashboard collections for diagrams Received and Sent for review, colour-coded by due date
- Live reviewer statuses (pending / in-progress / submitted / approved / declined) with Approve, Submit, and Decline actions
- Owner controls: filter comments by reviewer, re-submit for a fresh approval round, and finish the review when done',
  "publishedName"="name", "publishedSummary"='Circulate a diagram to colleagues, gather comments, and track sign-off — all inside Diagramatix.', "publishedDetails"='- Collaboration Groups: invite teammates by name or email, with in-app notifications, accept/decline, leave, remove, and ownership transfer
- Send any diagram to one or more groups with an objective and a due date
- Reviewers comment directly on the diagram — drag a pink Review Comment onto any element; it auto-links and is tagged with the reviewer
- Dashboard collections for diagrams Received and Sent for review, colour-coded by due date
- Live reviewer statuses (pending / in-progress / submitted / approved / declined) with Approve, Submit, and Decline actions
- Owner controls: filter comments by reviewer, re-submit for a fresh approval round, and finish the review when done',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Collaboration & Diagram Review';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Collaboration & Diagram Review', 'Circulate a diagram to colleagues, gather comments, and track sign-off — all inside Diagramatix.', '- Collaboration Groups: invite teammates by name or email, with in-app notifications, accept/decline, leave, remove, and ownership transfer
- Send any diagram to one or more groups with an objective and a due date
- Reviewers comment directly on the diagram — drag a pink Review Comment onto any element; it auto-links and is tagged with the reviewer
- Dashboard collections for diagrams Received and Sent for review, colour-coded by due date
- Live reviewer statuses (pending / in-progress / submitted / approved / declined) with Approve, Submit, and Decline actions
- Owner controls: filter comments by reviewer, re-submit for a fresh approval round, and finish the review when done', false, 190, 'Collaboration & Diagram Review', 'Circulate a diagram to colleagues, gather comments, and track sign-off — all inside Diagramatix.', '- Collaboration Groups: invite teammates by name or email, with in-app notifications, accept/decline, leave, remove, and ownership transfer
- Send any diagram to one or more groups with an objective and a due date
- Reviewers comment directly on the diagram — drag a pink Review Comment onto any element; it auto-links and is tagged with the reviewer
- Dashboard collections for diagrams Received and Sent for review, colour-coded by due date
- Live reviewer statuses (pending / in-progress / submitted / approved / declined) with Approve, Submit, and Decline actions
- Owner controls: filter comments by reviewer, re-submit for a fresh approval round, and finish the review when done', false, 190, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Collaboration & Diagram Review');

-- Publishing & Review Lifecycle
UPDATE "Feature" SET "summary"='Publish a versioned diagram — or a whole bundle of related diagrams — to a business-user audience, with scheduled re-review reminders so process maps never silently go stale.', "details"='- Draft → Published lifecycle: publishing snapshots an immutable Published Version; readers always see the latest non-superseded version, and the history is kept
- Publication Bundles: publish a set of related diagrams together (root diagrams plus the sub-processes they link to) as one release, with release notes
- Business-user audiences: share a bundle with named colleagues, or invite by email — an invitee is promoted into the audience automatically when they sign up
- Read-only viewer: audience members open a clean, navigable view and drill across linked diagrams, with no edit access
- Scheduled re-review: set a next-review date or a review cadence; Diagramatix fires an automatic ''review due'' reminder when it''s time
- Supersede & revoke: a new version supersedes the previous one; archiving a bundle revokes its audience grants',
  "publishedName"="name", "publishedSummary"='Publish a versioned diagram — or a whole bundle of related diagrams — to a business-user audience, with scheduled re-review reminders so process maps never silently go stale.', "publishedDetails"='- Draft → Published lifecycle: publishing snapshots an immutable Published Version; readers always see the latest non-superseded version, and the history is kept
- Publication Bundles: publish a set of related diagrams together (root diagrams plus the sub-processes they link to) as one release, with release notes
- Business-user audiences: share a bundle with named colleagues, or invite by email — an invitee is promoted into the audience automatically when they sign up
- Read-only viewer: audience members open a clean, navigable view and drill across linked diagrams, with no edit access
- Scheduled re-review: set a next-review date or a review cadence; Diagramatix fires an automatic ''review due'' reminder when it''s time
- Supersede & revoke: a new version supersedes the previous one; archiving a bundle revokes its audience grants',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Publishing & Review Lifecycle';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Publishing & Review Lifecycle', 'Publish a versioned diagram — or a whole bundle of related diagrams — to a business-user audience, with scheduled re-review reminders so process maps never silently go stale.', '- Draft → Published lifecycle: publishing snapshots an immutable Published Version; readers always see the latest non-superseded version, and the history is kept
- Publication Bundles: publish a set of related diagrams together (root diagrams plus the sub-processes they link to) as one release, with release notes
- Business-user audiences: share a bundle with named colleagues, or invite by email — an invitee is promoted into the audience automatically when they sign up
- Read-only viewer: audience members open a clean, navigable view and drill across linked diagrams, with no edit access
- Scheduled re-review: set a next-review date or a review cadence; Diagramatix fires an automatic ''review due'' reminder when it''s time
- Supersede & revoke: a new version supersedes the previous one; archiving a bundle revokes its audience grants', false, 200, 'Publishing & Review Lifecycle', 'Publish a versioned diagram — or a whole bundle of related diagrams — to a business-user audience, with scheduled re-review reminders so process maps never silently go stale.', '- Draft → Published lifecycle: publishing snapshots an immutable Published Version; readers always see the latest non-superseded version, and the history is kept
- Publication Bundles: publish a set of related diagrams together (root diagrams plus the sub-processes they link to) as one release, with release notes
- Business-user audiences: share a bundle with named colleagues, or invite by email — an invitee is promoted into the audience automatically when they sign up
- Read-only viewer: audience members open a clean, navigable view and drill across linked diagrams, with no edit access
- Scheduled re-review: set a next-review date or a review cadence; Diagramatix fires an automatic ''review due'' reminder when it''s time
- Supersede & revoke: a new version supersedes the previous one; archiving a bundle revokes its audience grants', false, 200, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Publishing & Review Lifecycle');

-- Diagram-Type Colour Identity
UPDATE "Feature" SET "summary"='Every diagram type gets a 2-character code and a distinct pastel colour, so you can tell process types apart at a glance.', "details"='- 2-character badges (BP, CO, PC, SM, DM, VC, AM) in the project navigation tree
- Colour-coded diagram tiles on the dashboard and project screens — for every user, including business viewers
- The editor''s top bar is tinted to the diagram type, with the type name highlighted in its colour
- Consistent type chips everywhere a diagram type is shown
- SuperAdmin-editable: change any code or colour and it flows across the whole app',
  "publishedName"="name", "publishedSummary"='Every diagram type gets a 2-character code and a distinct pastel colour, so you can tell process types apart at a glance.', "publishedDetails"='- 2-character badges (BP, CO, PC, SM, DM, VC, AM) in the project navigation tree
- Colour-coded diagram tiles on the dashboard and project screens — for every user, including business viewers
- The editor''s top bar is tinted to the diagram type, with the type name highlighted in its colour
- Consistent type chips everywhere a diagram type is shown
- SuperAdmin-editable: change any code or colour and it flows across the whole app',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Diagram-Type Colour Identity';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Diagram-Type Colour Identity', 'Every diagram type gets a 2-character code and a distinct pastel colour, so you can tell process types apart at a glance.', '- 2-character badges (BP, CO, PC, SM, DM, VC, AM) in the project navigation tree
- Colour-coded diagram tiles on the dashboard and project screens — for every user, including business viewers
- The editor''s top bar is tinted to the diagram type, with the type name highlighted in its colour
- Consistent type chips everywhere a diagram type is shown
- SuperAdmin-editable: change any code or colour and it flows across the whole app', false, 210, 'Diagram-Type Colour Identity', 'Every diagram type gets a 2-character code and a distinct pastel colour, so you can tell process types apart at a glance.', '- 2-character badges (BP, CO, PC, SM, DM, VC, AM) in the project navigation tree
- Colour-coded diagram tiles on the dashboard and project screens — for every user, including business viewers
- The editor''s top bar is tinted to the diagram type, with the type name highlighted in its colour
- Consistent type chips everywhere a diagram type is shown
- SuperAdmin-editable: change any code or colour and it flows across the whole app', false, 210, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Diagram-Type Colour Identity');

-- Guided Backups with Live Progress
UPDATE "Feature" SET "summary"='See exactly what will be backed up, choose who to include, and watch it happen — with a report at the end.', "details"='- Pre-flight preview: a stats table of everything that will be captured before you commit
- OrgAdmins pick which members to back up; SuperAdmins scope to All Orgs or a single Org''s selected users
- Live per-section progress streamed as the backup is built, then a statistical report (rows per section, total, file size)
- The same guided experience across user, Org, full-system, AI Rules & Prompts, and built-in template exports
- Restores are additive and fully transactional — all-or-nothing, never a half-restored set',
  "publishedName"="name", "publishedSummary"='See exactly what will be backed up, choose who to include, and watch it happen — with a report at the end.', "publishedDetails"='- Pre-flight preview: a stats table of everything that will be captured before you commit
- OrgAdmins pick which members to back up; SuperAdmins scope to All Orgs or a single Org''s selected users
- Live per-section progress streamed as the backup is built, then a statistical report (rows per section, total, file size)
- The same guided experience across user, Org, full-system, AI Rules & Prompts, and built-in template exports
- Restores are additive and fully transactional — all-or-nothing, never a half-restored set',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Guided Backups with Live Progress';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Guided Backups with Live Progress', 'See exactly what will be backed up, choose who to include, and watch it happen — with a report at the end.', '- Pre-flight preview: a stats table of everything that will be captured before you commit
- OrgAdmins pick which members to back up; SuperAdmins scope to All Orgs or a single Org''s selected users
- Live per-section progress streamed as the backup is built, then a statistical report (rows per section, total, file size)
- The same guided experience across user, Org, full-system, AI Rules & Prompts, and built-in template exports
- Restores are additive and fully transactional — all-or-nothing, never a half-restored set', false, 220, 'Guided Backups with Live Progress', 'See exactly what will be backed up, choose who to include, and watch it happen — with a report at the end.', '- Pre-flight preview: a stats table of everything that will be captured before you commit
- OrgAdmins pick which members to back up; SuperAdmins scope to All Orgs or a single Org''s selected users
- Live per-section progress streamed as the backup is built, then a statistical report (rows per section, total, file size)
- The same guided experience across user, Org, full-system, AI Rules & Prompts, and built-in template exports
- Restores are additive and fully transactional — all-or-nothing, never a half-restored set', false, 220, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Guided Backups with Live Progress');

-- SharePoint & OneDrive Integration
UPDATE "Feature" SET "summary"='Sign in with Microsoft, save and open diagrams in SharePoint or OneDrive, and link Data Objects to live documents.', "details"='- Sign in with your Microsoft (Entra) account alongside email / password
- Save a diagram''s data files — XML + matching XSD + JSON (and Visio .vsdx for BPMN) — straight into a SharePoint or OneDrive folder
- Open those files back from SharePoint / OneDrive into Diagramatix
- Browse your SharePoint sites, document libraries and OneDrive with a built-in file picker
- Link a Data Object or Data Store to a SharePoint / OneDrive file
- Preview the linked file embedded in the editor, with a link badge on the shape',
  "publishedName"="name", "publishedSummary"='Sign in with Microsoft, save and open diagrams in SharePoint or OneDrive, and link Data Objects to live documents.', "publishedDetails"='- Sign in with your Microsoft (Entra) account alongside email / password
- Save a diagram''s data files — XML + matching XSD + JSON (and Visio .vsdx for BPMN) — straight into a SharePoint or OneDrive folder
- Open those files back from SharePoint / OneDrive into Diagramatix
- Browse your SharePoint sites, document libraries and OneDrive with a built-in file picker
- Link a Data Object or Data Store to a SharePoint / OneDrive file
- Preview the linked file embedded in the editor, with a link badge on the shape',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='SharePoint & OneDrive Integration';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'SharePoint & OneDrive Integration', 'Sign in with Microsoft, save and open diagrams in SharePoint or OneDrive, and link Data Objects to live documents.', '- Sign in with your Microsoft (Entra) account alongside email / password
- Save a diagram''s data files — XML + matching XSD + JSON (and Visio .vsdx for BPMN) — straight into a SharePoint or OneDrive folder
- Open those files back from SharePoint / OneDrive into Diagramatix
- Browse your SharePoint sites, document libraries and OneDrive with a built-in file picker
- Link a Data Object or Data Store to a SharePoint / OneDrive file
- Preview the linked file embedded in the editor, with a link badge on the shape', false, 230, 'SharePoint & OneDrive Integration', 'Sign in with Microsoft, save and open diagrams in SharePoint or OneDrive, and link Data Objects to live documents.', '- Sign in with your Microsoft (Entra) account alongside email / password
- Save a diagram''s data files — XML + matching XSD + JSON (and Visio .vsdx for BPMN) — straight into a SharePoint or OneDrive folder
- Open those files back from SharePoint / OneDrive into Diagramatix
- Browse your SharePoint sites, document libraries and OneDrive with a built-in file picker
- Link a Data Object or Data Store to a SharePoint / OneDrive file
- Preview the linked file embedded in the editor, with a link badge on the shape', false, 230, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='SharePoint & OneDrive Integration');

-- Project Sharing with Roles
UPDATE "Feature" SET "summary"='Share a project with the people who need it — View or Edit, per project, anytime.', "details"='- Owner picks any registered user by name or email and grants View or Edit access
- View users see the project read-only; Edit users mutate diagrams but cannot delete the project or any of its diagrams
- Shared projects show up on the recipient''s dashboard with an amber tile and the owner''s name + email
- New per-diagram "Diagram Owner" field assigns accountability to a specific person without changing access
- Recipients see who else is in the share — transparency about who''s in the room
- Cross-organisation sharing is allowed or blocked per-organisation by the Org admin',
  "publishedName"="name", "publishedSummary"='Share a project with the people who need it — View or Edit, per project, anytime.', "publishedDetails"='- Owner picks any registered user by name or email and grants View or Edit access
- View users see the project read-only; Edit users mutate diagrams but cannot delete the project or any of its diagrams
- Shared projects show up on the recipient''s dashboard with an amber tile and the owner''s name + email
- New per-diagram "Diagram Owner" field assigns accountability to a specific person without changing access
- Recipients see who else is in the share — transparency about who''s in the room
- Cross-organisation sharing is allowed or blocked per-organisation by the Org admin',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Project Sharing with Roles';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Project Sharing with Roles', 'Share a project with the people who need it — View or Edit, per project, anytime.', '- Owner picks any registered user by name or email and grants View or Edit access
- View users see the project read-only; Edit users mutate diagrams but cannot delete the project or any of its diagrams
- Shared projects show up on the recipient''s dashboard with an amber tile and the owner''s name + email
- New per-diagram "Diagram Owner" field assigns accountability to a specific person without changing access
- Recipients see who else is in the share — transparency about who''s in the room
- Cross-organisation sharing is allowed or blocked per-organisation by the Org admin', false, 240, 'Project Sharing with Roles', 'Share a project with the people who need it — View or Edit, per project, anytime.', '- Owner picks any registered user by name or email and grants View or Edit access
- View users see the project read-only; Edit users mutate diagrams but cannot delete the project or any of its diagrams
- Shared projects show up on the recipient''s dashboard with an amber tile and the owner''s name + email
- New per-diagram "Diagram Owner" field assigns accountability to a specific person without changing access
- Recipients see who else is in the share — transparency about who''s in the room
- Cross-organisation sharing is allowed or blocked per-organisation by the Org admin', false, 240, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Project Sharing with Roles');

-- Organisation Admin & Settings
UPDATE "Feature" SET "summary"='Designate organisation administrators with project-share oversight, configurable per-organisation sharing policies, and silent admin membership.', "details"='- New OrgAdmin role for designated organisation administrators
- Project Sharing oversight page lists every shared project in the organisation with owner, recipients, and inline share-list editing
- Silent membership: OrgAdmins (and platform SuperAdmins) act as project owners for share management without ever appearing in any share list
- Open any shared project as a full silent editor — full access without an audit footprint in the share UI
- Org Settings page toggles whether cross-organisation sharing is allowed
- SuperAdmin can assign or revoke the OrgAdmin role per user',
  "publishedName"="name", "publishedSummary"='Designate organisation administrators with project-share oversight, configurable per-organisation sharing policies, and silent admin membership.', "publishedDetails"='- New OrgAdmin role for designated organisation administrators
- Project Sharing oversight page lists every shared project in the organisation with owner, recipients, and inline share-list editing
- Silent membership: OrgAdmins (and platform SuperAdmins) act as project owners for share management without ever appearing in any share list
- Open any shared project as a full silent editor — full access without an audit footprint in the share UI
- Org Settings page toggles whether cross-organisation sharing is allowed
- SuperAdmin can assign or revoke the OrgAdmin role per user',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Organisation Admin & Settings';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Organisation Admin & Settings', 'Designate organisation administrators with project-share oversight, configurable per-organisation sharing policies, and silent admin membership.', '- New OrgAdmin role for designated organisation administrators
- Project Sharing oversight page lists every shared project in the organisation with owner, recipients, and inline share-list editing
- Silent membership: OrgAdmins (and platform SuperAdmins) act as project owners for share management without ever appearing in any share list
- Open any shared project as a full silent editor — full access without an audit footprint in the share UI
- Org Settings page toggles whether cross-organisation sharing is allowed
- SuperAdmin can assign or revoke the OrgAdmin role per user', false, 250, 'Organisation Admin & Settings', 'Designate organisation administrators with project-share oversight, configurable per-organisation sharing policies, and silent admin membership.', '- New OrgAdmin role for designated organisation administrators
- Project Sharing oversight page lists every shared project in the organisation with owner, recipients, and inline share-list editing
- Silent membership: OrgAdmins (and platform SuperAdmins) act as project owners for share management without ever appearing in any share list
- Open any shared project as a full silent editor — full access without an audit footprint in the share UI
- Org Settings page toggles whether cross-organisation sharing is allowed
- SuperAdmin can assign or revoke the OrgAdmin role per user', false, 250, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Organisation Admin & Settings');

-- Entity Lists — Governed Pool & Lane Naming
UPDATE "Feature" SET "summary"='Name BPMN pools and lanes from a maintained Organisation hierarchy, external-participant list and IT-systems list — consistent across every diagram.', "details"='- Maintain three reusable lists per Organisation: External Participants, IT Systems, and an Organisation → Org Unit → Team → Role hierarchy
- Each Project adopts an org structure as its own editable copy, so projects tailor names without touching the master
- Renaming a white-box Pool pre-fills the default Organisation name and shows the whole indented structure; type to filter, press Enter to accept, or pick any level
- Lanes draw from the same hierarchy; black-box pools draw from the External Participants or IT Systems list
- A brand-new name prompts where it belongs in the hierarchy and is saved to the project structure on the spot
- Maintained by Project Owners, OrgAdmins and SuperAdmins, with role-appropriate options',
  "publishedName"="name", "publishedSummary"='Name BPMN pools and lanes from a maintained Organisation hierarchy, external-participant list and IT-systems list — consistent across every diagram.', "publishedDetails"='- Maintain three reusable lists per Organisation: External Participants, IT Systems, and an Organisation → Org Unit → Team → Role hierarchy
- Each Project adopts an org structure as its own editable copy, so projects tailor names without touching the master
- Renaming a white-box Pool pre-fills the default Organisation name and shows the whole indented structure; type to filter, press Enter to accept, or pick any level
- Lanes draw from the same hierarchy; black-box pools draw from the External Participants or IT Systems list
- A brand-new name prompts where it belongs in the hierarchy and is saved to the project structure on the spot
- Maintained by Project Owners, OrgAdmins and SuperAdmins, with role-appropriate options',
  "publishedHidden"="hidden", "publishedSortOrder"="sortOrder", "publishedAt"=now(), "updatedAt"=now()
WHERE "name"='Entity Lists — Governed Pool & Lane Naming';
INSERT INTO "Feature" ("id","name","summary","details","hidden","sortOrder","publishedName","publishedSummary","publishedDetails","publishedHidden","publishedSortOrder","publishedAt","createdAt","updatedAt")
  SELECT gen_random_uuid()::text, 'Entity Lists — Governed Pool & Lane Naming', 'Name BPMN pools and lanes from a maintained Organisation hierarchy, external-participant list and IT-systems list — consistent across every diagram.', '- Maintain three reusable lists per Organisation: External Participants, IT Systems, and an Organisation → Org Unit → Team → Role hierarchy
- Each Project adopts an org structure as its own editable copy, so projects tailor names without touching the master
- Renaming a white-box Pool pre-fills the default Organisation name and shows the whole indented structure; type to filter, press Enter to accept, or pick any level
- Lanes draw from the same hierarchy; black-box pools draw from the External Participants or IT Systems list
- A brand-new name prompts where it belongs in the hierarchy and is saved to the project structure on the spot
- Maintained by Project Owners, OrgAdmins and SuperAdmins, with role-appropriate options', false, 260, 'Entity Lists — Governed Pool & Lane Naming', 'Name BPMN pools and lanes from a maintained Organisation hierarchy, external-participant list and IT-systems list — consistent across every diagram.', '- Maintain three reusable lists per Organisation: External Participants, IT Systems, and an Organisation → Org Unit → Team → Role hierarchy
- Each Project adopts an org structure as its own editable copy, so projects tailor names without touching the master
- Renaming a white-box Pool pre-fills the default Organisation name and shows the whole indented structure; type to filter, press Enter to accept, or pick any level
- Lanes draw from the same hierarchy; black-box pools draw from the External Participants or IT Systems list
- A brand-new name prompts where it belongs in the hierarchy and is saved to the project structure on the spot
- Maintained by Project Owners, OrgAdmins and SuperAdmins, with role-appropriate options', false, 260, now(), now(), now()
  WHERE NOT EXISTS (SELECT 1 FROM "Feature" WHERE "name"='Entity Lists — Governed Pool & Lane Naming');

COMMIT;
