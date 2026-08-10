# Diagramatix — Version History

Running, human-readable log of **every** release — feature-only *and* schema-bearing. This is
the single place a feature-only release is recorded (the schema-scoped histories in
[`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md), the XSD, and `types.ts` only move on
a `schemaVersion` bump). Newest first.

- **Version shown** = `appVersion` = `schemaVersion` + `.` + git commit count (the build number).
- Maintained per [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) Step 5, on every
  release.
- Earlier history (pre-`1.44` feature window, v1.0 → v1.43) lives in
  [`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md).

---

## 2.1.1 (build 2157) — 2026-08-10 — Mobile: view a diagram + add/save Review Comments
- The `/m` mobile diagram screen goes from read-only to **reviewable**: pan/zoom stays, and owners/editors/
  **assigned reviewers** can now **tap ＋ Comment → tap an element → type or dictate a Review Comment**, then
  **Save**. Review comments are **always collapsed on mobile save** (38×32 icons) so they open tidily on desktop.
- **Dictation** reuses the shared `startDictation` primitive (Deepgram streaming, auto-falling back to the
  phone's native speech-to-text) via a 🎤 mic in the comment sheet; added an iOS `AudioContext.resume()`.
- Existing review comments show as tappable pink pins tethered to their element (read sheet on tap); honours
  the `showReviewComments` toggle. Save uses the optimistic-concurrency `PUT` (409 → reload prompt); the
  diagram itself stays view-only. Pure viewers get no ＋/Save.
- Engine: `MobileReviewLayer` + `MobileCommentSheet`; `MobileDiagramView` gains an aligned overlay + tap-pick
  (shared `thumbnailTransform`); pure `reviewCollapse.ts` + `reviewComment.ts` (desktop-identical note/tether
  shape); GET `/api/diagrams/[id]` returns `canReview` + viewer. Tests T2261-T2263.
- **Schema: no change** (only `review-comment` elements/links in existing diagram JSON — Q1 no, Q2 no →
  feature-only; product version stays 2.1.1).

## 2.1.1 — 2026-08-10 — Version model split (product version 2.1.1 + XSD schema v45) + Visio/preview
- **Two independent version numbers now** (per Paul). `PRODUCT_VERSION` (`major.middle.patch`, restarted
  at **`2.1.1`**) is the Diagramatix product version — its **middle increments on any physical DB
  table/column change**, patch on fixes, major manually. The header badge shows `v2.1.1 (build <commit
  count>)`. `SCHEMA_VERSION` is now a standalone **integer `45`** (the old `1.45` minor) = the XSD schema
  version, bumping **only** on an XSD export-shape change (the original criterion). Exports stamp
  `schemaVersion="45"` + `appVersion="2.1.1"`; legacy `1.NN` files still import via
  `structuralSchemaVersion()` / `checkSchemaCompatibility()`. Rule rewritten in
  [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) Step 0 (Q1 DB→product middle; Q2 XSD→schema
  integer).
- **XSD (schema v45)** export leaf now shows the version; **Preview pop-ups** for XSD *and* DDL get
  **Cancel / Export** buttons (Export primary) — the colour, scrollable modal already existed.
- **Visio Stencil fix:** the shipped `public/BPMN Diagramatix Shapes v1.6.vssx` displayed **v1.4** in Visio
  because its internal `docProps` (title/description/Template) were never renamed past v1.4. Patched those
  to **v1.6** (no GUID churn) and hardened `scripts/build-v16-from-v15.cjs` so future regenerations remap
  v1.4 too. The stencil is a static repo file served directly — not DB, not runtime-generated.
- Tests T2258-T2260 (version split + legacy-tolerant compat). **Schema integer: unchanged (still 45)** —
  pure renumbering, no XSD shape change.

## 1.45.2153 — 2026-08-10 — Schema-version policy widened + catch-up bump
- **Policy (Paul):** `schemaVersion` now bumps on ANY change to the **entire physical database**
  (any table/column/enum/relation anywhere — operational/auth/billing/telemetry/mining/connection
  tables included, not just the curated diagram Logical DDL) **and** on ANY **in-DB JSON structure**
  change (a new persisted diagram/project attribute — including an `element.properties.*` key — or a
  change to an attribute's allowed values). Previously the rule was export-shape-only + curated-DDL-only,
  so operational tables and open `properties` keys rode without a bump — which is why the number sat at
  1.44 for so long. Rule rewritten in [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) Step 0
  and [`schema/SCHEMA_CHANGELOG.md`](schema/SCHEMA_CHANGELOG.md).
- **Catch-up bump 1.44 → 1.45** accounting for structure added since 1.44 without one: new tables
  (`MicrosoftConnection`, `ProcessDiffRun`, `IntentKeywordMap`), new columns
  (`ProcessMiningRun.analytics`/`kpiConfig`, `DiagramTemplate.description`/`thumbnailSvg`), and new
  diagram `properties` attributes (`sharepointLink`, `fillColor`, review-comment fields).
- **No export-XSD shape change** — the diagram `.xml`/`.json` interchange is unchanged; the bump is
  driven by DB tables/columns + open-`properties` attributes. `types.ts` SCHEMA_VERSION + the four
  schema-sync files updated together. Going forward, each such change bumps on its own release.

## 1.44.2153 — 2026-08-09 — SharePoint for web users (bring-your-own, multi-tenant)
- **New:** any signed-in web user can now **Connect SharePoint** with their own Microsoft 365 — regardless of
  how they logged in (email/password or Microsoft) and regardless of org. Previously SharePoint was welded to
  *logging in* with Microsoft in the single nashcc tenant, so most web users got 403 everywhere.
- A **standalone delegated-OAuth "connect" flow** (`app/api/microsoft/{connect,callback,disconnect,status}`),
  separate from login, targeting the multi-tenant `organizations` authority (PKCE + CSRF state cookie). Because
  it runs after the user is already signed in, it also **sidesteps the parked multi-tenant *login* home-realm
  bug** — login stays single-tenant and unchanged.
- Tokens are persisted per-user in a new **`MicrosoftConnection`** table, **AES-256-GCM encrypted at rest**
  (`app/lib/crypto/tokenCrypto.ts`, new env `MS_TOKEN_ENC_KEY`); a DB-backed accessor
  (`getMsAccessTokenForUser`) refreshes transparently and the three `/api/sharepoint/*` routes now read from it.
  Tokens never reach the client (status endpoint returns booleans + UPN only).
- `hasMicrosoft` now means "has a connection" (DB), fed to the existing prop unchanged; Microsoft-login users are
  **auto-connected** (seamless migration). Connect/disconnect lives in **Account Settings**; the picker's empty
  state now starts the connect flow.
- Tests T2252-T2257 (crypto round-trip/tamper, PKCE/authorize/id_token/returnTo). **Schema: no bump** (operational
  token store, outside export XSD + ddlGenerate — same precedent as `ProcessMiningRun.analytics`).
- **Azure follow-up (Paul):** set the existing app registration to **Multitenant**, add redirect URI
  `<origin>/api/microsoft/callback` (local + prod), set `MS_TOKEN_ENC_KEY` (local + prod). See `.env.example`.

## 1.44.2152 — 2026-08-09 — Screencast: fix audio/video sync drift
- **Fix (Paul):** recorded audio drifted slightly out of sync with the video. Two independent clocks were
  to blame — audio runs on the real-time audio clock, but the video was generated by a `requestAnimationFrame`
  draw loop feeding `canvas.captureStream`, whose frame clock jitters/drops under load, so audio slowly
  pulled ahead.
- **Direct-track capture when the webcam PiP is off:** the recorder now records the `getDisplayMedia` screen
  track **directly** (hardware/OS-clocked → tight, drift-free A/V) instead of routing through the canvas.
  Canvas compositing is kept only when the inset webcam is actually on (camOn is fixed at record start).
- **Transcode hardened for variable frame rate:** `ffmpegWebmToMp4Args`/`ffmpegToWebmArgs` now pass
  `-fps_mode passthrough` (preserve MediaRecorder's real VFR timestamps instead of forcing a constant rate
  that shifts alignment) + `-af aresample=async=1:first_pts=0` (lock audio to the video timeline). Tests
  T2251. Schema: no bump.
- **Fix (Paul):** states weren't matching in the **Conformance Check** when a label carried an internal
  **newline** (a long multi-word state like *"Level 1 In Progress"* wrapped across lines in the reference).
  The comparison only `.trim()`-med — stripping leading/trailing whitespace but leaving an embedded newline
  intact — so *"Level 1 In\nProgress"* ≠ *"Level 1 In Progress"* and every case read as an illegal transition.
- Now every label comparison in the conformance path **collapses internal whitespace** (`\s+`→single space)
  before matching: `checkTransitionConformance`, `flagIllegalTransitions` (the red-badge pass),
  `stateMachineCoverage`, and `referenceScope`. **Activities** are the transition labels (conformance itself
  matches by state) — those, plus states, are now also **cleaned at ingestion** (`parseEventLog`) so a value
  never stores an embedded newline in the first place. Test T2250. Schema: no bump.

## 1.44.2150 — 2026-08-09 — Mining: generated State Machine must cover the whole log
- **Rule (Paul):** any *generated* reference State Machine must show **every state and activity that is in
  the event log** — else conformance replays the log against a partial model and reports a flood of false
  **illegal transitions**. Enforced in **code** (not just the prompt) on both generation paths via a new pure
  `reconcileStateMachineCoverage`: after discovery it adds back any observed state, entry, transition or
  terminal the generator left out (matched case-insensitively by state label, transition labelled with its
  triggering activity).
- The **AI-curated** path previously told the model to *merge near-duplicate states* and *omit anomalies as
  noise* — the exact cause. That instruction is replaced with a **completeness-mandatory / keep-exact-labels**
  brief, and the code pass guarantees it regardless of what the model returns.
- The deterministic `discoverStateMachine` was already complete → the pass is an idempotent no-op there, but
  both paths now flow through the single enforced coverage guarantee. Tests T2247-T2249 (incl. a 100%-fitness
  conformance guard). Schema: no bump.

## 1.44.2149 — 2026-08-09 — Mining: view / filter the imported event log
- New **🔍 View / filter log** button in the import staging area (shown once a CSV/XES log is loaded) →
  a full-screen table of exactly what's being imported: **free-text search** across all columns plus a
  **per-column dropdown filter** on low-cardinality columns (activity / resource / state / …). Render-
  capped at 2,000 rows (narrow the filters to see more); Esc or Close to return. Lets you verify the
  parse before committing the run.
- New `app/components/mining/MiningLogViewer.tsx` (pure, `data-no-capture`). Schema: no bump.

## 1.44.2148 — 2026-08-09 — Mining Insights: per-activity summary + fixes
- New **📋 Activities** tab (now the default) — **one row per activity type** with its cases, events,
  median / total time, and the **team(s) + state(s)** it carries (normally one each; multiples flagged
  amber). Plus an all-**states** and all-**teams** chip summary so every distinct state/team is visible.
  Analytics now capture per-activity resources + states.
- **Fix:** the enrichment "✨ Filled N of M…" message no longer lingers — it clears on each new
  file/scenario load and only shows while a fill table is actually open (so a log that already has the
  resource/state columns won't show it).
- Runs imported before this show a "re-import to populate teams/states" hint (analytics predates it).
- Schema: no bump.

## 1.44.2147 — 2026-08-09 — Mining: enrich a sparse log from the project's models
- On import, when the log has **no resource** and/or **no state** column, the console now offers to
  fill them from the project's own models: **teams from a Process Diagram** (activity → task → lane)
  and **states from a State Machine** (activity → transition → target state), matched by label
  (exact, then fuzzy). Result is an **editable table** you confirm before import — never silent.
  So a minimal (case/activity/timestamp) log can climb to full fidelity without editing the log.
- Engine: `app/lib/mining/enrich.ts` (pure), `LogMapping.activityResource` (mirrors the existing
  `activityState` fallback in `buildEventLog`), a project-diagrams list route. Tests T2243-T2246.
- Schema: no bump (the maps ride in the import mapping JSON).

## 1.44.2146 — 2026-08-09 — Mining Insights: mined time + team caption under each task
- The Insights model now shows the mined **"simulation data" under each task** — its median
  time-in-step + dominant team — as a caption (toggle **🏷 time · team**, on by default), matched to
  each activity from the log. Visible immediately after Discover (no need to calibrate first), and
  carried into the expanded/zoom view. Schema: no bump.

## 1.44.2145 — 2026-08-09 — Mining: calibratable AI process, in-context variant/case highlight, fixes
- **Variants / Cases** now highlight the selected path **in context** — the whole discovered model
  is shown with everything off the path **faded**, and the path's count badges stand out (no more
  isolating/fragmenting). The variant-path resolver walks **through gateways** so the highlight stays
  connected; the highlight now carries into the **expanded** view and is driven by the selected case
  *or* the variant filter (fixes Cases selection not reaching the expanded view).
- **AI-discovered process is now calibratable:** the AI keeps the log's exact activity names, and the
  mined directly-follows frequencies are re-attached to its edges — so cycle times, teams AND gateway
  branch probabilities calibrate onto the AI model too. Tests T2241-T2242.
- **Readiness warning** now identifies an unrouted gateway by its neighbours (`Decision after "X"
  (→ A / B)`) instead of a cryptic id.
- **Fix:** the deterministic (non-AI) discovered process is no longer stamped with an "AI Generated"
  annotation.
- Schema: no bump.

## 1.44.2144 — 2026-08-09 — Fix: gateway branch probabilities calibrate from badged edges
- The digital-twin calibrator read the gateway split from the edge `label`, but the edge-count
  badge fix (1.44.2143 below) moves that number into `transitionCount` and clears the label — so a
  freshly discovered process would calibrate with **no branch probabilities**. `calibrateSimulation`
  now reads the mined count from `transitionCount` (falling back to `label`). Test T2240.

## 1.44.2143 — 2026-08-09 — Fix: spurious auto-connect on click in generated diagrams
- **Root cause:** the auto-fuse feature (drop an element onto a connector to splice it in, creating
  an in + out connector) ran on **every** `MOVE_END` with no move-distance check. Generated / AI
  layouts place tasks and gateways exactly on the centre-line of skip/branch (gateway) edges, so a
  plain **click** (a zero-move drop) spliced the element into the through-connector and spawned
  spurious connectors to/from it — usually to the nearby gateway.
- **Fix:** the splice now only fires when the element was actually **dragged** a meaningful distance
  (`MOVE_END` carries the pre-drag position; a click is ignored). Also enlarged the transition-count
  badges so multi-digit numbers fit inside the circle. Tests T2238-T2239.

## 1.44.2140 — 2026-08-08 — DiagramatixMINER Insights — feedback pass 1
- **Expand to full-screen** on the Insights / Variants / Cases tabs — the discovered process gets
  maximum space with the tables underneath, **click-to-zoom** on the diagram (Esc resets to fit) and
  a **Return** button. Path isolation carries over into the big view.
- Discovered **BPMN edge frequencies** now render as the same green **count badge** the discovered
  state machine uses (not a plain number floating by the line).
- **Explain results** no longer spins with nothing to show — on an AI failure it falls back to the
  deterministic summary so a result always returns.
- Schema: no bump. Tests T2237.

## 1.44.2137 — 2026-08-08 — DiagramatixMINER Insights (Process Mining v2)
- New **Insights** workbench in the mining run console — closes the biggest gaps vs Apromore:
  - **🔥 Heat** — colour the discovered model by Total time (bottleneck) / Frequency / Avg time,
    with a legend + top-steps table.
  - **🔀 Variants** — frequency Pareto, click-to-isolate a variant's path, multi-select overlay,
    two-variant activity compare.
  - **🎞 Cases** — per-case list (sortable by cycle time, filter by variant) + drill-down, plus a
    self-contained log-**replay** animating real cases over the model (no simulator engine touched).
  - **🎯 Outcomes** — set a case **SLA** → on-time vs late split + the activities/variants that
    **drive lateness** (lift).
  - **⬇ Export** — the whole analysis as Word / Excel / PDF.
- Foundations: pure `computeAnalytics` (per-activity/edge metrics + capped per-case index) persisted
  to new nullable `ProcessMiningRun.analytics`; `kpiConfig` (case SLA) persisted per run. Computed at
  import + live refresh. `SymbolRenderer` now honours `properties.fillColor` on task/state/gateway/
  event shapes (enables the non-destructive heat overlay).
- Mining **examples** carry `analytics` + a demo SLA so the features land on adoption (regenerated
  `miningExampleData.json`).
- **Schema: no bump** — the two new `ProcessMiningRun` columns are operational mining tables, outside
  the export XSD and the curated Logical DDL (`ddlGenerate.ts`), so the tracked data structure is
  unchanged. Tests T2226-T2236.
- **Prod follow-up:** re-run `scripts/seed-mining-examples.ts` so the adoptable examples carry the
  new analytics + SLA.

## 1.44.2129 — 2026-08-08 — True-to-layout Word preview (LibreOffice)
- SOP and Diff-Processes **Preview** now renders the real `.docx` → PDF via headless LibreOffice
  (`soffice`), reproducing styled headings, org Word-template branding, page breaks, and the
  landscape figure page — replacing the mammoth content-only approximation.
- New `app/lib/documents/docxToPdf.ts` (per-call temp profile, concurrency-safe, 60s timeout);
  SOP route gains `?format=pdf`, the Diff route gains `mode:"pdf"` (live + saved runs).
- Robust fallback: if conversion fails (e.g. local dev without LibreOffice) Preview
  automatically falls back to the mammoth content preview, so it never breaks. Download stays
  `.docx`.
- Docker: runner image adds `libreoffice` + `ttf-liberation` + `font-noto`, `HOME=/tmp`.
- Schema: no bump (infra + route param only).

## 1.44.2128 — 2026-08-08 — Export menu: Preview / Download flyouts
- Every File ▸ Export format (PDF, SVG, JSON, XML, XSD, BPMN, Visio) now opens a small flyout with
  two explicit choices — **👁 Preview** (the in-app pop-up) and **⬇ Download** (export as usual) —
  replacing the easily-missed inline eye icon (JSON preview was there but hard to spot).
- New standalone **XSD (schema)** leaf: Preview renders the live `/api/schema` XSD; Download saves
  the `.xsd` (it also rides along with the XML download).
- Schema: no bump (menu UI only).

## 1.44.2127 — 2026-08-08 — Version-tracking process + history
- Added [`schema/UPDATE_EVERYTHING.md`](schema/UPDATE_EVERYTHING.md) — the canonical, repeatable
  "update everything" procedure (Steps 0–12: version bump decision, the four schema-sync files,
  this history, atomic commit/deploy, and the DB-backed User Guide / Features / Tech-Notes
  updates).
- Added this `VERSION_HISTORY.md`, seeded from git.
- Schema: no bump (docs-only; no persisted-data-structure change).

## 1.44.2126 — 2026-08-08 — File Preview pop-ups
- In-app preview for exports so they can be shown on camera during screencasts (no download):
  PDF, SVG, JSON, XML, BPMN, DOCX (via mammoth), and DDL, plus a cosmetic **fake-Visio** window
  (blue ribbon + BPMN Shapes stencil + diagram SVG on a Visio grid).
- Peaceful-JSON syntax highlighting for JSON/XML/BPMN/DDL on a dark code panel; `data-no-capture`
  so the preview never leaks into a screen capture.
- Wired into File ▸ Export, the Diff Processes report + saved-run screens, the SOP editor, and
  the SuperAdmin DDL generator.
- Schema: no bump (feature-only).

## 1.44.2122 — 2026-08-08 — Screencast recording resilience
- Never lose a recording: persist chunks during capture and recover after an interruption
  (e.g. navigating to the Portal mid-record).
- Schema: no bump (feature-only).

## 1.44.2121 — 2026-08-08 — Mobile phone UI
- Dedicated `/m` route tree: auth entry, Projects list + create, and a read-only pan/zoom
  diagram viewer for phones.
- Schema: no bump (feature-only).

## 1.44.2119 — 2026-08-08 — Diff Processes run history + management
- Persisted Diff Processes runs (schema + API); run history surfaced on both diagrams'
  properties; OrgAdmin + SuperAdmin management screens; "View Before/After process" buttons;
  reusable `ProcessDiffResults` with Save / auto-save.
- Schema: no bump (rode on 1.44; predates this formalized procedure).

## 1.44.2112 — 2026-08-08 — Backups & export carry simulation configuration
- Scoped user + org backups and project JSON export/import now include the full simulation
  configuration; JSON + AI bundle are full-fidelity (always include annotations).
- Schema: no bump (rode on 1.44).

## 1.44.2110 — 2026-08-08 — Diff Processes analysis depth
- Diff BPMN message flows, dedicated Data Objects section, task-marker → automation-shift
  interpretation, intermediate + boundary events, and a Review-status section
  (Comments / Pain Points / Issues / Bottlenecks); Merge folds cherry-picked differences into a
  new diagram (SuperAdmin); AI summary in the Word export.
- Schema: no bump (rode on 1.44).

## 1.44.2099 — 2026-08-07 — Diff Processes (initial)
- Diagram ▾ menu: tabular comparison of two BPMN process versions (who / systems / what) → table
  + CSV / .docx + optional AI narrative; reuses the SOP skeleton extractor.
- Schema: no bump (rode on 1.44).

## 1.44.2097 — 2026-08-07 — Visio export Error-275 fix
- Dedupe Visio master IDs (a Pool/Lane collision caused Visio Error 275 on open); review-comment
  no longer drops a spurious tether on placement; opaque rich-text editor.
- Schema: no bump (fix release).
