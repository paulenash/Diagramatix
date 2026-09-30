# Feature Availability, Limits and Messaging — investigation and plan

Status: approved plan, nothing built yet. Result of a read-only investigation (2026-09-30). The request list started at "2", so items 2–8 are answered under those numbers.

## 0. The one-paragraph verdict

The Feature Availability matrix is the *intended* single source of truth, but only about a third of it is real. Of the 35 registry features, **6 are properly gated** (voice-assist, voice-feedback, simulator (entry points only), processMining, apqc (entry points only), riskControl (mutations only)); **6 more are gated only on the server**, and **23 have no gate at all** — editing their cell in the SuperAdmin grid changes nothing. The dashboard still reads the *old* four `has*` checkboxes, the server reads the matrix, and the two can disagree. Numeric limits are mostly enforced on the server but leak through ~14 creation paths (clone, restore, import, examples). Simulation is almost entirely ungated. Users are told almost nothing: no "nearing a limit", no trial-ending, payment-failed or comp-expiry warning, and several limit failures are silent or show raw JSON. SuperAdmin can preview a tier only cosmetically — the server never evaluates as the previewed level, so limits and most gates cannot be tested end to end.

## 1. What I found (by your numbering)

### 2. The map between features and gates

| State | Count | Features |
|---|---|---|
| **Fully wired** (UI + server, own key) | 3 | `voice-assist`, `voice-feedback` (own fail-closed gate), `processMining` (24 server gates + UI) |
| **Wired at entry points only** | 3 | `simulator` (only *create study*, *adopt example*, *calibrate*), `apqc` (only *seed-folders*, *decompose*), `riskControl` (mutations only, by design) |
| **Server only, no UI gate** | 3 | `process-mining-examples`, `process-mining-ocel`, `task-mining` |
| **Piggy-backs on another key** (own key never read) | 3 | `simulator-examples`, `risk-control-examples`, plus mining examples' adopt |
| **NOT WIRED AT ALL** | 23 | six `ai-generate-*`, `bpmn-templates`, `nl-assist`, `collaboration-groups`, `sharing`, `co-authoring`, `process-review`, `diff-processes`, four `visio-*`, `sharepoint`, `sop-generation`, `process-portal`, `mobile`, `choice-of-llms`, `local-llm`, `soc2` |

Further facts that matter:
- `<FeatureGate>` exists but **nothing uses it**. The only client reader of the matrix is `useFeatureState("voice-assist")` (2 places). Everything else uses the legacy 4-boolean `Entitlements`.
- **Two sources of truth.** Dashboard menus read `usageSnapshot.entitlements`, built from the legacy `SubscriptionLevel.has*` columns (`subscription.ts:828`); server routes and the project page read the matrix. The SuperAdmin *Subscriptions* editor still edits the legacy columns; nothing syncs them.
- **Diagram editor defect:** `simAllowed`/`rcAllowed` (`DiagramEditor.tsx:1706`) are always `true` for a real user — the Simulator button and the risk/simulation panels have no subscription gate at all (only the SuperAdmin preview hides them).
- Several other gating systems run in parallel and are *not* tied to the registry: `gateLimit` metrics (AI attempts, Visio import/export counts), `gateOrgPolicy` (`allowAi`, `allowVoiceAi`, `allowSharePoint`, …), and a hard-coded email check for SuperAdmin in the editor.
- The SuperAdmin Feature Availability page shows only `{key, label, category}` per feature (key only as a hover title). It has no description, no "where used", no notion of wired/unwired. The API already returns the whole registry object, so adding fields needs no API change.

### 3. Separating Simulation and Process Mining from "the full features"

Today `simulator` and `processMining` are single all-or-nothing keys (Expert + Enterprise only), plus small siblings (`*-examples`, `task-mining`, `process-mining-ocel`). Mining routes are all gated; **simulation is almost entirely ungated** — only three routes check it, so a user without the key who owns (or imports) a study can run scenarios, sweeps, business cases and AI assessments, and three simulation AI routes burn tokens with no `aiAttempts` accounting.

Sub-capabilities that already exist and are natural keys:
- **Simulator:** studies/scenarios, run/replay/results, compare, sensitivity + sweep, business case + next steps + AI assess, BPSim import/export, calendars, teams/skills.
- **Mining:** import (CSV/XES), OCEL, discovery, state-machine discovery, conformance, validate-twin, calibrate-to-simulator, live sources/connectors, series & alerts, snapshots, AI explain/next-steps, export, task mining, examples.

### 4. Are all settings and limits implemented?

| Setting | Verdict |
|---|---|
| `maxProjects`, `maxDiagramsPerTypePerProject`, `maxArchimateDiagramsTotal` | Enforced on the main create route only. **Bypassed** by project clone, backup/org-backup restore, example adoption (3 kinds), all import routes, partner worker, md-diagrams, support routes. Diagrams with no project are ungated. |
| `maxBpmn/NonBpmnElementsPerDiagram` | Server: AI + import only. Editor: client-side only (`PUT /api/diagrams/[id]` deliberately unchecked; paste/duplicate/template insert unchecked). **Off-by-one:** server rejects a diagram of exactly N ("20 of 20"), editor allows exactly N. Editor cap ignores comp/grace/org tier. |
| `maxAiAttempts` + reset flag | Enforced on ~20 routes. **Not counted:** simulation assess/business-case/next-steps, `ai/command` (voice assist), audio refine-transcript, export-prompt, epc apply-layout. Applies even with the user's own API key. |
| `maxIndividualExports/Imports`, `maxBulkExports/Imports` | Visio (and 3 import formats) only. PDF/PNG/SVG/JSON/XML/bundle/template exports and JSON/project-restore/DDL imports are ungated though labelled "Individual diagram exports". |
| `trialDays` | Only blocks gated create/AI/export/import. Editing, saving, sharing and the feature matrix ignore expiry. |
| `hasSimulator/ProcessMining/RiskControl/Apqc` | **Stored, drives dashboard tiles only; never read by any server gate.** |
| `hasCollaboration`, org `allowCollaboration` | **Stored but never read anywhere.** |
| Org `allowAi/VoiceAi/SharePoint/SupportDiagram/requireSso` | Enforced. `allowExternalExport` enforced only on SharePoint upload. |
| Org `subscriptionLevelId` (Enterprise org) | Applied to features only; **numeric limits, usage chip and element cap ignore it** — an Enterprise-org member on Free still hits Free limits. |
| Simulator/APQC after a downgrade | Existing studies/frameworks keep working; org PCF routes ungated. |
| `PATCH /api/me/subscription` | **No guard** — any user can post `{tierId:"free"}` to restart the 30-day trial indefinitely, or downgrade locally while Stripe keeps billing. |

### 5. Public summaries and full feature list

There is **no link at all** between the matrix/limits and what the public pages say.
- `/features` is free-text `Feature` rows (draft/publish) with no feature key and no level relation.
- `/pricing` reads only name and price from the DB; everything else is a hard-coded `TIER_COPY` (5 tier ids) and FAQ. It never mentions Simulator, Mining, Risk & Control, SharePoint or Voice — the very things the matrix gates. Limits ("5 projects", "5 AI attempts") are typed text and will go stale. A new tier gets an empty list.
- "30-day free trial" is hard-coded in five places while `trialDays` is editable. The FAQ's mining claim is already stale.
- All these pages are already `force-dynamic`, so a live-read approach needs no cache invalidation today.
- `TierPicker` (signup) already renders live limits and can be extracted into a shared formatter.

### 6. SuperAdmin testing of limits and availability

| Tool | Exercises the real server gates? |
|---|---|
| View-mode tier switcher | **No — cosmetic.** A hard-coded 4-boolean table (`VIEW_MODE_ENTITLEMENTS`) that never reads the matrix and drifts from it. No "free" mode. Server ignores it except for org policy. |
| Impersonation | UI shows the target's tier; **every API gate evaluates as the SuperAdmin** (all-available, all limits bypassed). |
| Per-user feature overrides | Real, but only for a second real account; ignored on a SuperAdmin's own account. |
| Comp tier | Real for a second account; excludes Enterprise. |
| Org subscription | Features yes, limits no. |
| Per-user limit overrides / set a counter | **Do not exist.** |

Missing to test everything: an "act as level X" mode honoured by the server; a way to set usage counters; the three feature states (available / disabled / hidden) are conflated into booleans in most UI, so `disabled` (greyed, selectable in editor) cannot be exercised.

### 7. What users are told

- **Good:** usage popover (counts, red rows, trial days left, real upgrade buttons); AI panel shows the server reason; org-policy messages are clear; dashboard trial chip.
- **Weak:** the standard limit message ("Projects limit reached on the Free tier (1 of 1)") names the tier but offers **no upgrade path and never says when a monthly limit resets or that a limit is lifetime**. Three different wordings for the element cap. `gateFeature`'s 403 doesn't say *which tier* has the feature and doesn't distinguish disabled from hidden.
- **Silent or raw:** project-create over limit returns silently; diagram-create shows only "Failed to create diagram"; copy-diagram silent; Visio export shows a failed download or raw JSON page; import failures `alert()` the raw JSON; DDL import logs `Failed … 403`; SharePoint export shows "Visio export failed". No client code branches on the `metric` field.
- **Completely absent:** nearing-a-limit (e.g. 80%) warnings; trial-ending warning; **payment failed** (`past_due` stored, never shown); cancellation-grace/downgrade warning; comp-expiry notice; any billing email. `requireSso` failures look like a wrong password. Dictation leaks the config key name `allowVoiceAi` to non-admins.

### 8. Reliability of gates and messaging

- **Fail-open vs fail-closed is inconsistent.** A missing matrix row = *available* (server and admin GET), while the DB column default is *hidden*, an unknown key on the server or client is *blocked/hidden*, and a client fetch failure caches "everything hidden" for the whole tab session. A **typo in a `gateFeature` call locks a feature for everyone except SuperAdmin**; a newly added registry key is *open to everyone* until someone seeds it.
- **Staleness:** client state cached per tab and never refreshed after an upgrade, comp grant or admin edit; a failed fetch is cached permanently; `_orders` (level sort orders) is a never-invalidated module cache.
- **Cost/structure:** each `gateFeature` does ~4 queries and double-gated routes repeat them; a dynamic `import()` exists solely to dodge a cycle; two independent "effective level" implementations exist (one org-aware, one not).
- **SuperAdmin bypass in three places** (features, limits, speech) with inconsistent email-case handling — a mixed-case admin email bypasses features but not limits.
- **Tests:** registry/seed shape and one legacy pure function are covered; a source-shape guard exists for mining routes only. **Not covered:** resolution precedence (SuperAdmin/comp/grace/org/override), fail-open, `/api/features`, UI-vs-server parity, simulation/PCF/risk route guards, any e2e tier test.

## 2. The plan

Guiding principles: (a) **the registry is the map** — every feature declares what enforces it, and a test fails if a key is declared but not enforced; (b) **one resolver** for "effective level" used by every gate, limit, snapshot and the client; (c) **states stay three** (available / disabled / hidden) all the way to the UI; (d) **messages come from one builder**; (e) each slice is independently shippable, and behaviour-changing gates ship **inert first** (the matrix already fails open, so wiring a gate changes nothing until you restrict a cell).

### Phase A — Foundations (do first; everything else depends on it)
1. **One effective-level resolver** (`app/lib/features/effective.ts`, a leaf module — removes the dynamic-import cycle). Inputs: user, acting-as override (below). Output: `{levelId, source: own|org|comp|grace, isBypass}`. Used by `getFeatureStates`, `checkLimit`, `getUsageSnapshot`, `elementCountLimitFor`, `/api/features`, `speechAccess`. Makes org-tier limits and comp/grace apply to the editor cap and usage chip too. Fix the case-sensitive admin-email check.
2. **Retire the legacy `has*` flags:** dashboard/project/org tiles read the matrix (via `useFeatureStates`), `entitlementsForLevel` becomes matrix-derived, the Subscriptions editor's feature checkboxes are removed (or become a read-only link to Feature Availability). Migrate `hasCollaboration`/`allowCollaboration` (unused) into the matrix key `co-authoring`/`collaboration-groups` or delete.
3. **Client hygiene:** `useFeatureStates` refetches on focus and after upgrade/comp/impersonation, never caches a failure, exposes `refresh()`. Replace `simAllowed`/`rcAllowed` and `atLeastTier(...)` hacks with `useFeatureState`.
4. **Fail policy decision** (see decisions): recommended — keep fail-open for *missing matrix rows on existing keys* (backward compatible) but make a **registry test require a seed row for every key/level**, make unknown-key calls throw in dev/test (not silently lock out), and never cache a fetch failure.
5. Cache: memoise `levelOrders` with invalidation on subscription-level edit; collapse the four per-gate queries into one cached-per-request resolution.

### Phase B — Make the registry *the* gate map (your item 2)
1. Extend `FeatureDef` in `registry.ts` with `description`, `enforcedBy: ("registry"|"limit"|"policy")[]`, `gates: {ui: string[], server: string[]}`, and `status: "wired"|"partial"|"unwired"`.
2. **Feature Availability editor** shows, per row: description, enforcement badge (wired / partial / not enforced yet), and an expandable "where this is enforced" list (UI entry points and API routes). A "Not enforced" filter makes the 23 gaps visible. A per-level **"effective preview"** column set shows what each level really gets.
3. **Guard test** (style of `tests/mining/route-gating.test.ts`): every registry key with `status: "wired"` must have its listed route(s) call `gateFeature(key)` and its UI use `useFeatureState/FeatureGate(key)`; every declared `gateFeature("x")` string must be a registry key (kills typo lock-outs); any key marked `unwired` is listed in a ratchet that can only shrink.
4. **Wire the 23 unwired keys**, mostly by adding a matrix check *next to the gate that already exists*:
   - AI generate keys → the AI routes that already `gateLimit("aiAttempts")` + `gateOrgPolicy("allowAi")` (typed/image/dictated/audio/refine/record each at its route); UI hides/greys the corresponding panel tab.
   - `visio-*` four keys → the routes already calling `gateLimit(individual/bulk Imports/Exports)`; UI menu items via `FeatureGate`.
   - `sharepoint` → existing `gateOrgPolicy("allowSharePoint")` routes + menu; `sop-generation` → sop routes; `diff-processes` → diff route; `bpmn-templates` → template window/route; `nl-assist` → deprecate or alias to `voice-assist`; `mobile` → `/m` layout; `sharing`/`collaboration-groups`/`co-authoring`/`process-review` → share, group, collab-token and review routes/UI; `process-portal`, `choice-of-llms`, `local-llm` → their entry points; `soc2` → informational (mark `status: "informational"` so it is not counted as a gap).
   - Fix piggy-backers: `simulator-examples`, `process-mining-examples` (adopt), `risk-control-examples` read their own keys.

### Phase B+ — Mobile Access as a real Feature, dependent on Process Review AND Voice Assist (added at your request)

**Where it stands.** `mobile` ("Mobile Diagramatix", category Platform) is already a registry key, but it is one of the 23 unwired ones: nothing in `/m` or its APIs checks it (only `voice-assist` is read there), so today every signed-in user, including Free, can use the phone app. The seed has it Expert + Enterprise only.

**Initial matrix (your instruction, with the Process Review answer applied):**

| Feature | Free | Introductory | Professional | Expert | Enterprise |
|---|---|---|---|---|---|
| `mobile` (Mobile Access) | Not Available | Available | Available | Available | Available |
| `process-review` (prerequisite) | Not Available | **Available (was Not Available)** | **Available (was Not Available)** | Available | Available |
| `voice-assist` (prerequisite) | Not Available | **Available (was Not Available)** | **Available (was Not Available)** | Available | Available |

Delivered as one idempotent SQL file for the in-app Database tile (`INSERT … ON CONFLICT` on `FeatureAvailability`, proven on `diagramatix_test` first), plus the same change in `feature-availability.seed.json` so a fresh install matches. Two knock-ons you should know about:
- Widening **Process Review** to Introductory and Professional is a real entitlement change once Review is wired (Phase B.4); it is what makes Mobile's core job (reviewing on a phone) work there.
- Widening **Voice Assist** to Introductory and Professional is a real and *live* change: `voice-assist` is already enforced (`ai/command` route, editor, phone), so those users get the feature immediately, including its Deepgram/AI cost, and the desktop Voice Assist bar appears for them too (not only on the phone). Before the SQL runs, check their AI-attempt caps (Introductory 50/month, Professional 100/month) are acceptable for voice traffic, and that `ai/command` is brought under `aiAttempts` accounting (it is currently uncounted — Phase D). `voice-feedback` (spoken replies) stays as it is (fail-closed, own override).

**Feature dependencies (new, general mechanism — not just for Mobile).**
1. `FeatureDef` gains `requires?: FeatureKey[]` (Mobile: `["process-review", "voice-assist"]`). Registry test: keys exist, no cycles.
2. **Effective state = the weaker of the feature's own state and every prerequisite's** (order: available > disabled > hidden). Implemented once in the Phase A resolver, so `getFeatureStates`, `gateFeature`, `/api/features`, the public matrix and the act-as-level preview all agree. A per-user override on a prerequisite flows through.
3. **Feature Availability editor:** a "Requires: Process Review, Voice Assist" chip on the Mobile row; if a level's own cell is more permissive than any prerequisite, the cell shows an amber "effectively Not Available — needs Voice Assist" (naming the blocking prerequisite) and the Save confirms; the test panel (Phase F.3) shows both the own state and the effective state.
4. **Public pages:** the comparison matrix shows the *effective* state, and the Mobile row's note reads "Requires Process Review and Voice Assist".
5. Messages: a dependency block says so — "Mobile Access needs Voice Assist, which isn't included in your plan — Upgrade" (Phase G builder gets a `blockedBy` field naming the first missing prerequisite).

**Wiring Mobile (what "Mobile Access" gates):**
- **Server:** the `/m` route-group layout resolves the feature state server-side; not available → redirect to a small "Mobile isn't included in your plan" page (with Upgrade CTA), `disabled` → same page in greyed form. Any mobile-only API routes gate `gateFeature("mobile")`; shared APIs (diagram GET, review comments) are *not* gated by `mobile` because desktop uses them.
- **Layered keys on the phone:** because Mobile requires both, the effective Mobile state already implies Review and Voice Assist; the phone reviewer and the 🎤 voice editor still check `process-review` / `voice-assist` individually (defence in depth, and so a per-user override on either takes effect). With the initial matrix a Free user has no phone access at all; every paid level has viewer + reviewer + voice editor.
- **Desktop entry points:** wherever the app offers "open on your phone" (QR/link/menu) is hidden when Mobile is not effectively available.
- **Tests:** source-shape guard that the `/m` layout calls the resolver; resolver tests for dependency (own available + Review hidden ⇒ effective hidden; override on Review flows through); a phone-editor test that Free sees the upsell page.

### Phase C — Separate Simulation & Process Mining from the full feature set (item 3)
Interpretation (please confirm — Decision 1): **module access** = "can open the module and do the basics"; **full features** = the advanced capabilities, each separately grantable per level.
1. Keep `simulator` and `processMining` as **module access** keys (no migration; current matrix rows unchanged).
2. Add sub-keys, seeded to **match today's behaviour** (so nothing changes until you edit the grid): Simulator — `simulator-compare`, `simulator-analysis` (sensitivity, sweep, business case, AI assess/next-steps), `simulator-bpsim`, `simulator-calendars`, `simulator-teams`. Mining — `processMining-conformance`, `processMining-sources` (live connectors), `processMining-alerts`, `processMining-twin` (validate/calibrate), `processMining-ai`, `processMining-export`; keep `task-mining`, `process-mining-ocel`.
3. **Gate all simulation routes** (currently ~30 ungated) via a `simulationRoute` helper modelled on `riskControls/routeAuth.ts` (note: `guardProjectRoute` only applies the feature to mutating calls — reads need an explicit gate). Add `aiAttempts` accounting to `assess`, `business-case`, `next-steps`. Add a **`tests/simulation/route-gating.test.ts`** copy of the mining guard.
4. Existing studies after a downgrade: define behaviour (Decision 2) — recommended: read-only view allowed, run/sweep/AI blocked with a clear message.
5. Editor/UI: Simulator and Mining entry points and each sub-panel use their key with `disable` vs `hide` per the matrix state.

### Phase D — Complete the limits (item 4)
1. **Close creation bypasses:** one shared `gateProjectCreate` / `gateDiagramCreate` used by clone, backup and org restore, example adoption (all 3), all import routes, partner worker, md-diagrams, support; decide policy for diagrams with no project (Decision 3).
2. **Element cap:** fix the off-by-one (one shared `withinElementLimit(count, limit)` used by server and editor); make the cap server-side on `PUT /api/diagrams/[id]` (recommended: **soft** — reject only saves that *add* elements beyond the cap, so an existing over-cap diagram stays editable/deletable), and gate paste, duplicate, template insert and subprocess expansion in the editor through `addElementGated`.
3. **Export/import limits:** rename metrics to what they cover, or extend coverage to PDF/PNG/SVG/JSON/XML/bundle/template and JSON/DDL/project-restore (Decision 4).
4. **`PATCH /api/me/subscription`:** guard it — no self-downgrade for paying users, no re-stamping `subscriptionAssignedAt` (stops trial restarts); Stripe portal is the path for changes.
5. **Trial expiry:** decide scope (Decision 5) — recommended: expired trials become read-only-plus-export (no create/save-new/AI), matrix features fall to the Free row.
6. **Usage snapshot:** compute the element-cap row with the same function the enforcer uses, without loading every diagram's data (cache max-elements on the diagram row).
7. Org-level `subscriptionLevelId` flows through the resolver (Phase A) so Enterprise-org members get Enterprise numeric limits.

### Phase E — Public summaries and full features list update dynamically (item 5)
1. Server helper `getPublicMatrix()` = levels + `FeatureAvailability` (fail-open gap fill) + limits, grouped by registry category, with per-feature `publicLabel`/`publicBlurb` added to the registry.
2. `/pricing`: per-level **feature summary** and a **full comparison matrix** (rows = features by category, columns = levels; ✓ / "add-on"/greyed for `disabled` / — for `hidden`), and **limit bullets generated** from `SubscriptionLevel` (null = Unlimited; "per month" vs "in total" from the reset flags; trial from `trialDays`). Delete `TIER_COPY`; tiers added later appear automatically.
3. `/features`: add optional `featureKey` to the `Feature` catalog so each card shows "Available on: Expert, Enterprise" from the matrix; cards for keys hidden on *all* levels are auto-suppressed. Marketing copy stays draft/publish; availability chips are live.
4. Replace the five hard-coded "30-day free trial" strings and the stale mining FAQ line with values read from data.
5. Because pages are `force-dynamic`, edits show immediately; if ISR is added later, call `revalidatePath` from the availability, subscriptions and publish handlers.
6. Guard test: parity between the seed matrix and a rendered matrix snapshot, and a test that fails if `/pricing` contains a hard-coded limit number.

### Phase F — SuperAdmin can test every limit and state (item 6)
1. **Act-as-level, server-honoured.** The existing view-mode cookie becomes a verified SuperAdmin-only "act as level X" (any real `SubscriptionLevel`, including Free and Enterprise; SuperAdmin verified on every read). The resolver (Phase A) applies it to features, limits, snapshot, element cap and `/api/features`, **turning the SuperAdmin bypass off while acting**, so the previewed level truly gates. A banner shows "Acting as Introductory (limits enforced)".
2. **Usage-counter tools** in the user usage popover: set/reset a metric counter, set trial day, so hitting a limit takes seconds. Plus optional **per-user limit overrides** (`User.limitOverrides Json`) beside `featureOverrides`.
3. **Test matrix panel** in Feature Availability: pick a level (or "as user") and see, for every feature, the resolved state and the actual server verdict from a dry-run `/api/admin/feature-availability/probe?level=…` that calls the same resolver; for every limit, current/limit and what the next action would return.
4. Override panel supports all three states and the comp/enterprise levels; comp dropdown includes Enterprise.
5. Retire `VIEW_MODE_ENTITLEMENTS` (data-driven now).

### Phase G — Warnings and messages (item 7)
1. **One message builder** (`app/lib/subscription/messages.ts`) producing `{title, detail, upgradeCta, requiredTier, resetsOn}` for: limit reached (says lifetime vs monthly and the reset date), feature disabled (visible, greyed, "Available on Expert — Upgrade"), feature hidden (nothing shown), trial expired, org-policy block (no config key names to non-admins), element cap (one wording).
2. API returns the structured object; a shared client `handleGateResponse(res)` turns 403s into a modal/toast with an **Upgrade** button (self-serve tiers) instead of silence, raw JSON or "Failed to create …". Fix each silent site: project create, diagram create, copy diagram, DDL import, SharePoint export, Visio export (fetch then download so errors show), Visio/BPMN import alerts.
3. **New proactive notices:** 80% and 100% of any count/AI limit (banner + popover), trial ends in 7/3/1 days, payment failed (`past_due`) banner with "Update payment", cancellation grace countdown and downgrade notice, comp-expiry notice (with email for billing states). `requireSso` gets its own login message.
4. `disabled` features show a lock with tooltip and upgrade path; `hidden` never appear (consistent via `FeatureGate`).
5. Guard tests: every `gateLimit`/`gateFeature` response carries the structured fields; a lint-style test forbids `if (!res.ok) return;` in create flows.

### Phase H — Reliability (item 8)
1. DB-backed precedence tests: SuperAdmin, acting-as, comp, grace, org max, per-user override, missing rows, invalid state, unknown key.
2. Route-gating source-shape guards for simulation, PCF, risk-control reads and every registry key (Phase B/C).
3. UI-vs-server parity test (client-visible state == server verdict for every key × level from the seed).
4. `/api/features` tests (unauthenticated, error, override); client cache/refresh test.
5. One Playwright spec: log in as a seeded Free user, hit each limit and a hidden/disabled feature, assert the message and upgrade CTA.
6. Reconcile doc drift (`subscription-route.ts` header, 402/403 comments) and add a "Feature Availability guide" page section describing states and precedence.

## 3. Suggested order and size

| # | Slice | Depends on | Size | Risk |
|---|---|---|---|---|
| 1 | Phase A (resolver, retire `has*`, client hygiene) | — | L | Medium — touches every gate; ship with precedence tests |
| 2 | Phase F.1–F.2 (act-as level, counter tools) | 1 | M | Low — makes everything after it testable |
| 3 | Phase B.1–B.3 (registry metadata, editor map, guard tests) + dependency mechanism (`requires`) | 1 | M | Low |
| 3b | Phase B+ (Mobile Access feature + Process Review prerequisite, seed SQL, `/m` gate, upsell page) | 1, 3 | M | Medium — Free users lose phone access; ship with the upsell page and tell existing Free users |
| 4 | Phase C (Sim/Mining split, simulation route gates) | 1, 3 | L | Medium — behaviour change on simulation, ships inert |
| 5 | Phase G (message builder + silent-failure fixes + new warnings) | 1 | L | Low |
| 6 | Phase B.4 (wire the 23 keys, in batches by group) | 3 | L | Low (inert until cells restricted) |
| 7 | Phase D (limits bypass, element cap, me/subscription guard) | 1 | L | Medium |
| 8 | Phase E (dynamic public pages) | 1, 3 | M | Low |
| 9 | Phase F.3–F.5, Phase H (probe panel, remaining tests, e2e) | all | M | Low |

Every slice: typecheck + full suite, `TESTS_SUMMARY.md` rows, prod SQL only as idempotent files for the in-app Database tile (registry additions need a seed SQL for new keys × 5 levels so production behaviour is unchanged on deploy).

## 4. Decisions needed from Paul

1. **Item 3 meaning:** confirm "module access" (open the module, basics) vs "full features" (advanced sub-capabilities as separate keys), and which sub-capabilities you want separable at launch (my list is above).
2. **Downgrade behaviour** for existing simulator studies / APQC frameworks / mining runs: read-only view, or hidden entirely?
3. **Diagrams outside a project:** count them against a limit, or forbid creating them on limited tiers?
4. **Export/import limits:** narrow the metric names to "Visio" (matches reality) or extend limits to every export/import format?
5. **Trial expiry scope:** create/AI/export only (today) or read-only-plus-export across the app?
6. **Fail policy:** keep fail-open for missing matrix rows (recommended, plus a seed-completeness test), or switch to fail-closed (safer, but needs the seed to be complete on prod first)?
7. **Self-serve tier changes:** allow only upgrades via Stripe, and route all downgrades through the Stripe portal?
8. **Collaboration flags:** `hasCollaboration` / `allowCollaboration` are dead — delete, or wire to the `co-authoring` matrix key?
9. **Already decided (Mobile):** Mobile Access is Available on Introductory, Professional, Expert and Enterprise and Not Available on Free; it requires Process Review **and** Voice Assist, so both are widened to Introductory and Professional as well. Still open: (a) any existing Free users who use `/m` today will lose access when it is wired — notice period or grace message first? (b) Voice Assist on Introductory/Professional carries AI/Deepgram cost — are the current 50/100 monthly AI-attempt caps right for it, and should voice commands count against them (recommended, Phase D)?

## 5. Verification (end to end, once built)

- Registry guard tests pass: every declared key is enforced or explicitly `unwired`/`informational`; no `gateFeature` string outside the registry.
- As a SuperAdmin acting as Free, Introductory, Professional, Expert and Enterprise: dashboard tiles, editor buttons, `/api/features`, `/api/usage` and each gated API return the state the grid says for every key; hitting each numeric limit (using the counter tools) shows the structured message with the correct tier, reset date and Upgrade button.
- Edit a cell in Feature Availability and a limit in Subscription Prices; reload `/pricing` and `/features` — comparison matrix, limit bullets and per-card availability chips reflect the change with no deploy.
- Mobile: as Free, `/m` shows the upsell page and no phone entry points appear on the desktop; as Introductory/Professional it opens with viewer, reviewer and the 🎤 voice editor; set either Process Review or Voice Assist to Not Available for a level and Mobile becomes effectively unavailable there, with the grid naming the blocking prerequisite.
- A restricted Simulator level: module opens, advanced panels are greyed with an upgrade tooltip, and every `/api/projects/[id]/simulation*` route returns the structured 403 (guard test).
- Force each billing state (trial ending, payment failed, grace, comp expiry) on a test user and see the matching banner.
- Full vitest suite and typecheck green; no silent `if (!res.ok) return;` remains in create flows.

## 6. Where this file goes

On approval I will save this plan as `diagramatix/new features/feature-availability-and-limits-plan-2026-09-30.md` (add the `.gitignore` allow-list lines used for the other new-features documents), commit and push it — documentation only, no code changes.

## 7. Addendum (Paul, 2026-09-30) — per-user settings, limits and features, with revert (slice 10)

**The requirement.** A SuperAdmin must be able to change the **settings, limits and feature availability of any individual user** *without changing the subscription level that user is on* (so nobody else on that plan is affected), and to **revert** that user to exactly what their level gives.

### What exists today
- **Features:** `User.featureOverrides` (a map of feature → Available / Disabled / Not Available) with a per-user panel (Registered Users ▸ Features) and `PUT /api/admin/users/[id]/features` that replaces the whole map. It is applied by the resolver after the level's row and before prerequisites, so this half is built — but it has no "plan value" shown beside the override and no per-row revert.
- **The free subscription upgrade (comp grant) — stays exactly as it is.** A SuperAdmin can already grant a user a higher tier for a set number of days (Registered Users ▸ usage popover ▸ Grant comp / Revoke comp). **This addendum is IN ADDITION to that, not a replacement:** a comp swaps a person onto another whole plan for a while; the per-user overrides below change individual features, limits and settings on whatever plan applies. The two combine (an override is kept on top of a comp), and Revoke comp and Revert-to-plan are separate buttons that each do only their own job.
- **Limits and settings:** nothing per user. Limits come only from the `SubscriptionLevel` row. A comp grant swaps the whole level for a while; it cannot change one number.

### What to build
1. **Storage.** `User.limitOverrides` (`Json`, default `{}` — written through raw `pgPool` SQL per the Prisma 7 rule), keyed by the `SubscriptionLevel` field names: every numeric limit (`maxProjects`, `maxDiagramsPerTypePerProject`, `maxArchimateDiagramsTotal`, the two element caps, `maxAiAttempts`, the four export/import caps, the two bulk caps), the reset settings (`aiAttemptsResetMonthly`, `individualExportsResetMonthly`, `individualImportsResetMonthly`) and `trialDays`. **A key present is an override; `null` means unlimited; an absent key means "use the plan".** Plus `overrideNote` (why — required when saving) and an optional `overridesExpireAt` (lazy auto-revert, like a comp).
2. **One merge, one place.** A pure `effectiveLimits(levelRow, overrides)` in `features/effectiveLevel.ts`'s neighbourhood, applied where `loadUserWithTier` builds the user's effective level — so `checkLimit`, `getUsageSnapshot`, `elementCountLimitFor` (the editor's cap), the warnings strip and the limit messages all see the customised numbers with no other change. Overrides sit **on top of whichever level applies** (own, organisation or comp), so a comp or an organisation upgrade does not silently discard them.
3. **Acting as a level ignores overrides** (the SuperAdmin previewing "Free" sees Free as Free, not their own customisation) — pinned by a test.
4. **API.** `GET /api/admin/users/[id]/overrides` → `{ level: <plan values>, features: { plan, override, effective }, limits: { plan, override, effective }, note, expiresAt }`; `PUT` sets/changes selected keys (features and limits together, one audit line); `PUT { revert: [ "maxProjects", "sharing", … ] }` reverts named keys; `DELETE` **reverts everything** (features, limits, trial, note) to the level. SuperAdmin only, `blockReadOnlyImpersonation`, each change written to the audit log with who / what / old → new / note.
5. **UI (Registered Users ▸ a "Customise" panel that replaces the Features button).** Three sections — **Limits & settings**, **Features**, **Trial** — each row showing *Plan value · Override (input) · In effect* with a **Revert** button per row, a **Revert all to plan** button at the bottom (confirm dialog, not a browser one), the note field, and the optional expiry date. A row that differs from its plan is marked "custom"; the user's row in the Registered Users table gets a small "custom" badge so support can see who has been customised.
6. **What the customer sees.** The usage popover and the limit message use the effective number; the popover adds "Some allowances on your account were set by support" when any override is active. Public pages are unaffected (they show plans, not people).
7. **Backups.** `limitOverrides`, `overrideNote` and `overridesExpireAt` are added to the user backup / restore (the backup-coverage test will demand it).
8. **Tests.** Merge (absent / value / `null`); `checkLimit` with an override above and below the plan; the editor cap; the snapshot showing plan vs effective; revert-one and revert-all restore plan values exactly; override survives a comp or an organisation upgrade; acting-as ignores it; expiry reverts; the API is SuperAdmin-only, guarded against read-only impersonation and audited; the panel shows plan / override / effective and the revert controls.

### Decisions for Paul
- **Note required on every change?** (recommended — it is the audit trail for "why does this user have 200 projects".)
- **Expiry date:** offer it (recommended, defaults to none) or keep overrides until reverted?
- **Should an override survive a plan change** (upgrade / downgrade via Stripe), or reset when the person changes level? (recommended: survive — support set it deliberately; the panel shows it.)

### Order and size
Slice 10, after slice 9: **M–L**, low risk — the resolver and the merge point already exist, and the feature half is built. It needs a small schema addition (`db push` applies it on deploy) and no prod SQL.
