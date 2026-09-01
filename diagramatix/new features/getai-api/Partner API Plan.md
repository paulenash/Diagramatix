# Partner API — process description / SOP in, BPMN out

**Version 2 · 1 September 2026**

## What changed in v2

The review of 2026-09-01 changed nine things. They are folded into the sections
below; this is the summary, and the reasoning for each sits where it belongs.

| # | Change | Why |
|---|---|---|
| 1 | **JSON is a first-class artifact** beside BPMN XML | Boroon asked for JSON over a PDF ("it'll work better if it's a JSON"); both ship in phase 1 |
| 2 | **BPMN XML is the recommended basis for their scoring** | It is an international standard, so their scoring carries no dependence on our document shape |
| 3 | **The PDF steps back** from headline deliverable to one option among several | It was always the hardest part to make good; the call moved past it |
| 4 | **Volumetrics leave phase 1** | "That math will be done in our application." The section and the code REMAIN — dormant, not deleted |
| 5 | **Completion callback offered beside polling** | Boroon asked whether we could push; polling stays the default |
| 6 | **Timings returned to the caller, not just logged** | So GETAI can build the expectation their spinner needs. We still cannot predict a run |
| 7 | **`instructions` on the request, and standing instructions per key** | Boroon wants "keep it high level" to reach the model |
| 8 | **A "what is dependable" section** in the external doc | Shapes their free-tier offer: structure is safe unattended, the rendering wants a human |
| 11 | **Limits are provisional and soft for phase 1** | "You can't have a customer hit the day's limit" — monitored and settled commercially |
| 12 | **Everything is stored during a testing phase** | Paul, 2026-09-01: diagnosing from a fingerprint wastes both sides' time |

Also corrected: the model in use on the partner path is **Opus 5**, not Haiku —
`ai.generate.model` on prod is set to Opus 5 (Paul, 2026-09-01). Anywhere this
plan said otherwise was stale.

Items 9, 10 and 14–16 from the review list (inferred team names, human-in-the-loop
as a design position, licensing, multi-pass questions, simulation) were considered
and deliberately left out of this revision.

---

## Context

Boroon Mahanta (GETAI) has built an **AI-readiness assessment** tool. His user
uploads a description of a business process — or a document: an SOP, a PDF, an
image of a process — plus volumetrics (minutes per run, runs per month). He scores
it across six dimensions and returns a readiness position: *fix the process first*
/ *augment with AI* / *automate with oversight*, each with a call to action.

The mapping step is mocked. His ask, on the call of 2026-08-28:

> *"I want to be able to use a small language model and your Diagramatix tool to do
> the business process mapping, which then feeds into this assessment."*

So: an API his backend can call with a description and/or a document, that returns
**pools and lanes**, **an ordered list of activities**, and **a PDF of the generated
BPMN diagram**.

Two things from the call shape the design beyond the bare ask. First, one of his
calls-to-action is *"let us help you fix the process"* — so the generated diagram
should **land in Diagramatix as a real Project someone can open**, not evaporate.
That is the commercial point of the integration. Second, he collects effort and
frequency; those map directly onto the existing simulator, so a partner-created
diagram can arrive **runnable**.

**Almost all of this already exists.** The generation pipeline handles PDF, text and
image attachments today; `extractSkeleton` already produces an ordered activity list
deterministically; a pure server-side SVG renderer already ships; and LibreOffice is
already in the Docker image. The genuinely new work is an API key, an async job, and
about 150 lines of glue.

### Decisions taken (Paul, 2026-08-29 / 30)

| | |
|---|---|
| **Persist** | Creates a real Project + Diagram in a nominated org, returns id + deep link |
| **Async** | POST → 202 + job id; caller polls. New `PartnerJob` table |
| **PDF** | Existing simplified server renderer. **No Chromium, no new deps** |
| **Keys** | One partner key for GETAI → one org + one service user. Table built general enough for per-org keys later |
| **Harness** | A SuperAdmin tile that submits what Boroon submits and displays what comes back, calling the real API through a server-side proxy |
| **Harness target** | One reusable "API Harness" project + a Clear button |
| **Round trip** | Feed one of our own SOPs back in and diff against its source diagram |
| **Case library** | Every harness input saved as a re-runnable `HarnessCase`, with run history, two-run comparison, and export/import |
| **Phases** | `ApiKey.phase` = internal / testing / live drives retention; go-live purges the testing data |

---

## What we reuse (do not reinvent)

| Need | Already there |
|---|---|
| Key crypto | `app/lib/mining/sourceAuth.ts` — `mintIngestKey()` (`dgxk_<64hex>`, SHA-256 stored), `verifyIngestKey()` (constant-time), `readIngestKey()` (`X-Api-Key` or `Bearer`) |
| Org scoping | `app/lib/auth/orgContext.ts` — takes a **structural** `SessionLike` + cookie store, not NextAuth types |
| Text/PDF/image → BPMN | `planBpmn({apiKey, prompt, attachment, rules, model})` — PDF goes as a native Anthropic document block |
| Layout | `layoutBpmnDiagram(elements, connections, {onDiagnostic})` |
| Rules | `loadAiRulesForType("bpmn")` |
| **Ordered activities** | `extractSkeleton(data, {scope:"whole"})` → `SopSkeleton.steps[]` with `globalNo`, `label`, `role`, `systems`, `inputs`, `outputs`, `decision`, `handoffIn/Out`. Deterministic, no AI |
| SVG | `renderTemplateThumbnailSvg(data, {trueColors:true, fullLabels:true})` — pure string, already called from Node routes |
| PDF | `app/lib/documents/docxToPdf.ts` — the exact template for `svgToPdf`; `soffice` already in `Dockerfile:80` |
| BPMN XML | `buildBpmnXml(data, name)` — pure, isomorphic |
| Metering | `gateLimit(userId,"aiAttempts")`, `gateElementCount`, `recordUsage`, `enterAiContext` |
| DOCX text | `mammoth` already a dependency (used only for preview today) |
| Harness: PDF / SVG / JSON display | `app/components/preview/FilePreviewDialog.tsx` — `kind:"pdf"` from a Blob, `"svg"`, `"json"` via the dependency-free `highlightJson` |
| Harness: streaming + progress + diagnostics panel | `MdDiagramsClient.tsx` — near drop-in |
| Harness: SOP picker | `app/components/sop/ProjectSopsSection.tsx`, `GET /api/projects/:id/sop` |
| Harness: file → base64 | `arrayBufferToBase64` (`app/lib/base64.ts`); `handleFileAttach` needs extracting — see below |

**The model on the partner path is `claude-opus-5`** — that is what `ai.generate.model`
is set to on prod (Paul, 2026-09-01). An earlier draft of this plan said Haiku, on the
reasoning that Boroon had asked for "a small language model"; the setting in production
is what actually runs, and this is now stated to him as Opus 5. The caller still cannot
choose a model: `model` in a request body is a 400, so a partner can never drive us
onto a costlier one.

---

## Design

### 1. The Prisma models

`ApiKey` — `keyHash @unique` (exact-hash lookup, never prefix-then-compare), `keyPrefix`
for display, `orgId`, `serviceUserId`, `scopes Json`, optional `projectId`,
`rateLimitPerMin`, `dailyJobLimit` (**default 50**), `phase` (`internal|testing|live`,
default `live`), `captureUntil` (required when `testing`), `revokedAt`, `expiresAt`,
`lastUsedAt`/`lastUsedIp`/`useCount`.

`PartnerJob` — `apiKeyId`, `orgId`, `userId`, `status` (`queued|running|succeeded|failed`),
`stage`, `request Json` (**redacted**: sizes + SHA-256 only, never bytes or prose),
`result Json`, `error Json`, `projectId`, `diagramId`, `pdfBytes Bytes?`, `svg String?`,
`inputDocument Bytes?` + `inputDocumentName` + `inputDocumentType` (a real partner run
only, `testing` phase only — a harness run keeps its bytes on the case instead),
`harnessCaseId` (nullable — the case a harness run replayed),
`model`, `attempts`, `startedAt`/`finishedAt`, `idempotencyKey`,
`@@unique([apiKeyId, idempotencyKey])`.

**Prisma 7:** every `Json` write goes through raw SQL via `pgPool` (`app/lib/db.ts`) —
Prisma 7 omits JSON fields from update inputs. `Bytes` writes fine through Prisma.
`npx prisma db push`, no migration; Azure deploy applies it.

`HarnessCase` — the SuperAdmin test corpus. Persists indefinitely, deliberately outside
the retention rules that govern a customer document. Full shape under **The case
library**.

**A reaper** runs lazily at the top of POST and GET: any `running` job older than 10
minutes becomes `failed` with code `worker_lost`. Without it, an Azure container swap
mid-job leaves a caller polling forever.

### 2. Endpoints — `app/api/public/v1/**`

`proxy.ts`'s matcher covers page prefixes only, so `/api/**` self-authenticates; no
middleware change.

| | |
|---|---|
| `GET /whoami` | verify a key in one curl |
| `POST /process-map` | 202 + `{jobId, statusUrl, pollAfterSeconds:5}` |
| `GET /process-map/{id}` | poll |
| `GET /process-map/{id}/artifact/diagram.bpmn` | **BPMN 2.0 XML — the recommended basis for GETAI's scoring (v2/2)** |
| `GET /process-map/{id}/artifact/diagram.json` | **The diagram as Diagramatix JSON (v2/1)** |
| `GET /process-map/{id}/artifact/diagram.pdf` | `.svg` | the rendering; one option among several, no longer the headline (v2/3) |

**Two machine-readable forms, and they are not interchangeable.** The XML is an
OMG standard, so anything GETAI builds on it survives us reshaping our own
documents; the JSON is ours and can move. Boroon settled on scoring from the XML
for exactly that reason, and the external document says so plainly rather than
presenting the two as equals.

**Request** is JSON with base64 (not multipart — `planBpmn`'s `Attachment` already wants
base64, and one contract is callable from any language). 10 MB decoded cap, checked on
`req.text().length` before parsing. `description` and/or `document`; **one document
only** — two is a 400, not a silent drop.

**Success payload** carries `diagram` (id, deep link, counts), `pools[]` (nested lanes/
sublanes), `roles[]`, `activities[]` (`no`, `name`, `pool`, `lane`, `taskType`,
`systems`, `inputs`, `outputs`), `decisions[]`, `handoffs[]`,
`artifacts` (URLs), `warnings[]`, and **`timings`** — `elapsedMs` plus per-stage
milliseconds (v2/6). `volumetrics.derived` is present only when volumetrics were
sent, which phase 1 does not do.

**`timings` exists because Boroon asked for it and because we cannot give him what
he really wants.** He wants to tell his user "about 40 seconds left". The model
gives no estimate, and the same description can take 30 seconds or two minutes, so
there is no honest ETA field — only measured elapsed time, from which his side can
build an expectation out of his own history. Saying that plainly is better than a
number we would be inventing.

**Request** also accepts **`instructions`** (v2/7) — free text appended to the
prompt — and **`callbackUrl`** (v2/5). Standing instructions can be attached to
the key so they apply to every request without being resent; per-request text is
appended after them.

Shaped by **`app/lib/partner/shapeResult.ts`** — never serialise `SopSkeleton` directly.
It is internal and will change; the partner contract must not.

**Error envelope** is `{error:{code,message}, ref}`, deliberately unlike the internal
`{error: string}`. A foreign job is **404, not 403** — no existence oracle.

**Callback (v2/5).** `callbackUrl` on the request gets one `POST` of the finished
result. It is an ADDITION, never a replacement: the job stays pollable, so a hook
that fails to deliver loses nothing. Polling remains the phase-1 mechanism and the
thing we tell Rajeev to build first — the user-visible timing is identical either
way, which is worth saying because the request came from a belief that push is
faster for the user. It is not; it is just fewer requests.

### 3. The auth adapter — `app/lib/partner/auth.ts`

`authenticatePartner(req, scope)` → `PartnerCaller | NextResponse`. The load-bearing
trick is a two-line cookie stub:

```ts
const cookies = { get: (n) => (n === ORG_COOKIE ? { value: row.orgId } : undefined) };
```

**Why it matters.** `getCurrentOrgId` honours `dgx_org` first *but still verifies
membership*, then falls back to **the oldest OrgMember row**
([orgContext.ts:45](../../app/lib/auth/orgContext.ts#L45)).
Without the stub, a service user who ever joins a second org silently starts writing
into the wrong tenant. This is the subtlest hazard in the feature and gets its own test.

The same stub returns `undefined` for `dgx_view_as`, so impersonation is impossible.
`requireRole`, `requireProjectAccess`, `gateLimit` and telemetry then all run unchanged.

**Give the service user `ProcessOwner`, never `Admin`** — `Admin` triggers
`isAdminElevatedForOrg` ([orgContext.ts:250](../../app/lib/auth/orgContext.ts#L250)),
granting silent owner access to *every* project in the org.

Telemetry: call `enterAiContext({...})` as the **first statement of the worker
function** — `enterWith` binds the frame. Do **not** use `resolveAiRouteContext` or
`gateOrgPolicy`; both call `cookies()` from `next/headers`, unavailable off-request.
Read `Org.allowAi` (schema line 104) directly in POST.

### 4. Document handling

- `app/lib/documents/docxToText.ts` — `mammoth.extractRawText`. Closes a real existing
  bug: `.docx` currently falls into a `file.text()` branch, so raw ZIP bytes go to the
  model.
- `app/lib/ai/attachmentFromFile.ts` — the single place any file becomes a `planBpmn`
  `Attachment`. **Sniff magic bytes and prefer them over the declared type**
  (`%PDF-`, `PK\x03\x04`, PNG/JPEG). `.doc` and unknown types → `unsupported_media_type`.
- **One-line gap:** `generateDiagramData` does not accept `attachment`; `planBpmn` does.
  Add it and forward.

### 5. PDF — `app/lib/documents/svgToPdf.ts`

A near-copy of `docxToPdf.ts`: temp dir, per-call `-env:UserInstallation` profile,
`--convert-to pdf:draw_pdf_Export`, 60 s timeout. Cap concurrency at 2 — each call
spawns an office suite on the same instance as everything else.

`app/lib/partner/renderDiagramSvg.ts` wraps the renderer and fixes what soffice needs:
inject `width`/`height` from the already-exported `thumbnailTransform(els)` (the
renderer emits `viewBox` only, so LibreOffice would otherwise pick a default page and
clip); add a white background rect and a `Liberation Sans, Noto Sans` fallback matching
the installed fonts; and guard the empty case — the renderer returns `""` for zero
elements.

**Bytes are rendered at job time and served by URL**, not inlined in every poll.
`?include=pdf` offers base64 for callers who want one round-trip.

**A missing PDF must never fail a successful map.** No `soffice` in local dev — if it
throws, the job still succeeds with `pdfUrl: null`, `pdfError`, and a working `svgUrl`.

### 6. Volumetrics — `app/lib/simulation/volumetrics.ts` — NOT PHASE 1 (v2/4)

> **Out of scope for phase 1.** Boroon, 2026-09-01: *"no need — that math will be done
> in our application."* The arithmetic belongs where the business context for it lives.
>
> **The code and this section REMAIN** (Paul, 2026-09-01) — dormant, not deleted. The
> capability is built, tested and costs nothing to leave in place, and taking it out
> would only have to be put back. The external document records it as available to
> switch on rather than pretending it does not exist. Everything below still describes
> what happens IF volumetrics are sent; phase 1 simply does not send them.

The diagram already separates a *documented* value from a *simulation* value
(`app/lib/simulation/useDiagramValues.ts`). So write both:

- `minutesPerRun` ÷ step count → `properties.cycleTime` + `timeUnit`, **and**
  `properties.sim.cycleTime` as a fixed distribution, marked `autofilled`.
- `runsPerMonth` → exponential arrival on each arrival source. Business basis
  (21 × 7.5 × 60 = 9 450 min/month) by default; **echo the basis and the derived
  interarrival** — never leave that assumption silent.
- Derived headlines an AI-readiness score actually wants: `hoursPerMonth`,
  `hoursPerYear`, `fteEquivalent` (state the divisor).

The `autofilled` flag renders those values purple and lets the existing *Unfill missing*
clear them — so a human sees which numbers were derived rather than measured. Net
effect: the partner-created diagram **opens with a runnable simulation**. That is the
upsell moment.

> Equal-splitting one aggregate across tasks is a fiction. It is the only honest move
> with a single number, but it must be labelled — hence `autofilled`,
> `derivation:"equal-split"`, and a line in `volumetrics.notes`. A later
> `PATCH /activities` letting GETAI post per-activity minutes is the real answer.

---

## Slices

1. **"Boroon can curl something real."** `ApiKey` model, `partner/auth.ts`,
   `partner/errors.ts`, `GET /whoami`, SuperAdmin mint screen — **plus `PartnerRequest`
   and the `withPartnerLogging` wrapper from the very first route**, so `/whoami` and
   every 401 during key exchange are already visible. Getting the wrapper in before there
   is anything to forget to wrap is the cheapest moment to do it. Clears the longest human
   round-trip — key exchange and header plumbing on his side — while we build the rest.
2. **The core, internal only.** `docxToText`, `attachmentFromFile`, the
   `generateDiagramData` gap, `partner/runProcessMap.ts` (input → `{diagramData,
   warnings, model}`, no HTTP), `partner/shapeResult.ts`. All unit-testable with a
   stubbed `planBpmn`. The real engineering risk lives here and needs nothing from him.
3. **Async + persistence, and the screen.** `PartnerJob`, POST/GET, worker, reaper,
   Project + Diagram creation, deep link. `pdfUrl` still null. Ship
   `/dashboard/admin/partner-api` here — the moment there is real traffic is the moment
   you need to see it, and it is what you will debug slices 4–5 with.
4. **The test harness.** `/dashboard/admin/api-harness` + its proxy route, the
   `useFileAttach` extraction, the description/upload/volumetrics form, the
   pools / activities / raw-JSON output panels, and the **`HarnessCase` library** --
   save every run, pick one, re-submit, with per-case run history. **Deliberately before the PDF and
   the volumetrics**, because from here on it is how you exercise every later
   slice — the PDF panel lights up when slice 5 lands, volumetrics when slice 6
   does. Building it earlier means the remaining slices are tested by clicking
   rather than by curl.
5. **PDF.** `svgToPdf`, `renderDiagramSvg`, the three artifact routes. Ship
   `diagram.bpmn` here too — `buildBpmnXml` is already pure, so it is nearly free and
   it is the highest value-per-line item in the plan.
6. **Volumetrics.**
7. **The round trip.** The SOP picker and the survived/missing/invented comparison.
   Last because it needs the whole pipeline working to mean anything — but it is
   what turns the harness from a viewer into a measurement, and it is the tool
   you will use to judge whether a small model is good enough.
8. **Compare and export.** Two-run comparison via the existing `POST /api/diagrams/diff`,
   and the case-bundle export/import so the corpus can live in the repo. Both are
   worth having only once there is a history to compare and a corpus worth moving.
9. **Hardening.** Daily caps, audit rows, a docs page.
10. **v2, from the review of 2026-09-01.** Six changes reach the code; the rest are
    documentation. In dependency order:
    - **`diagram.json` artifact** (v2/1) — the diagram as Diagramatix JSON, beside the
      BPMN XML. Nearly free: the document is already JSON, so this is a route and a
      content type. Add `jsonUrl` to `artifacts`.
    - **`timings` on the result** (v2/6) — `elapsedMs` plus per-stage milliseconds.
      The stages are already recorded for the Usage screen; this surfaces them. Also
      returned WHILE running, so a spinner can show elapsed.
    - **`instructions` on the request** (v2/7), appended to the prompt, plus standing
      instructions on the key. Both are plain text into the same place.
    - **Full-body capture in a testing phase** (v2/12) — drop the 2 KB truncation when
      the key is capturing.
    - **`callbackUrl`** (v2/5) — one POST of the finished result, best-effort, job
      stays pollable. Last because it is the only one needing outbound HTTP, retry
      thinking and an allow-list.
    - **Harness parity** — the harness must exercise all of it, or none of it is
      really tested: an instructions box, the timings on screen, the JSON artifact in
      the preview dialog, and a way to see a callback fire.

---

## Observability — see the traffic, drill into any request or response

This is a partner integration: when Boroon says *"it returned an error"*, we need the
exact bytes he sent and the exact bytes we returned, without asking him to reproduce it.

**The traffic log must sit at the edge, not on the job.** A `PartnerJob` row only exists
for a POST that got far enough to be accepted. The things you actually debug during an
integration — a 401 from a wrong header, a 413 from an oversized SOP, malformed JSON, a
poll storm hitting 429 — never create a job at all. So:

### `PartnerRequest` — one row per HTTP call

`at`, `apiKeyId?`, `keyPrefix?`, `method`, `path`, `status`, `durationMs`, `ip`,
`userAgent`, `requestBytes`, `responseBytes`, `errorCode?`, `jobId?`, `ref`, plus
`requestBody?` / `responseBody?` / `requestHeaders?` when capture is on.

Written by a wrapper — **`withPartnerLogging(handler)`** in `app/lib/partner/logging.ts`
— so every route under `app/api/public/**` is logged *by construction* and a new route
cannot forget. Pinned by a source-text tripwire test, the same idiom as the existing
`tests/config/route-protection.test.ts`.

### Three phases — retention is a property of the phase, not a flag to remember

Paul, 2026-08-30, framed the rollout as three phases with different retention needs.
Checking the plan against them found a real gap, so retention is now modelled on the
phase itself rather than on a boolean somebody has to remember to unset.

**`ApiKey.phase: "internal" | "testing" | "live"`, defaulting to `live`** — a new key
retains nothing extra until someone deliberately says otherwise. Plus
`captureUntil: DateTime?`, **required when phase is `testing`**.

| | **1. Internal** | **2. External test** | **3. Live** |
|---|---|---|---|
| Who calls | The harness, us | Boroon's app, his test data | Boroon's app, real customers |
| Input prose | Kept — on the case, and on the diagram | Kept | Diagram only |
| Input document | **`HarnessCase`, forever** | **Kept until `captureUntil`** | Not kept |
| Request/response bodies | Kept **IN FULL** | Kept **IN FULL** until `captureUntil` | Not kept |
| Metadata (sizes, SHA-256, status, ms, error) | Kept | Kept | **Kept** |
| Request rows | 30 days | 30 days | 30 days |
| Daily rollup (calls, errors, tokens, cost) | Forever | Forever | Forever |

**Store everything while testing (v2/12).** Paul, 2026-09-01: during a testing
phase, capture is COMPLETE — full request and response bodies, not the 2 KB envelope
truncation the first design applied. The truncation was a sensible instinct for a live
system and the wrong one for a test: diagnosing a bad generation from a fingerprint of
the input wastes both sides' time, and the whole purpose of a bounded testing window is
to be able to see exactly what was sent. The 2 KB cap therefore applies to a LIVE key
only, where bodies are not kept at all — so in practice it now protects nothing and is
retired.

What does NOT change is the boundary: capture is still a property of the key's PHASE,
still defaults to `live`, `testing` still carries a mandatory `captureUntil`, going
live still purges immediately, and `whoami` still reports which mode a key is in. The
commitment was never "we keep little", it was "we keep it only while we have said we
are, and we stop on a date" — that is intact.

**The gap this fixes.** The previous design purged bodies at **7 days regardless**,
which quietly contradicted its own `captureUntil` field: an external test phase
running six weeks would have lost its evidence five weeks in, and the failure mode is
the worst kind — you go looking for a request that mattered and it is simply gone. The
purge is now driven by `captureUntil`, with a hard ceiling of **90 days** so
"indefinitely" is not reachable by leaving a field blank.

**Promotion between phases is an action with consequences, not a dropdown.**

- **`testing` → `live`** does not merely stop capturing; it **purges that key's
  captured bodies and documents immediately**. Going live should retire the test
  data, not leave it lying around until a sweep notices. Audited, and the
  confirmation says how many rows it will delete.
- Anything from phase 2 worth keeping should be promoted to a **`HarnessCase` first** —
  which is exactly the intended workflow. Boroon's failing run 47 becomes a permanent
  regression case *in our corpus*, and the rest of his test data is discarded on
  go-live. That is also the honest answer to "why do you still have our documents?":
  we don't, except the specific ones we asked to keep.
- **`live` → `testing`** is allowed (a partner hits a problem in production and you need
  to see it) but requires a fresh `captureUntil` and is audited. It is a temporary
  diagnostic window, not a state to sit in.

Bodies are stored WHOLE while a key is in a capture phase (v2/12). The document is
also stored whole in `PartnerJob.inputDocument`; the request envelope is where the
8 MB of base64 would otherwise land a second time, so the two are kept separately
rather than one inside the other.

The Usage screen shows each key's **phase and expiry** as a badge, and says plainly
when a body was not kept and why — a blank panel that looks like a bug is worse than a
sentence explaining the policy.

### `ref` — the thing that makes support actually work

Every response carries an 8-char `ref` in the JSON envelope **and** in an
`X-Diagramatix-Request-Id` header. Boroon quotes the ref; Paul pastes it into the search
box and lands on the exact call. Near-free, and the single highest-value item here.

### The screen — `/dashboard/admin/partner-api`

Follows the existing `audit-log` screen's list-plus-drill-in pattern.

- **Summary strip:** calls today, error rate, p50/p95 duration, jobs by status, tokens
  and **cost** for the period.
- **List:** time · key prefix · method + path · status (coloured) · ms · error code ·
  job link. Filters: key, status class, path, date range, *errors only*, free-text `ref`.
- **Drill-in:** full request (headers redacted, JSON pretty-printed, base64 elided) and
  full response, side by side. For a job row it also shows the **stage timeline** with
  per-stage timings, the raw AI plan, the layout diagnostics, and the rendered artifacts.

### Cost and AI detail come free

`AiInvocation` rows are already written at the `makeAiClient` seam — provider, model,
tokens (including cache read/write), retries, latency, stop reason. Once
`enterAiContext({invocationPoint: "partner.process-map"})` is set they are already
filterable in the existing AI Usage screen. Join them to the job by user + time window
so the drill-in shows what that single call cost.

**Retention:** bodies until the key’s `captureUntil` (90-day ceiling) · request rows 30 days · a daily rollup
(`PartnerUsageDay`: calls, errors, jobs, tokens, cost per key) kept indefinitely, so the
long-term picture survives the purge. All three trimmed by the same lazy reaper that
fails stuck jobs — no new cron.

---

## The test harness — a SuperAdmin tile that is Boroon, without Boroon

Paul, 2026-08-30. Everything above is a contract we cannot exercise: the first real
call would be Boroon's, and a defect found then costs a round-trip through someone
else's calendar. So a SuperAdmin screen that submits exactly what his app will
submit, and shows exactly what comes back — **`/dashboard/admin/api-harness`**,
one entry in `ADMIN_TILES` (`AdminClient.tsx`), gated by `isActingSuperuser` like
every other admin page.

**Two tiles, one colour.** A new `processApi` feature colour key labelled
**"Process API"** covers both this screen and the traffic screen above, so they
read as one capability on the SuperAdmin grid rather than two unrelated tools.
Adding the key means touching three places in one file —
`FeatureColorKey`, `FEATURE_META` and `DEFAULT_FEATURE_COLORS` in
`app/lib/theme/featureColors.ts` — and the colour editor picks it up automatically
because it is driven off `FEATURE_META`.

| Tile | Screen | Does |
|---|---|---|
| **Process API — Test Harness** | `/dashboard/admin/api-harness` | Submits what Boroon submits; shows what comes back |
| **Process API — Usage** | `/dashboard/admin/partner-api` | Traffic list, drill into any request or response |

### It calls the REAL API, through a server-side proxy

The page posts to a thin SuperAdmin route — `app/api/admin/api-harness/run` —
which attaches the chosen key and calls `/api/public/v1/process-map` **over real
HTTP on the loopback**, then relays the poll.

That indirection is not ceremony. The Security section says a key in a browser is
burned, and it means it: putting a live partner key into page JavaScript to save a
hop would contradict the rule on the same screen that demonstrates it. The proxy
keeps the key server-side while still exercising the whole path — header auth,
`withPartnerLogging`, rate limits, the job table, polling. The harness's own calls
appear in the Partner API traffic screen alongside Boroon's, which is exactly
where you want them when comparing "mine works, his doesn't".

### Input — the same four things his form collects

- **Key** — a dropdown of live `ApiKey` rows by name + prefix. A dedicated
  `Harness (scratch)` key is seeded so the screen works on a fresh install, but
  picking a partner's real key is the point: when Boroon says *"my key doesn't
  work"*, you reproduce it in one click.
- **Description** — a textarea.
- **Document** — upload (PDF / DOCX / TXT / MD / image) **or** *pick one of your
  own SOPs*. See the round trip below.
- **Volumetrics** — minutes per run, runs per month, business/calendar basis.

Every run targets **one reusable "API Harness" project** via the API's own
`options.projectId`, so runs pile up as diagrams in one place and can be compared
against each other, and the `" (2)"` naming rule gets exercised on every single
run rather than only in a test. A **Clear** button empties it.

### Output — the three things the API promises, plus the evidence

- **Pools and lanes** as a nested tree.
- **Activities** as a numbered table: no, name, pool, lane, task type, systems,
  inputs, outputs, decision.
- **The PDF**, inline. `FilePreviewDialog` already renders `kind:"pdf"` from a
  Blob, `kind:"svg"` from a string and `kind:"json"` through the dependency-free
  `highlightJson` — so the PDF, the SVG fallback and the raw response envelope all
  display with no new component and no new dependency. Fetch the artifact URL,
  `.blob()`, hand it over — the same two lines `SopEditorClient` already uses.
- **The evidence:** stage timeline with per-stage ms, the model used, token count
  and cost from the joined `AiInvocation` row, layout diagnostics, `warnings[]`,
  and a deep link into the generated diagram.

### The round trip — the part that makes it a measurement

A Diagramatix SOP records the diagram it came from (`SopDocument.diagramId`). So
when the input is one of our own SOPs, the source diagram is **ground truth**, and
the harness can report what survived the journey:

> BPMN → SOP → *(the API)* → BPMN

- **Activities:** matched / missing / invented, matching on normalised label.
- **Lanes:** matched, and whether each activity landed in the same one.
- **Order:** whether the returned sequence preserves the SOP's step order.
- A one-line score, so the number can be watched as the master prompt changes.

That is the difference between *looking at* the output and *measuring* it, which
is what Paul asked the harness for. It is also the only honest way to answer "is a
small model good enough here?" — run the same SOP against two models and compare
the scores rather than the vibes.

> **Cheapest input path:** send the SOP's `bodyMarkdown` sections as a `text`
> attachment. Exporting to .docx and back through LibreOffice tests our own
> exporter, not the API, and costs a `soffice` spawn per run. Offer .docx export as
> a checkbox for when you *do* want to prove the document path end to end.
>
> There is **no global SOP list** — `GET /api/projects/:id/sop` is project-scoped
> — so this needs a project picker first, or a small SuperAdmin list route. Follow
> the shape of `app/components/sop/ProjectSopsSection.tsx` (~70 lines).

### The case library — every input saved, picked, and re-submitted

Paul, 2026-08-30: *"All inputs need to be saved, selected conveniently, and used to
re-submit so that testing can replay a previous API usage."*

That is a **test corpus**, and the important realisation is that it must NOT live
under the retention rules below. Those govern a *customer's* document: capture
`testing` phase only, time-boxed, purged on go-live. A harness case is *our own* test material,
authored by a SuperAdmin, and it has to survive indefinitely or it is not a corpus.
Two things that happen to hold similar bytes, with opposite requirements —
conflating them would either lose the corpus to the purge or keep customer content
forever.

So a separate table.

```prisma
model HarnessCase {
  id, name, notes, starred Boolean @default(false)
  description     String  @db.Text          // the prose input
  documentBytes   Bytes?                    // the uploaded document, kept for good
  documentName    String?
  documentType    String?
  volumetrics     Json    @default("{}")    // pgPool raw-SQL writes
  sourceSopId     String?                   // set when built from one of our SOPs …
  sourceDiagramId String?                   // … and its diagram = round-trip ground truth
  createdById, createdAt, updatedAt, lastRunAt, runCount
}
```

and one nullable column on the job: **`PartnerJob.harnessCaseId`**. A case's run
history is then simply the jobs that name it — no third table, and comparison comes
free.

A harness-originated job therefore stores **no** `inputDocument` of its own: the
bytes are the case's, recoverable through `harnessCaseId`. No duplication, and the
purge rule below stays about customer content only.

**The screen.** A case list down the left — starred first, searchable by name and
description — and clicking one loads its inputs into the form. Every run offers
*Save as case*; a case can be renamed, starred and deleted. Two or three starter
cases seed on a fresh install so the screen is useful before you have built
anything: one description-only, one from a repository SOP.

**Run history and comparison.** Under the form, this case's past runs: when, model,
elements / connectors, diagnostics count, round-trip score, link to the diagram.
Select any two and compare — the headline numbers side by side, and the
diagram-level detail through the existing process-diff machinery
(`POST /api/diagrams/diff`, already used by `ProcessDiffDialog`).

That is the loop the harness exists for. *Did that master-prompt change help?* Run
the same case before and after. *Is Haiku good enough?* Run the same case on Haiku
and on Sonnet. Both questions currently get answered by impression; this answers
them with a number, on a fixed input.

**Portable.** A case exports as a `.json` bundle with the document base64 inside —
one case or the whole library — and imports back. So a corpus can live in the repo,
seed a fresh environment, ride along with a bug report, and eventually be replayed
in CI as a generation-quality regression suite. Cross-environment ids are useless,
so `sourceSopId` / `sourceDiagramId` export as *labels* and re-resolve on import,
falling back to "no ground truth available" rather than pointing at a stranger's
diagram.

> **One judgement call to overrule if you disagree.** *Save as case* is offered on
> a real partner run too — invaluable when Boroon's run 47 fails and you want it as
> a permanent regression case. But it copies a customer's document out of a
> time-boxed testing window into permanent storage, so it is allowed only while that
> key is in the `testing` phase, it is audited, and the confirmation says exactly
> that in words.
>
> This is in fact the **intended phase-2 workflow**: keep the handful of runs worth
> keeping as cases, and let go-live discard the rest. It is also the honest answer to
> *"why do you still have our documents?"* — we don't, except the specific ones we
> asked to keep.

### Where a real partner's inputs are saved — and the gap Paul found

Paul, 2026-08-30: *"Where are the inputs saved?"* Asked of the plan as written, the
answer was uncomfortable:

| Input | Where it lands | Recoverable later? |
|---|---|---|
| **Description** (prose) | `Diagram.data.aiGeneration.promptText` on the generated diagram | **Yes** — visible in the editor, deleted with the diagram |
| **Volumetrics** | `data.volumetrics` on the diagram, echoed in the response | **Yes** |
| **The AI plan** | `data.aiGeneration.plan` (shipped 2026-08-29) | **Yes** — `scripts/replay-diagram.ts` replays it offline |
| **The uploaded document** | `PartnerJob.request` keeps `{mediaType, bytes, sha256}` only | **NO** |

So a harness run that produces a bad diagram from an uploaded SOP leaves you with
the diagram, the plan and the *fingerprint* of the document — but not the document.
You cannot re-run it, and you cannot see what the model was actually given. For an
evaluation tool that is the wrong trade: the whole point is to change something and
compare.

`PartnerRequest` body capture does not rescue it either — bodies are truncated to
2 KB, which is a fingerprint of a PDF, not a PDF.

**So: `PartnerJob` gains `inputDocument Bytes?`, `inputDocumentName`,
`inputDocumentType`, written only when the key is in the `testing` phase.** It purges
at that key’s `captureUntil`, and immediately on go-live. `Bytes` writes through plain
Prisma — no `pgPool` raw SQL needed, unlike the `Json` columns.

That makes a harness run **fully reproducible**: description, document, plan and
result all recoverable from one job id, and re-runnable against a different model
or a changed master prompt. It is the same argument that made storing the AI plan
worth it — a saved output cannot tell you what the input was.

> The privacy line does not move. Retention is still governed by the key’s PHASE, still
> defaults to `live`, and `testing` still carries a mandatory expiry. What changes is
> that during `testing`, capture is complete enough to be USEFUL instead of complete
> enough to be misleading.

### One extraction that pays for itself

`handleFileAttach` is **duplicated** in `AiPanel.tsx` and `PlanPanel.tsx`, and
neither handles `.docx` — the type is in the `accept` list but falls to
`file.text()`, so a Word SOP arrives as ZIP binary. Extract
`app/lib/attachments/useFileAttach.ts` (`{ attachment, handleFileAttach, ACCEPT }`,
reusing the shared `arrayBufferToBase64`), add the mammoth branch, and point all
three at it. The harness gets its uploader free and both editor panels get the
DOCX bug fixed on the way past — the same defect the server-side
`attachmentFromFile` fixes for the API.

---

## Security

A partner key must not be able to:

- **Read anything it did not create** — every job read filtered by `apiKeyId`; foreign
  job is 404. No caller-supplied `diagramId` in v1.
- **Choose its org** — `orgId` comes only from the key row. An `orgId` in the body is a
  **400, not an ignore**; a mistake should be loud.
- **Choose a model** — rejected. `chooseModel` would silently fall back, which would let
  a partner drive us onto Opus at our cost. Hard-code `resolveGenerateModel(hasImage)`.
- **Be a SuperAdmin** — fail-closed guard if the service user's email is in
  `SUPERUSER_EMAILS`; that unlocks impersonation and model choice.
- **Be an OrgAdmin** — see `isAdminElevatedForOrg` above.
- **Escape metering** — `gateLimit` before the call, `gateElementCount` after the plan,
  `recordUsage` after success, plus a durable per-key `dailyJobLimit`. The in-memory
  `rateLimit` is a speed bump only (single instance, resets on deploy).

**`PartnerJob.error.message` must be a curated, code-mapped string, never `err.message`**
— otherwise a Prisma or soffice failure is stored and then handed to the partner on the
next poll.

**Never persist the raw key** — prefix only, everywhere, always. No exception.

**The customer's content** lives in exactly three places, and nowhere else:

1. `Diagram.data.aiGeneration.promptText` — the description, on the generated diagram,
   where the customer can see it and it dies with the diagram. Always.
2. `PartnerRequest.requestBody` — the request envelope, IN FULL (v2/12). `testing`
   phase only, purged at that key's `captureUntil`.
3. `PartnerJob.inputDocument` — the uploaded document's bytes, whole. `testing` phase
   only, purged at `captureUntil` **and immediately on go-live**.

`PartnerJob.request` itself keeps sizes and SHA-256 only, always. **The key’s PHASE
governs all retention beyond (1), it defaults to `live`, and `testing` carries a
mandatory expiry** — which is what makes the policy checkable rather than aspirational.

Log: `recordAudit` for key mint/revoke and job creation; `lastUsedAt`/`useCount` per
call; `recordDiagramGenerated({source:"partner-api"})`. `AiInvocation` rows arrive free
via the `makeAiClient` seam once `enterAiContext` is set — the whole cost story with no
new code, filterable by a new `partner.process-map` invocation point.

---

## Verification

Vitest, `tests/partner/`. **Next ref is `T2940`** — append-only, and
`tests/config/tests-summary-coverage.test.ts` fails unless the three hand-maintained
lines in `tests/TESTS_SUMMARY.md` are updated.

- **auth** — a key resolves to *its* org even when the service user's oldest membership
  is a different one (**the hazard test**); revoked → 401; expired → 401; missing scope
  → 403 distinct from 401; a SUPERUSER-email service user is refused; `useCount` advances.
- **attachment** — PDF → `{type:"pdf"}`; DOCX → text containing the document's words and
  **not the letters `PK`** (pins the bug being fixed); a PDF mislabelled `text/plain` is
  sniffed correctly; `.doc`/`.zip` → `unsupported_media_type`; oversize rejected before
  base64 decode.
- **shapeResult** — pools/lanes nest by `parentId`; activities follow `extractSkeleton`
  order numbered from 1; gateways surface in `decisions[]`; cross-lane flows in
  `handoffs[]`; **payload keys match an explicit allow-list** so a new `SopStep` field
  cannot silently leak into the contract.
- **volumetrics** — 25 min over 5 tasks → 5 min each in both the documented and the sim
  value, marked `autofilled`; business vs calendar basis give different documented
  numbers; no arrival source → no throw.
- **job** — no input → 400 with no row; 202 returns a jobId; another key gets **404 not
  403**; same `Idempotency-Key` twice → one row; the reaper fails a stuck job; a failed
  job's message is curated (assert a Prisma-style string is *absent*).
- **render** — `width`/`height` injected matching `thumbnailTransform`; empty diagram
  never invokes soffice; when `svgToPdf` throws the job still succeeds with a working
  `svgUrl`.
- **security** — body `orgId`/`model` → 400; foreign `projectId` → 403; the new
  invocation point is in `AI_USER_METERED_POINTS` (existing lock-step guard in
  `tests/ai/ai-telemetry.test.ts`); a source-text tripwire that every route under
  `app/api/public/**` calls `authenticatePartner`.
- **logging** — a second tripwire that every route under `app/api/public/**` is wrapped
  in `withPartnerLogging`; a failed auth (which never reaches a handler) **still** writes
  a `PartnerRequest` row, because a 401 storm is the commonest integration symptom; the
  stored row **never contains the raw key** — assert the full key string is absent from
  every column, the strongest form of this check; with the key in `live` phase, bodies are
  null but sizes and SHA-256 are present; past `captureUntil`, bodies are null again;
  a body is stored IN FULL in a capture phase and not at all outside one; and the `ref` returned
  in the envelope matches the `ref` on the row and the `X-Diagramatix-Request-Id` header.

- **phases** — a `live` key stores no body and no document, only metadata; a `testing`
  key stores both and they survive past seven days (the bug this replaced); moving a key
  `testing` → `live` purges that key’s captured bodies and documents in the same action,
  and leaves `HarnessCase` rows untouched; and `captureUntil` is REQUIRED to enter
  `testing` and cannot exceed 90 days.
- **case library** — a saved case round-trips through export and import with its document
  intact (byte-for-byte, and the imported case still runs); a case whose `sourceDiagramId`
  does not exist in this environment imports as "no ground truth" rather than resolving to
  someone else’s diagram; re-running a case produces a second job carrying the same
  `harnessCaseId`, so the history accumulates; and a `HarnessCase` is NEVER touched by the
  `captureUntil` purge that clears `PartnerJob.inputDocument` — the one assertion that keeps the
  corpus and the privacy rule from being confused for each other.
- **harness** — the proxy route is SuperAdmin-only and refuses everyone else; **the
  chosen key never appears in the page's HTML or its JSON response** (assert the full
  key string is absent from both — the same shape as the `PartnerRequest` check, and
  the reason the proxy exists); a run with neither description nor document is refused
  client-side before a call is made; the round-trip comparison scores a known
  SOP/diagram pair correctly, including counting an invented activity as invented
  rather than silently matching it; and `useFileAttach` turns a .docx into text
  containing the document's words and **not** the letters `PK` — which pins the same
  bug in `AiPanel` and `PlanPanel`, whose tests should assert it too.

**End to end, by hand:** mint a key on the SuperAdmin screen → `curl /whoami` → open the
harness, pick that key, paste a description, run → watch it reach `succeeded` → check the
pools, activities and PDF panels → open the deep link and confirm the diagram is editable
and the simulation runs → find the same call in the Partner API traffic screen by its
`ref`. Then pick one of your own SOPs and confirm the round-trip score is plausible.

The harness is the acceptance test for everything above it. If it works, Boroon's
integration is a matter of him sending the same JSON.

---

## Risks

1. **The in-process worker is the weakest link.** No queue: a container swap kills
   running jobs. The reaper makes those honest failures, POST is idempotent, and the
   contract says *retry once on `worker_lost`* — but do not promise an SLA on this design.
2. **LibreOffice on the app instance** — 1–3 s startup, memory-hungry, one process per
   job. Cap at 2 concurrent. Absent in local dev, hence PDF-optional.
3. **Fidelity honesty.** This is the *simplified* renderer — recognisable shapes,
   approximated event markers. If GETAI puts the PDF in a client-facing report, set
   expectations now. Shipping `diagram.bpmn` lets him render it properly himself.
4. **Base64 caps out** at ~10 MB decoded; a 30-page scanned SOP exceeds it. Bigger means
   multipart or pre-signed upload in v2, not a bigger JSON.
5. **Limits are provisional and soft for phase 1 (v2/11).** 30/minute and 50/day were
   picked before either side knew the traffic. Boroon's constraint is the one that
   matters: *"you can't have a customer hit the day's limit"* — meeting a wall mid-demo
   is a worse failure than an unexpected invoice line. So they are monitored rather than
   enforced to the point of spoiling a session, reported through the Usage screen, and
   settled commercially. `whoami` returns the current values so his side never has to
   guess, and they can be changed per key without a deploy.
6. **The service user's tier silently gates the partner** — on Free, `gateLimit` 403s
   after a handful of calls with a message about upgrading *your* subscription, which is
   nonsense to a partner. Mint the service user onto an explicit tier and map that 403
   to `quota_exceeded`.
6. **A text-only description may yield one pool, one lane**, and Boroon's role analysis
   comes back empty. Emit `warnings:[{code:"single_lane"}]` so his UI can ask for more
   detail.
7. **Do not add CORS.** A request for it means the key is heading into a browser, where
   it is burned. Refuse; offer a server-side proxy.
8. **`PartnerRequest` grows fastest of anything here** — polling means several rows per
   job. Metadata rows are small, but bodies are not: bound them by the `captureUntil` purge, the
   full-body capture being confined to a bounded phase, and `phase` defaulting to
   **live**. Bodies are now stored whole rather than truncated (v2/12), so the table
   grows FASTER in a capture phase than the first design assumed — which makes
   `captureUntil` and the 90-day ceiling load-bearing rather than tidy. If a key is left in `testing`
   across a busy integration, that table is the thing that fills the disk — which is why
   `captureUntil` is mandatory in that phase and capped at 90 days.
9. **The `testing` phase is a privacy commitment, not a debug convenience.** It stores a
   third party's process documents. It is a disclosed, time-boxed agreement: tell Boroon
   it is on, let `captureUntil` expire on its own, and purge on go-live rather than
   relying on someone remembering. The one thing that must not happen is a key sitting
   in `testing` because nobody moved it.

---

## Open question for Boroon (not blocking)

The call raised process **granularity** — "if they feed something that is a really
chunky process, the recommendation is we need to look at it more granularly". Diagramatix
can detect that cheaply (element count, lane count, subprocess depth) and return a
`granularity` hint suggesting the process be split, which feeds his recommendation
engine directly. Worth proposing once v1 is live.
