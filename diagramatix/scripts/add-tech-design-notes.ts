/**
 * Seed the SuperAdmin **Technical Design Notes** (the `tech-design` document
 * collection): a full low-level design reference in reading order — Platform &
 * Architecture, Diagram Model & Canvas, Layout Engines, AI Diagram Generation,
 * Identity/Multi-tenancy & Access, Collaboration/Review & Publishing,
 * Interoperability & Standards, the four analytical engines (Simulator, Miner,
 * RCM, Compliance Monitoring), Content/Catalogs & Examples, Billing &
 * Subscriptions, Data Protection & Operations, and Quality & Testing.
 *
 * Idempotent: chapters upserted by (collection, slug) with sortOrder re-applied
 * (so reordering the array reorders existing rows), sections upserted by heading.
 * Mirrors scripts/add-guide-*.ts.
 *
 * Run: DATABASE_URL="postgres://postgres:postgres@localhost:5432/diagramatix" npx tsx scripts/add-tech-design-notes.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const COLLECTION = "tech-design";

interface Section { heading: string; body: string }
interface Chapter { slug: string; title: string; sections: Section[] }

const CHAPTERS: Chapter[] = [
  {
    slug: "platform-architecture",
    title: "Platform & Architecture",
    sections: [
      { heading: "Stack overview", body: [
        "Diagramatix is a **Next.js 16 App Router** application (TypeScript, Tailwind CSS v4). There is no `src/` prefix — routes live under `app/` at the repo root. The diagram canvas is **hand-built SVG** (no `bpmn-js` or third-party diagramming library), which is what lets the app own connector routing, ellipse edge-connection and per-project typography.",
        "",
        "Server work happens in App-Router **route handlers** (`app/api/**/route.ts`) and **server components**; interactive surfaces are `\"use client\"` components. Editor diagram state is a `useReducer` store (`app/hooks/useDiagram.ts`).",
      ].join("\n") },
      { heading: "Data layer (Prisma 7)", body: [
        "Persistence is **PostgreSQL** via **Prisma 7** using the `@prisma/adapter-pg` adapter — the `datasource` block carries **no `url`**; the connection string is handed to `PrismaPg` in `app/lib/db.ts`. The generated client lives at `app/generated/prisma/client`.",
        "",
        "Prisma 7 omits JSON fields from model update inputs, so **JSON column writes use raw SQL** (`$executeRawUnsafe` / the exported `pgPool`) — e.g. `colorConfig`, `fontConfig`, `Diagram.data`. Schema changes are applied with **`prisma db push`** (the shadow DB `migrate dev` needs is not available). `SCHEMA_VERSION` is the human-facing version shown in the app header.",
      ].join("\n") },
      { heading: "Rendering model", body: [
        "The canvas is a single SVG surface (`app/components/canvas/Canvas.tsx`) handling pan/zoom/drop; elements are drawn by `SymbolRenderer` from per-type `symbols/definitions.ts`, and connectors by `ConnectorRenderer` from waypoints computed in `routing.ts`. A lightweight **window CustomEvent bus** (`dgx:fitToContent`, `dgx:centerElement`) lets non-canvas UI drive viewport actions without prop-drilling.",
      ].join("\n") },
      { heading: "Deployment & CI", body: [
        "The app is containerised (ACR) and runs on **Azure App Service (Linux)** against **Azure Database for PostgreSQL Flexible Server**. `azure-deploy.yml` builds the image, **runs `prisma db push` against prod** (so schema changes need no manual SQL), then runs the idempotent **content seeds** (guide chapters, examples, tech-design notes, backfills) before swapping the container image.",
        "",
        "`ci.yml` runs the full Vitest suite on every PR and push to `main`. Because deploy applies the schema and seeds automatically, the delivery model is simply *merge to `main` → GitHub Actions → Azure*.",
      ].join("\n") },
      { heading: "Auth runtime split", body: [
        "Next.js 16 renames `middleware.ts` to **`proxy.ts`** (exporting a `proxy` function). The proxy must run on the Edge runtime, which can't load Prisma — so route protection uses a **Prisma-free `auth.config.ts`**, while the full Auth.js setup with the database adapter lives in `auth.ts` for server components and route handlers.",
      ].join("\n") },
    ],
  },
  {
    slug: "diagram-canvas",
    title: "Diagram Model & Canvas",
    sections: [
      { heading: "Diagram data model", body: [
        "A diagram is `{ elements, connectors, title, ... }` persisted as JSON on `Diagram.data`. Every element carries geometry (`x/y/width/height`), a `type`, an optional `parentId` (pool/lane/subprocess containment) and a `properties` bag; subsystems annotate `properties` without schema changes — e.g. `properties.simulation` (Simulator) and `properties.risk` (RCM). All TypeScript shapes live in `app/lib/diagram/types.ts`.",
      ].join("\n") },
      { heading: "Canvas interaction", body: [
        "`Canvas.tsx` owns pan/zoom (with a stored initial-zoom preference), drag-drop from the palette, marquee and multi-select (`selectedElementIds`), and connection-mode gestures. Selection and viewport are editor-level state; the canvas exposes fit/centre via CustomEvents so the properties panel, Risk & Control screen deep-links, and AI-apply can recentre the view.",
      ].join("\n") },
      { heading: "Symbol & connector rendering", body: [
        "Each diagram type contributes symbol definitions (shape, ports, label placement) consumed by `SymbolRenderer`. Connectors are orthogonal by default: `routing.ts` computes waypoints, connects to the **true ellipse edge** for round nodes, and applies **bridges** where lines cross. Endpoints are movable and, for some types (ArchiMate), rendered on top with an offset model.",
      ].join("\n") },
      { heading: "Typography & colour config", body: [
        "Colour themes and fonts are **per-project** (`Project.colorConfig` / `fontConfig`, JSON) so a project renders with its own palette and independent typography — a deliberate differentiator. These JSON columns are written via raw SQL per the Prisma-7 rule.",
      ].join("\n") },
    ],
  },
  {
    slug: "layout-engines",
    title: "Layout Engines",
    sections: [
      { heading: "BPMN auto-layout", body: [
        "`layoutBpmnDiagram` places a BPMN model deterministically: a **column map** from the directed-follows structure (handling back-edges/loops), then **pool/lane placement**, then **subprocess + boundary-event** placement, container expansion, and finally connector waypoints. It is the single layout used by AI generation and by mining discovery.",
      ].join("\n") },
      { heading: "Geometry red-rules", body: [
        "Geometric constraints are **code-enforced in the layout function, not the prompt** (e.g. start-event clearance, pool/lane routing clearance, de-overlap passes). Each code-enforced rule is pinned by a **behavioural test** in a rule registry, and `findLayoutViolations` catches rules that conflict with each other.",
      ].join("\n") },
      { heading: "State-machine layout", body: [
        "Flat state machines use a dedicated `layoutStateMachine` with its own red rules (the S3.xx set): initial state top-left, finals bottom-right, left-to-right flow, fanned connection points, reciprocal transitions that don't cross, and label de-overlap.",
      ].join("\n") },
      { heading: "Violation detection", body: [
        "`findLayoutViolations` / `findRoutingViolations` are pure analyzers over a diagram: they surface overlaps, clearance breaches and connectors grazing obstacles. They back the issue scanner and are the regression net that lets the routing/layout code evolve safely.",
      ].join("\n") },
    ],
  },
  {
    slug: "ai-generation",
    title: "AI Diagram Generation",
    sections: [
      { heading: "Two-phase flow", body: [
        "AI BPMN generation is **two-phase**: first a structured **plan** (the process broken into an editable structure), then the diagram. The plan is user-editable before it becomes geometry, which keeps the model in control of the shape while Claude supplies the language.",
      ].join("\n") },
      { heading: "Hybrid pipeline", body: [
        "Generation is a **hybrid**: a deterministic extractor produces a structured skeleton, Claude rewrites/enriches it, and an **editable `DiagramRules` briefing** steers the result. Geometry is never left to the model — the deterministic `layoutBpmnDiagram` places everything.",
      ].join("\n") },
      { heading: "Rule enforcement (green-only)", body: [
        "Rules are split by enforcement: only **green (advisory-to-the-model)** rules reach the prompt via `splitRulesByEnforcement`; **red (geometric)** rules are enforced in code. This prevents the model from being asked to satisfy constraints the layout engine already guarantees.",
      ].join("\n") },
      { heading: "Prompt structure & model", body: [
        "Prompts follow a canonical **six-section order** (see the BPMN prompt-structure reference). The generation model is a **SuperAdmin setting** (default Haiku 4.5); the multi-model comparison fills its output from the best-scoring result.",
      ].join("\n") },
      { heading: "Conformance harness", body: [
        "`findConnectorConformance` + `npm run ai:report` run generated diagrams against the geometric expectations with a live model (not in CI — needs an API key), giving a measurable read on how well AI output conforms to the red rules.",
      ].join("\n") },
    ],
  },
  {
    slug: "identity-access",
    title: "Identity, Multi-tenancy & Access",
    sections: [
      { heading: "Authentication", body: [
        "Auth is **Auth.js v5** (email + password, JWT sessions). The Edge proxy authorises with a Prisma-free config; the full session (with DB) resolves in `auth.ts`. `AUTH_TRUST_HOST=true` is required.",
      ].join("\n") },
      { heading: "Org context & resolution", body: [
        "Every request resolves an **active org**. `app/lib/auth/orgContext.ts` centralises this: `getCurrentOrgId`, `requireRole([...])`, `requireOrgAdminFor(org)` and `requireProjectAccess(...)` throw a typed `OrgContextError` (with an HTTP status) that route handlers translate to a JSON response. This is the single choke-point for tenancy.",
      ].join("\n") },
      { heading: "Roles & elevation", body: [
        "Two elevated roles: **SuperAdmin** (system-wide, red UI accent) and **OrgAdmin** (Owner/Admin within an org, orange accent). SuperAdmins and OrgAdmins get **silent elevation** into projects they don't own (read/edit as appropriate) without a share row.",
      ].join("\n") },
      { heading: "Impersonation", body: [
        "A SuperAdmin can **view as** another user via a `dgx_view_as` cookie; the effective user id flows through `getEffectiveUserId`. Impersonation is guarded: a read-only view blocks mutations (`isReadOnlyImpersonation`) so support browsing can't accidentally change a user's data.",
      ].join("\n") },
      { heading: "Entity Lists", body: [
        "Org structures, external participants and IT systems are **Entity Lists**, kept as an org master that each project **adopts a copy** of and edits independently. They drive BPMN pool/lane naming from the project's own copy, not the org master.",
      ].join("\n") },
    ],
  },
  {
    slug: "collaboration-publishing",
    title: "Collaboration, Review & Publishing",
    sections: [
      { heading: "Project sharing", body: [
        "`ProjectShare` grants another user **VIEW** or **EDIT** on a project. Editor share gives write access to the *diagrams*, not the project's own properties (name/typography stay owner-level). The caller's share row is resolved server-side, so an empty row means \"owner\".",
      ].join("\n") },
      { heading: "Collaboration groups", body: [
        "Collaboration Groups bundle users so a diagram can be sent to a set of reviewers at once, rather than addressing individuals every time.",
      ].join("\n") },
      { heading: "Review workflow", body: [
        "A diagram can be **sent for review** to reviewers who open it in **Review Mode** (`?review=<id>`): a context banner, the review-comment symbol, and Submit / Decline. The owner tracks outstanding reviews from the dashboard and finishes the round. Backed by `DiagramReview` / `DiagramReviewer`.",
      ].join("\n") },
      { heading: "Publishing & bundles", body: [
        "The BPMN lifecycle publishes immutable **`PublishedVersion`s** and groups them into **`PublicationBundle`s** with **audiences**. The Diagram↔PublishedVersion relation is the one FK cycle the backup insert-order deliberately breaks.",
      ].join("\n") },
      { heading: "Notifications & feedback", body: [
        "System events (reviews, publishing, feedback) raise `Notification`s surfaced in a per-user feed; a SuperAdmin/OrgAdmin can inspect any user's feed filtered by org and user.",
      ].join("\n") },
    ],
  },
  {
    slug: "interoperability",
    title: "Interoperability & Standards",
    sections: [
      { heading: "Visio (VSDX)", body: [
        "Diagrams export to and import from **Visio VSDX**. Colour is applied by **pre-colouring masters** in the stencil/template rather than injecting at export, and Visio paints the first frame from a **cached `V=`** so geometry-row X/Y cells must be rescaled per instance. Pool/Lane is the most complete master; the CFF three-shape constellation is byte-sensitive.",
      ].join("\n") },
      { heading: "Document Editor & .docx", body: [
        "The SuperAdmin **Document Editor** (User Guide + Technical Design Notes) exports any document to **`.docx`**: a hand-built OOXML `word/document.xml` walked from the parsed Markdown (title, headings, tables, code fences, `:sym[…]:` shortcodes rendered to label text). Pandoc is available for other conversions.",
      ].join("\n") },
      { heading: "DDL import & generation", body: [
        "Database Domain diagrams **import DDL** and can **generate logical DDL** (PostgreSQL / MySQL / SQL Server) from the Diagramatix data model — the round-trip between a drawn domain model and executable schema.",
      ].join("\n") },
      { heading: "Mining & simulation interchange", body: [
        "DiagramatixMINER reads/writes **IEEE XES** and **OCEL** event logs; the Simulator exports **BPSim** and a full **`.dgxsim`** bundle (study + scenarios + calendars). These sit alongside the engine chapters, which document each format's mapping in detail.",
      ].join("\n") },
      { heading: "SharePoint & format governance", body: [
        "**SharePoint** integration imports/exports diagrams and links Data Objects to files. Any change to an export format is mirrored into the corresponding **XSD** and version numbers — export-format governance is a maintained discipline, not incidental.",
      ].join("\n") },
    ],
  },
  {
    slug: "simulator-design",
    title: "Simulator Design",
    sections: [
      {
        heading: "Overview & architecture",
        body: [
          "The Simulator is a **discrete-event digital twin** of a process. A study is a *portfolio* of root diagrams (`SimulationStudy`); at assembly time the engine takes each root and computes its **forward-link closure** — following process links (call activities / linked sub-processes) to pull in every reachable diagram — and stitches them into one process **network**.",
          "",
          "Assembly is **hierarchical**: an expanded sub-process becomes a nested network; **event sub-processes** are injected as interrupt/boundary handlers. Tokens flow through the assembled network under a discrete-event clock; the engine records per-activity timing, queueing and resource occupancy for the run report and the animation.",
        ].join("\n"),
      },
      {
        heading: "Arrival & routing",
        body: [
          "**Arrivals** enter at start events. The arrival process is either a fitted distribution (exponential inter-arrival, calibrated from mining) or a **demand preset** (a named arrival-rate profile).",
          "",
          "**Routing** at gateways is probabilistic: each outgoing flow carries a `branchProbability`; exclusive gateways pick one branch by weight, parallel gateways fan out. Branch probabilities are either author-set or **mined** from the discovered edge frequencies.",
        ].join("\n"),
      },
      {
        heading: "Cycle-time distributions",
        body: [
          "Each task carries a **service-time distribution**. Fitting picks the simplest shape that fits the data:",
          "",
          "- **Fixed** — when samples are constant or too few to fit.",
          "- **Triangular(min, mode, max)** — the default for real spread; robust with modest sample sizes.",
          "",
          "Durations are held in a **clock unit** (second / minute / hour / day) chosen so typical values stay human-scaled.",
        ].join("\n"),
      },
      {
        heading: "Resources, teams & calendars",
        body: [
          "Work is performed by **teams** with finite **capacity**. A task names the team that performs it; when capacity is exhausted, tokens **queue** (recorded as waiting time).",
          "",
          "**Resource calendars** model working hours: a team is *on* only within its `WorkCalendar` open intervals. Off-shift time is shown with a dim cue in the animation and a day/time clock. Capacity + calendar together drive realistic queueing and cycle time.",
        ].join("\n"),
      },
      {
        heading: "Calibration from mining (the digital twin)",
        body: [
          "A mined run's `Performance` aggregate calibrates a simulation directly — this is the *digital-twin* path:",
          "",
          "| Mined signal | Calibrates |",
          "|---|---|",
          "| `activityDurations` (sojourn samples) | per-task cycle-time distribution (fixed / triangular) |",
          "| `interArrival` | the start event's arrival rate (exponential) |",
          "| discovered edge frequencies | gateway `branchProbability` |",
          "| `activityResource` + `resourceConcurrency` | team assignment + capacity (peak concurrency) |",
          "| `activeHours` (168-bucket hour-of-week histogram) | the working `WorkCalendar` |",
          "",
          "The run horizon is derived from the log's observed `from`/`to` span. See the **Miner Design** chapter for how these aggregates are computed.",
        ].join("\n"),
      },
      {
        heading: "Comparison studies (as-is / to-be)",
        body: [
          "An **as-is / to-be** comparison is a single study holding both process variants as roots, with variant-pinned scenarios so the same demand + calendars run against each. The report contrasts cycle time, cost and resource utilisation side by side.",
        ].join("\n"),
      },
      {
        heading: "Interchange & standards",
        body: [
          "The Simulator supports the following import/export standards:",
          "",
          "| Standard | Direction | Notes |",
          "|---|---|---|",
          "| **BPSim** (BPMN Simulation Interchange, WfMC) | Import + Export | The simulation-parameter layer — arrival rates, durations, resources, branch probabilities — expressed as the industry-standard BPSim extension so a model round-trips with other BPSim tools. |",
          "| **`.dgxsim` bundle** | Import + Export | Diagramatix's own self-contained study bundle: the root diagrams, calibrated parameters, teams, calendars and scenarios in one portable file. Full-fidelity (nothing is dropped). |",
          "",
          "BPSim is the *standard* interchange (lossy to what BPSim can express); the `.dgxsim` bundle is the *lossless* Diagramatix-native form.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "miner-design",
    title: "Miner Design (DiagramatixMINER)",
    sections: [
      {
        heading: "Overview & pipeline",
        body: [
          "DiagramatixMINER is a **state-centric** process miner. The pipeline:",
          "",
          "`ingest → normalise to traces → compress to variants → discover (BPMN + state machine) → conformance → calibrate`.",
          "",
          "The deliberate design choice is to treat the **entity state** as a first-class signal (not just the activity), which is what powers the distinctive state-machine conformance. Everything downstream runs off the compressed **variants**, not raw events.",
        ].join("\n"),
      },
      {
        heading: "Event-log ingest model",
        body: [
          "The ingest maps uploaded columns to **roles**. Recognised roles:",
          "",
          "| Role | Required? | Notes |",
          "|---|---|---|",
          "| Case / entity id | Yes | the process instance |",
          "| Activity | Yes | the business event |",
          "| Timestamp | Yes | epoch (s/ms), Excel serial, or ISO/parseable date |",
          "| State | **Optional** | the entity's resulting state; when absent, supplied by the **Activity→State table** (defaults each activity to a same-named state) |",
          "| Resource | Optional | who/what performed it → simulation team |",
          "| Control / Risk / Policy ID | Optional | GRC identifiers → the governance aggregate (see below) |",
          "| Entity type | Optional | recognised but not currently used downstream |",
          "",
          "Rows missing a case id or a parseable timestamp are **dropped** (counted in stats). Formats accepted: **CSV/TSV**, **XES**, **OCEL** (see the standards section).",
        ].join("\n"),
      },
      {
        heading: "Variant-compression architecture",
        body: [
          "**Raw events are not persisted.** After normalising to per-case traces, the log is compressed to **variants** — distinct `(state[], activity[])` sequences + a frequency count — and only the aggregates are stored on `ProcessMiningRun`:",
          "",
          "- `mapping` — the column→role mapping",
          "- `stats` — headline counts + time span",
          "- `variants` — the compressed log (the persisted event data)",
          "- `performance` — timing / resource aggregates (simulator feed)",
          "- `governance` — control/risk/policy aggregates (when the log carried them)",
          "- `conformance` — the latest replay result (fitness + violations)",
          "",
          "**Consequence:** per-event timestamps and resources are discarded at compression; anything needed later (performance, governance) must be computed *at import*. This bounds storage but forecloses per-event re-analysis — the key architectural trade-off.",
        ].join("\n"),
      },
      {
        heading: "Discovery",
        body: [
          "Two artefacts are discovered from the variants:",
          "",
          "- **BPMN process** — a directly-follows graph (DFG) over activities, AI-curated into a clean model (gateways at real branches, rework loops, tidy labels, noise dropped).",
          "- **State machine** — the entity lifecycle (states + the events that move between them), AI-curated into a governable reference.",
          "",
          "Both are editable diagrams; the state machine becomes the reference for conformance.",
        ].join("\n"),
      },
      {
        heading: "Conformance",
        body: [
          "Conformance **replays** each variant's state sequence against a reference **state-machine** diagram (the single source of truth), matched **by label**. **Fitness** = the fraction of cases whose whole state sequence replays cleanly.",
          "",
          "Violation taxonomy: `undocumented-transition`, `unknown-state`, `unexpected-entry`, `unexpected-exit`, `dead-transition`. Each is frequency-weighted (cases affected) and carries the reference element/connector ids for the overlay.",
        ].join("\n"),
      },
      {
        heading: "Governance aggregate",
        body: [
          "When the log carries **Control IDs** on events, the ingest computes per-control operating-effectiveness directly (no reference needed):",
          "",
          "- `expected` = distinct cases in which a *governed* activity occurred (an activity the control is seen on anywhere in the log),",
          "- `applied` = distinct cases in which the control id was actually recorded,",
          "- `bypassed` = `expected − applied`, and **effectiveness%** = `applied / expected`.",
          "",
          "Risk and Policy IDs get distinct-case counts (traceability). This closes the loop with the **RCM**: a Control's `code` is matched to `governance.controls[code]`, so the Risk-Control Matrix shows mined effectiveness. (A second, older path derives effectiveness from conformance deviations via a control's `monitorSignature` — see the RCM chapter.)",
        ].join("\n"),
      },
      {
        heading: "Performance & calibration",
        body: [
          "`Performance` is mined once at import from the transient traces:",
          "",
          "- **activityDurations** — sojourn time to the next event, per activity (the service-time samples),",
          "- **interArrival** — gaps between consecutive cases' first events,",
          "- **activityResource** — the dominant resource per activity,",
          "- **resourceConcurrency** — max simultaneous cases per resource (→ team capacity),",
          "- **activeHours** — a 168-bucket hour-of-week histogram (→ working calendar).",
          "",
          "These feed the Simulator calibration verbatim (see **Simulator Design → Calibration from mining**).",
        ].join("\n"),
      },
      {
        heading: "Interchange standards",
        body: [
          "DiagramatixMINER imports and exports the industry event-log standards. Summary of what each is and our fidelity:",
          "",
          "| Standard | Import | Export | Notes |",
          "|---|---|---|---|",
          "| **IEEE XES (1849)** | Yes | Yes | The ISO/IEEE event-log XML. Import maps the standard extensions (`concept:name`, `time:timestamp`, `org:resource`, `lifecycle:transition`); state is left unmapped so the Activity→State table completes it. Export is **variant-level** — traces are reconstructed from variants with synthetic monotonic timestamps (raw events aren't stored). |",
          "| **OCEL (2.0 & 1.0)** | Yes | Yes | Object-Centric Event Log (JSON). Import is a **single-object projection**: you pick one object type as the case, and events relating to it become rows. Export emits single-object OCEL 2.0. Full multi-object analytics are out of scope. |",
          "| **CSV / TSV** | Yes | — | The de-facto minimum. Delimiter auto-detected; quotes/BOM/CRLF handled. A classic 3-column (Case, Activity, Timestamp) log imports directly via the Activity→State table. |",
          "",
          "**Why export is variant-level:** the miner persists compressed variants + aggregates, not raw events — so XES/OCEL exports faithfully reproduce *what happened and how often*, but not original timestamps. Round-tripping (export → re-import) reproduces the same process structure and variant frequencies.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "rcm-design",
    title: "RCM Design (Risk & Control)",
    sections: [
      {
        heading: "Overview",
        body: [
          "The Risk & Control Matrix (RCM) puts **GRC on the model**. It follows the **org-master → project-copy** catalog pattern (mirroring Entity Lists): an Org maintains a master library; each project **adopts a copy** it can edit independently. Risks and Controls are attached to real process steps, and a Risk-Control Matrix is exported for auditors.",
        ].join("\n"),
      },
      {
        heading: "Data model",
        body: [
          "Four relational models: `RiskControlLibrary` → `RiskControlItem` → `RiskControlLink`, plus `RiskControlCodeSequence` (the org-wide numbering counter).",
          "",
          "An **item** is one of seven kinds: **Risk, Control, Policy, Regulation, Audit Finding, KRI, KPI**. A **link** is a directed edge `{ sourceId, targetId }`, so the whole catalog is a **directed traceability graph** (Risk ↔ Control ↔ Policy ↔ Regulation ↔ Audit Finding ↔ KRI ↔ KPI).",
          "",
          "Risks carry likelihood/impact (inherent) and residual likelihood/impact (after controls) → **inherent vs residual scoring**. Controls carry type, frequency, owner, framework reference, and a `monitorSignature` (see effectiveness).",
        ].join("\n"),
      },
      {
        heading: "Attaching to process steps",
        body: [
          "Risks/Controls are attached to elements via `element.properties.risk` (mirroring the simulation-params annotation pattern). References are stored **by id** with a **cached label**, so a step shows its risks/controls on the model and the RCM export can resolve them even if a label later changes.",
        ].join("\n"),
      },
      {
        heading: "Org-wide numbering & the Org Owner",
        body: [
          "Every item carries a stable **code** (`R-001`, `C-001`, `P-001`, `REG-001`, `AF-001`, `KRI-001`, `KPI-001`). Codes are **org-wide**: a single running sequence per (org, kind) spans *all* of the org's projects, so the same control reads the same code everywhere.",
          "",
          "- **The counter** is `RiskControlCodeSequence { orgId, kind, counter, @@unique([orgId, kind]) }`. `createItem` mints the next code with an atomic `upsert` + `increment` **inside its transaction** — concurrency-safe, no gaps under parallel creates. The library's org is resolved from the library itself (project copy → `project.orgId`; org master → `orgId`). A caller-supplied code still overrides.",
          "- **Clones stay consistent.** Adopt/clone copy codes *verbatim*, so a control cloned into a project keeps its org-master code. The one-time reconciliation `scripts/renumber-org-rcm-codes.ts` (pure core in `app/lib/riskControls/renumber.ts`, tested) canonicalises every item org-wide: clones of a master control collapse to one shared code, project-local items reusing a code stay distinct, and it rewrites the **cached codes on diagram attachments** (`element.properties.risk[].code`, keyed by `itemId`). Idempotent — safe to re-run.",
          "",
          "**Org Owner** — the owning Org (`Project.orgId`) is what drives an item's numbering sequence. It is **SuperAdmin-only reassignable**: `PUT /api/projects/[id]` accepts `orgId` behind an `isSuperuser` field-gate (non-SuperAdmin → 403). Everyone sees a read-only Org Owner chip in the project header; a SuperAdmin gets an inline org picker (red, per the role convention).",
        ].join("\n"),
      },
      {
        heading: "Analytics panel & on-model highlight",
        body: [
          "**Analytics panel** — the Risk & Control console has a **Catalog / Analytics** tab toggle (`RiskControlAnalytics.tsx`). Analytics is computed **client-side** from the already-loaded library + effectiveness + attachments (no extra fetch), with hand-rolled SVG bars (the `FlowHistogram` idiom): counts by kind, control coverage vs gaps, inherent/residual risk posture by band, control type & automation mix, on-model coverage, and operating-effectiveness distribution.",
          "",
          "**On-model highlight** — while a step's **Risk & Controls** section is expanded in the Properties Panel, the canvas rings **risk-carrying elements red** and **control-carrying elements green** (both → two offset rings). The section lifts an `onOpenChange` flag up through `PropertiesPanel` → `DiagramEditor`, which computes a `riskHighlightById` map over `data.elements` via `getRiskControl` and passes it to `Canvas` as an additive `<rect>` overlay (coexists with the issue-scan tint).",
        ].join("\n"),
      },
      {
        heading: "Coverage & segregation-of-duties",
        body: [
          "Two scan rules surface governance gaps automatically (alongside the BPMN structural rules):",
          "",
          "- **B38 — Control coverage:** a step carrying a Risk but **no** mitigating Control is flagged (a coverage hole).",
          "- **B39 — Segregation of duties:** a lane holding both a *create* and an *approve* activity is flagged.",
          "",
          "They appear in the diagram issue scanner and the structural-issues bucket with the offending element ids highlighted.",
        ].join("\n"),
      },
      {
        heading: "Control operating-effectiveness",
        body: [
          "Effectiveness is proven from **real execution data** via two evidence sources:",
          "",
          "1. **Mined Control IDs (preferred)** — the control's `code` is matched to the mining run's `governance.controls[code]`; effectiveness = applied / expected cases (see **Miner Design → Governance aggregate**).",
          "2. **Conformance deviations** — a control names the deviation it guards (`monitorSignature`); when the run's conformance shows that deviation in N of M cases, the control was *bypassed* N times.",
          "",
          "Both render as “bypassed in N of M cases” against the control, with the evidence source labelled.",
        ].join("\n"),
      },
      {
        heading: "Examples catalog",
        body: [
          "GRC examples are adoptable via `RiskControlExample` (package + adopt, mirroring the Simulator/Mining example catalogs). The **Order-to-Cash** sample ships a full process + risks/controls attached to the real steps + a bundled mining run, so control operating-effectiveness lights up on adopt.",
        ].join("\n"),
      },
      {
        heading: "Export & standards",
        body: [
          "The RCM exports to a multi-sheet Excel workbook — the format auditors expect:",
          "",
          "| Standard | Direction | Notes |",
          "|---|---|---|",
          "| **OOXML SpreadsheetML (`.xlsx`)** | Export | Hand-built via JSZip (no library). Sheets: **Audit Grid** (flat Activity × Risk × Control), **RCM**, **Control Register**, **GRC Register**, **Traceability**, **Coverage Summary**. |",
          "",
          "Framework references (e.g. **SOX**, **ISO 27001**) are carried as control *metadata* (attributes), not an import standard — they identify which external framework a control satisfies.",
        ].join("\n"),
      },
    ],
  },
  {
    slug: "compliance-design",
    title: "Compliance Monitoring Design",
    sections: [
      { heading: "Overview", body: [
        "Compliance Monitoring is the org-level counterpart to the per-project RCM screen: **how well controls are operating over time**, assembled from the DiagramatixMINER runs retained across *all* of an org's projects. It is a **read-only aggregation** — no new persistence, no schema change; the data already exists on the runs and in the RCM catalog.",
      ].join("\n") },
      { heading: "Data sources", body: [
        "`GET /api/orgs/[id]/compliance` (guarded by `requireOrgAdminFor`) enumerates every `ProcessMiningRun` across the org's projects (a relational `project.orgId` filter, which also covers legacy runs whose own `orgId` is null) and loads the org's control catalog (master + project copies), **deduped by code** — codes are org-wide, so a code is the canonical unit.",
      ].join("\n") },
      { heading: "Aggregation (Σapplied/Σexpected)", body: [
        "Per (run, control), effectiveness reuses the same two evidence sources as the RCM screen: mined Control IDs (`logControlEffectiveness`, preferred) else a conformance deviation (`controlEffectiveness`). Both expose bypassed/total, giving `applied = total − bypassed` and `expected = total`. Because `ControlObservation` is **additive**, an org-level effectiveness for a control code = **Σapplied / Σexpected** over the matching runs. The pure `buildComplianceReport` (`app/lib/riskControls/compliance.ts`) emits the run time-series, per-control series, per-project latest, and a summary.",
      ].join("\n") },
      { heading: "Alerts, thresholds & decline", body: [
        "A control is **below threshold** when its most-recent effectiveness is under the org threshold (default 80%, overridable via `?threshold=`), and **declining** when the latest point dropped run-over-run. The report ranks controls most-at-risk first so the console leads with what needs attention.",
      ].join("\n") },
      { heading: "Access & console", body: [
        "The console (`dashboard/compliance`) is gated like OrgAdmin, plus SuperAdmin (who can pass `?orgId=` to inspect any org). It renders hand-rolled SVG trend charts (the `FlowHistogram` idiom): a headline effectiveness-vs-fitness trend, an alerts list, a per-control detail chart, and a by-project table with drill-through. It becomes meaningful once an org has **two or more runs** to trend across.",
      ].join("\n") },
    ],
  },
  {
    slug: "pcf-design",
    title: "APQC PCF (Process Classification)",
    sections: [
      { heading: "Two-layer model", body: [
        "The APQC Process Classification Framework is a standalone feature (never folded into Entity Lists). Two layers: a **reference layer** (read-only, global — `PcfFramework.orgId = null`, `kind = \"reference\"`: the Cross-Industry spine + industry variants + version history) and a **tailored layer** (org-owned, editable — `orgId` set, `kind = \"tailored\"`: composed from reference branches + org extensions).",
        "",
        "`PcfFramework` (id, orgId?, kind, familyKey, name, variant, version, isCurrent, division?, attributionNote) has many `PcfNode` (pcfId = APQC col A, the **STABLE** upgrade key; hierarchyId = dotted display code, NOT stable; level, parentId, sortOrder, metricsAvailable, changeType?, plus tailored-layer fields isCustom / active / orgCode / sourceFrameworkId / sourcePcfId). Both tables are pinned in the backup coverage guard.",
      ].join("\n") },
      { heading: "Import & versioning", body: [
        "`app/lib/pcf/importPcfXlsx.ts` hand-parses the APQC `.xlsx` with JSZip (no new dep): a modern **Combined** sheet, or the legacy per-category format that embeds the dotted code in the name cell. Column F is read as a `metricsAvailable` **boolean only** — OSB benchmark *values* are never imported (separate APQC product, separate terms). `persistPcfFramework` pre-assigns node ids so the whole tree lands in one `createMany`; importing a newer version of a `familyKey` flips the previous to `isCurrent = false` and keeps it for history.",
      ].join("\n") },
      { heading: "Classify, seed & AI grounding (L1–L3)", body: [
        "A diagram carries an optional `DiagramData.pcf` classification keyed on the stable `pcfId` (additive JSON, mirroring `processOwner`). **Create APQC Project** seeds a project folder tree from a branch — with an optional root and depth **relative** to it (BFS in the seed route). **AI grounding** (`app/lib/pcf/promptGrounding.ts`) injects the selected branch at the `${rules}` seam so generated models align to the standard.",
      ].join("\n") },
      { heading: "Create APQC Process (decompose vs AI)", body: [
        "One click generates a BPMN model for a standard process. A node **above** Task level **decomposes** deterministically (`/pcf/decompose`: Start → a Collapsed Subprocess per APQC child → End, via `layoutBpmnDiagram`); a **Task-level leaf** falls back to AI generation. Optional **APQC numbering** prefixes each task/subprocess label with its code, and stamps `properties.pcfHierarchyId`/`pcfId` on the element so the Properties Panel shows it. The chosen framework/root default onto the project via `Project.pcf`.",
      ].join("\n") },
      { heading: "Analytics — coverage & by-category compliance (L4)", body: [
        "**Coverage** (`app/lib/pcf/coverage.ts`, pure): of the nodes in a project's framework/branch, which are *modelled* (a diagram classified to them, matched by nodeId or same-framework pcfId), rolled up per category and level. **By-category compliance** (L4b): `buildComplianceReport` gains an optional `pcfCategory` per run — the org Compliance console attributes each mining run to the APQC category of its project's linked root and rolls control effectiveness + fitness up **by category**, worst-first.",
      ].join("\n") },
      { heading: "Tailoring, provenance & upgrade (L5)", body: [
        "`composeBranch` (`app/lib/pcf/compose.ts`, pure) copies a reference subtree into a tailored framework carrying `sourceFrameworkId` + `sourcePcfId` provenance, re-based levels and remapped parents (one self-referential `createMany` — Postgres checks the FK at statement end). Orgs **compose / extend (custom nodes get a synthetic negative pcfId) / curate (rename-keeps-provenance, hide, org-code, remove) / scope to divisions**. The **upgrade wizard** (`diffPcfVersions` by stable pcfId → added/removed/renamed) re-points classifications + tailored provenance to a newer version by `pcfId`; removed ids are flagged (`removedInVersion`), not broken.",
      ].join("\n") },
      { heading: "APQC licence & attribution", body: [
        "APQC grants a perpetual, worldwide, royalty-free licence to use / copy / modify / redistribute the PCF — including inside this paid SaaS and in derivative (tailored) frameworks — **provided every copy and derivative carries APQC's notice**. So `attributionNote` is stored per framework, tailored frameworks are seeded with it (they're derivatives), and `app/lib/pcf/attribution.ts` (`APQC_ATTRIBUTION` + `dataHasPcf`) makes the notice **ride along on any export carrying PCF content** — project + single-diagram JSON/XML (a new optional `<pcfAttribution>` XSD element) and the public process/bundle view footer. Visio (labels/mapped-props only), docx (doc editor) and backups (carry `attributionNote` inherently) don't need injection. **OSB benchmark values are never bundled** — only the `metricsAvailable` flag.",
      ].join("\n") },
    ],
  },
  {
    slug: "content-catalogs",
    title: "Content, Catalogs & Examples",
    sections: [
      { heading: "Editable-catalog pattern", body: [
        "Curated \"sets of things\" are **admin-editable catalogs with an optional seed**, never hardcoded lists — with a **draft / publish** lifecycle where the content is public-facing. This pattern recurs across features, scanner rules, diagram-type styles, bubble-help topics and the examples catalogs.",
      ].join("\n") },
      { heading: "Feature catalog", body: [
        "The public `/features` page is driven by an admin-editable **Feature** catalog (draft/publish). New capabilities seed a Features row as a **draft** on deploy; a SuperAdmin publishes it once — deploys never auto-publish marketing copy.",
      ].join("\n") },
      { heading: "Examples catalogs", body: [
        "Simulator, Mining and Risk-&-Control each have an **examples catalog** (`SimulationExample` / `MiningExample` / `RiskControlExample`) with a common **package · adopt · capture** flow: an admin captures a real project artefact into a published example; a user adopts a **copy** into a fresh project. Adopted example projects are tagged (`Project.exampleType`) so the dashboard tile is feature-coloured; renaming clears the tag.",
      ].join("\n") },
      { heading: "DB-backed help (Document model)", body: [
        "The in-app **User Guide** and these **Technical Design Notes** are the same `HelpChapter` / `HelpSection` model split by a `collection` field (`user-guide` vs `tech-design`), edited in the SuperAdmin Document Editor. They are **not bundled in the build** — they auto-seed on deploy from idempotent `add-guide-*` / `add-tech-design-*` scripts. Editor bubble-help is a separate `BubbleHelp` catalog.",
      ].join("\n") },
    ],
  },
  {
    slug: "billing",
    title: "Billing & Subscriptions",
    sections: [
      { heading: "Stripe integration", body: [
        "Self-serve payments run on **Stripe**: `/api/stripe/checkout` starts a subscription, the Customer Portal manages it, and webhooks reconcile state. Tiers and their prices/limits are an admin-editable catalog (`SubscriptionLevel` / `Feature`). A known open issue: upgrading with an active sub can create a second parallel subscription — the checkout path and Portal plan-switch need the guard re-enabled before a wider launch.",
      ].join("\n") },
      { heading: "Usage counters & limits", body: [
        "Per-tier limits are enforced against `UsageCounter` rows; the dashboard shows a usage snapshot. Limits are data (per subscription level), not hardcoded, so pricing/limit changes are an admin edit.",
      ].join("\n") },
    ],
  },
  {
    slug: "data-ops",
    title: "Data Protection & Operations",
    sections: [
      { heading: "Backup & restore", body: [
        "Backup is **catalog-driven**: the full SuperAdmin backup enumerates every table automatically, ordered to break the one Diagram↔PublishedVersion FK cycle. **Scoped** backups (org / user, `org-backup.ts`) carry a deliberate subset; the User Guide has its own collection-scoped `guideBackup`. A coverage test **fails when a new table isn't consciously covered or omitted**, so nothing silently drops out of backup.",
      ].join("\n") },
      { heading: "Archive & three-tier delete", body: [
        "Project delete is a **three-tier** model: `x` (diagrams → Unorganised, owner/OrgAdmin/SuperAdmin), `x+` (`?cascade=archive` → system Archive, OrgAdmin), `x++` (`?hardDelete=true`, SuperAdmin AND owner). The tier rules live in `authorizeProjectDelete` so they're unit-tested directly; the data effects live in `deleteProjectCascade`.",
      ].join("\n") },
      { heading: "Diagnostics", body: [
        "Connector issues are diagnosed with an in-page route tracer (`window.__DIAG_ROUTE_TRACE`, plus a verbose flag) rather than guesswork — it's a kept tool, not throwaway. A feature-flagged live \"Diagram Health\" panel (via `findLayoutViolations` / `findRoutingViolations`) is designed for surfacing violations in the editor.",
      ].join("\n") },
    ],
  },
  {
    slug: "quality-testing",
    title: "Quality & Testing",
    sections: [
      { heading: "Test strategy", body: [
        "The **Vitest** suite is the primary net (see `tests/TESTS_SUMMARY.md`, refs are append-only `Tnnnn`). Every code-enforced BPMN/geometry rule is pinned by a **behavioural test in a rule registry**, so a regression trips a red test rather than shipping. Pure engine logic (routing, layout, mining conformance, RCM effectiveness, compliance rollup) is tested without a DB; DB round-trips cover adopt/export/backup.",
      ].join("\n") },
      { heading: "End-to-end", body: [
        "A **Playwright** browser suite (`npm run e2e`) runs against a dedicated port/DB, covering flows the unit tests can't (real editor interaction, auth). e2e specs must not collide by filename with a Vitest spec.",
      ].join("\n") },
      { heading: "CI & regression nets", body: [
        "`ci.yml` runs the full suite on every PR and push to `main`. Combined with schema-push-on-deploy, green CI plus a merge is the release. The Visio export net, the backup-coverage guard and the layout/routing violation analyzers are the standing regression nets that let the risky subsystems evolve.",
      ].join("\n") },
    ],
  },
];

async function main() {
  const url = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/diagramatix";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (let ci = 0; ci < CHAPTERS.length; ci++) {
      const chDef = CHAPTERS[ci];
      let chapter = await prisma.helpChapter.findFirst({ where: { collection: COLLECTION, slug: chDef.slug }, include: { sections: true } });
      if (!chapter) {
        const created = await prisma.helpChapter.create({ data: { collection: COLLECTION, slug: chDef.slug, title: chDef.title, sortOrder: ci } });
        chapter = { ...created, sections: [] };
        console.log(`Created chapter "${chDef.title}".`);
      } else {
        await prisma.helpChapter.update({ where: { id: chapter.id }, data: { title: chDef.title, sortOrder: ci } });
        console.log(`Chapter "${chDef.title}" exists — updating sections.`);
      }
      let i = 0;
      for (const s of chDef.sections) {
        const existing = chapter.sections.find((x) => x.heading === s.heading);
        if (existing) await prisma.helpSection.update({ where: { id: existing.id }, data: { bodyMarkdown: s.body, sortOrder: i } });
        else await prisma.helpSection.create({ data: { chapterId: chapter.id, collection: COLLECTION, heading: s.heading, bodyMarkdown: s.body, sortOrder: i } });
        i++;
      }
    }
    console.log("Technical Design Notes seeded.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
