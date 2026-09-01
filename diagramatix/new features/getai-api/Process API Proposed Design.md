# Diagramatix Process API — Proposed Design

**Version 2 · 1 September 2026**

This document defines the proposed interface for the Diagramatix Process API.

Version 2 follows the review of 1 September and changes what that review asked
for: **JSON joins BPMN XML as a first-class output**, the rendered PDF steps back
from being the headline deliverable, **volumetrics leave phase 1**, a **completion
webhook** is offered alongside polling, every response now carries **its own
timings**, and a request may carry **additional instructions** of your own. A new
section says plainly which parts of the output are dependable enough to put in
front of a customer unattended, and which want a human pass first.

---

## What it does

Send a description of a business process, a document describing one, or both. Get
back a structured model of that process:

- its **pools and lanes** — who is involved, including external parties and IT systems
- an **ordered list of activities**, each with its performer, the systems it touches, and what it consumes and produces
- the **decisions** in the flow and where work is **handed between roles**
- the process as **BPMN 2.0 XML** and as **JSON**, and a **rendered diagram** as PDF or SVG

The generated diagram is also created in Diagramatix, so a link can be followed
into a full editor where it can be corrected, extended, simulated or exported.

The API is designed for a product that needs process structure it can reason
about — scoring, analysis, reporting — rather than only a picture.

---

## Which output to build on

Two machine-readable forms come back, and they are not interchangeable.

| | `diagram.bpmn` | `diagram.json` |
|---|---|---|
| What it is | **BPMN 2.0 XML** — the OMG international standard | Diagramatix's own document structure |
| Stability | Fixed by the standard | Ours; it can change as the product does |
| Portability | Any BPMN tool reads it | Diagramatix reads it |
| **Recommended for** | **Scoring and analysis** | Round-tripping a diagram, or when the JSON is simply easier to consume |

**Score from the XML.** It is a published standard, so nothing you build on it
depends on Diagramatix continuing to shape its documents the way it does today.
The JSON is offered because it is convenient, not because it is a contract in the
same sense — if you build scoring on it, a change on our side can reach you.

---

## Conventions

- Base URL: `https://app.diagramatix.com.au/api/public/v1`
- All requests and responses are `application/json` unless stated otherwise.
- All dates are ISO 8601 UTC.
- The interface is self-describing: `GET /api/public/v1` returns this contract in
  machine-readable form, and needs no key.

---

## Authentication

Send your key in either header:

```
X-Api-Key: dgxk_…
Authorization: Bearer dgxk_…
```

A key is bound to **one organisation and one service account**, both fixed when
the key is issued. Everything the key does is done as that account, which is how
the work it creates stays inside your own tenancy.

Consequently the API does **not** accept `orgId`, `userId` or `model` in a
request body. Sending one is a `400` rather than being quietly ignored, so a
mistaken assumption surfaces immediately rather than producing plausible results
in the wrong place.

**Verify a key in one call:**

```bash
curl -H "X-Api-Key: dgxk_…" https://app.diagramatix.com.au/api/public/v1/whoami
```

```json
{
  "ok": true,
  "key": { "name": "Acme — production", "prefix": "dgxk_1a2b3c", "scopes": ["process-mapping"] },
  "organisation": "Acme Corporation",
  "phase": "live",
  "retainingRequestData": false,
  "limits": { "perMinute": 30, "perDay": 50, "provisional": true }
}
```

`whoami` does no work and costs nothing. A `200` here confirms the key, the
header, the transport and the organisation binding are all correct — which
removes four possibilities from any later problem.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/public/v1` | This contract. No key required. |
| `GET` | `/whoami` | Confirm a key works. |
| `POST` | `/process-map` | Submit a process. Returns `202` and a job id. |
| `GET` | `/process-map/{jobId}` | Poll for the result. |
| `GET` | `/process-map/{jobId}/artifact/diagram.bpmn` | **BPMN 2.0 XML.** |
| `GET` | `/process-map/{jobId}/artifact/diagram.json` | **The diagram as JSON.** |
| `GET` | `/process-map/{jobId}/artifact/diagram.pdf` | The rendered diagram. |
| `GET` | `/process-map/{jobId}/artifact/diagram.svg` | The same rendering as SVG. |

---

## Submitting a process

`POST /process-map`

```json
{
  "name": "Invoice approval",
  "description": "The accounts payable clerk receives the invoice and checks it against the purchase order. Anything over $5,000 goes to the approver. Finance then schedules the payment in the ERP.",
  "instructions": "Keep this at a high level. Do not decompose to detailed-design depth.",
  "document": {
    "filename": "AP-SOP.pdf",
    "mediaType": "application/pdf",
    "data": "<base64>"
  },
  "callbackUrl": "https://your-app.example.com/hooks/diagramatix",
  "options": { "projectId": "…" }
}
```

| Field | Required | Notes |
|---|---|---|
| `description` | One of these two | Prose. Up to 100,000 characters. |
| `document` | One of these two | Base64. Up to 10 MB decoded. |
| `name` | No | Names the process and the resulting diagram. |
| `instructions` | No | See **Your own instructions** below. |
| `callbackUrl` | No | See **Polling, or a callback** below. |
| `options.projectId` | No | An existing project of yours to add the diagram to. Otherwise one is created. |

**Documents accepted:** PDF, Word `.docx`, plain text or Markdown, and images
(PNG, JPEG, WebP, GIF) — a photograph or screenshot of an existing process
diagram is a valid input.

The file's actual content decides how it is read, not the declared `mediaType`.
A mislabelled PDF is still handled as a PDF. Anything genuinely unreadable — a
spreadsheet, an archive, a legacy `.doc` — is refused by name rather than
interpreted as text, because a diagram built from misread bytes is worse than an
error.

**One document per request.** Sending two is a `400`, not a silent drop.

Description and document may be combined: the document is treated as
authoritative and the description as additional context.

### Your own instructions

`instructions` is free text appended to the prompt. It is the place to say things
like *"keep this at a high level"*, *"do not invent team names"*, or anything else
that shapes the depth or style of the result.

Standing instructions can also be attached to your **key**, so they apply to every
request without being resent. Per-request `instructions` are appended after them.

One honest limit: instructions steer the model, they do not constrain it
mechanically. Asking for less detail generally produces less detail and a faster
run — but it is not a guarantee, and it is not a timeout.

### Response

```
202 Accepted
```
```json
{
  "jobId": "cm…",
  "status": "queued",
  "statusUrl": "/api/public/v1/process-map/cm…",
  "pollAfterSeconds": 5
}
```

### Idempotency

Send an `Idempotency-Key` header. A repeat with the same value returns the
original `jobId` rather than starting a second run, so a retry after a dropped
connection is safe and costs nothing.

---

## Polling, or a callback

**Polling** is the default and needs nothing set up. `GET /process-map/{jobId}`
every **5 seconds**; a typical run completes in **30–120 seconds**.

```json
{ "jobId": "cm…", "status": "running", "stage": "planning", "elapsedMs": 18400, "pollAfterSeconds": 5 }
```

`status` is one of `queued`, `running`, `succeeded`, `failed`. `stage` is a
progress hint — `reading`, `planning`, `shaping`, `saving` — suitable for showing
someone who is waiting, but not something to branch on.

**A callback** is available if it suits your side better. Supply `callbackUrl` and
we `POST` the completed result to it once, with the same body the poll would have
returned. It is an addition, not a replacement: if the callback cannot be
delivered, the job is still there to be polled, so a missed hook never loses a
result.

A job belonging to another key returns **404, not 403**. We will not confirm that
somebody else's job exists.

### On telling your user how long it will take

Every response carries **`elapsedMs`**, and a finished one carries per-stage
timings as well. That is deliberate: it lets you build an expectation from your
own history of runs.

What we cannot do is predict it. The work is handed to a language model that
gives no estimate of its own, and the same description can take 30 seconds or two
minutes. So there is no "time remaining" field, and there will not be one that is
honest. Measured elapsed time, accumulated over your own runs, is the sound basis
for a progress indicator.

---

## The result

```json
{
  "jobId": "cm…",
  "status": "succeeded",
  "model": "claude-opus-5",

  "timings": {
    "elapsedMs": 41230,
    "stages": { "reading": 900, "planning": 32100, "shaping": 6400, "saving": 1830 }
  },

  "diagram": {
    "id": "cm…",
    "name": "Invoice approval",
    "type": "bpmn",
    "projectId": "cm…",
    "deepLink": "https://app.diagramatix.com.au/diagram/cm…",
    "elementCount": 34,
    "connectorCount": 41
  },

  "pools": [
    {
      "id": "p1", "name": "Acme Corporation", "external": false,
      "lanes": [
        { "id": "l1", "name": "Accounts Payable", "sublanes": [] },
        { "id": "l2", "name": "Approver", "sublanes": [] }
      ]
    },
    { "id": "p2", "name": "ERP", "external": true, "lanes": [] }
  ],

  "roles": ["Accounts Payable", "Approver", "Finance"],

  "activities": [
    {
      "no": 1,
      "id": "el_…",
      "name": "Receive Invoice",
      "pool": "Acme Corporation",
      "lane": "Accounts Payable",
      "taskType": "user",
      "systems": ["ERP"],
      "inputs": ["Invoice"],
      "outputs": ["Invoice record"],
      "decision": null
    }
  ],

  "decisions": [
    {
      "afterStep": 4,
      "question": "Over $5,000?",
      "branches": [
        { "label": "Yes", "toStep": 5 },
        { "label": "No",  "toStep": 7 }
      ]
    }
  ],

  "handoffs": [
    { "from": "Accounts Payable", "to": "Approver", "what": "Invoice", "atStep": 4 }
  ],

  "systems": ["ERP"],

  "warnings": [
    { "code": "single_lane", "message": "The description did not identify separate roles…" }
  ],

  "artifacts": {
    "bpmnXmlUrl": "https://…/artifact/diagram.bpmn",
    "jsonUrl":    "https://…/artifact/diagram.json",
    "pdfUrl":     "https://…/artifact/diagram.pdf",
    "svgUrl":     "https://…/artifact/diagram.svg"
  }
}
```

### Notes on the shape

**`pools`** nest their lanes, in the order they appear on the diagram.
`external: true` marks a party or system outside the organisation being modelled
— another company, or an IT system — as distinct from the organisation's own
work.

**`activities`** are numbered from 1 in flow order. `no` is the number to quote;
`id` identifies the shape on the diagram, which is useful if you intend to
correlate with the BPMN XML.

**`decisions`** appear both inline on the activity they follow and collected at
the top level, because a caller counting decision points and a caller drawing a
flow want different access to the same fact. `handoffs` are presented the same
way.

**`warnings`** are advisory, never fatal. `single_lane` is the one most worth
handling: it means the input never said who performs each step, so everything
landed in one lane and any role analysis will come back empty. Prompting for more
detail at that point produces a markedly better model.

**`artifacts`** may contain `null`. A null means that artifact was not produced,
so there is no need to request it to find out.

---

## What is dependable, and what wants a human first

Not every part of the output is equally safe to put in front of a customer with
nobody looking. This matters most for anything shown unattended — a free
self-service result, for instance.

| Output | Dependability | Comment |
|---|---|---|
| Pools and lanes | **High** | Inferred names may not match the customer's real team names — see below. |
| Ordered activities | **High** | The structure the description actually described. |
| Decisions and handoffs | **High** | Derived from the same structure. |
| BPMN XML / JSON | **High** | Faithful to that structure. |
| **Rendered diagram** | **Wants a human pass** | Logically correct; the *layout* is roughly 90% of the way to what a person would draw. |

**So:** the structured output is the part to lean on for anything automatic. A
rendered diagram going to a third party in a client's name is worth a few minutes
in the Diagramatix editor first — which is the reason for the deep link, and part
of why a licence sits behind this integration.

Two things shape quality more than anything on our side:

- **A vague description yields a vague model.** Someone who thinks in process
  order gets a markedly better result than someone typing free association. The
  `single_lane` warning is the machine-detectable end of this.
- **Unstated team names get invented.** If the description says "the sales team"
  but never names the function, a plausible name is chosen — and it may not be the
  customer's. Worth a glance before the diagram is shown to them.

---

## Artifacts

Each is fetched with the same key as everything else:

```bash
curl -H "X-Api-Key: dgxk_…" \
  https://app.diagramatix.com.au/api/public/v1/process-map/{jobId}/artifact/diagram.bpmn \
  -o process.bpmn
```

| Artifact | Type | Use |
|---|---|---|
| `diagram.bpmn` | `application/xml` | **Standard BPMN 2.0 with layout. The recommended basis for scoring.** |
| `diagram.json` | `application/json` | The diagram in Diagramatix's own structure — convenient, but ours rather than a standard. |
| `diagram.pdf` | `application/pdf` | Drop into a report. |
| `diagram.svg` | `image/svg+xml` | Embed in a web page; scales cleanly. |

**On fidelity, plainly:** the PDF and SVG come from a server-side renderer.
Shapes, pools, lanes, labels, connectors and colours are accurate; some event and
task markers are simplified relative to the full editor. If a rendering must match
Diagramatix exactly, render from `diagram.bpmn` yourself, or link to the diagram.

---

## Volumetrics — not part of phase 1

Effort and frequency (minutes per run, runs per month) are **out of scope for
phase 1**, by agreement: that arithmetic is done in the calling application, which
is where the business context for it lives.

The capability exists on our side and can be turned on later. If it is, supplying
`volumetrics` writes documented and simulation values onto the generated diagram
so it opens ready to run, and returns the derived figures — hours per month and
per year, FTE equivalent with its divisor stated, and the interarrival time. It is
recorded here so the option is known, not because anything need be sent today.

---

## Errors

Every error has the same shape:

```json
{
  "error": { "code": "missing_input", "message": "Supply a description, a document, or both." },
  "ref": "a1b2c3d4"
}
```

`code` is stable and safe to branch on. `message` is written for a person and may
change.

**`ref` appears on every response**, in the body and in an
`X-Diagramatix-Request-Id` header. Quote it and we can find the exact call,
including what was sent and what was returned. It is the fastest route to an
answer on any support question.

| Code | Status | Meaning |
|---|---|---|
| `bad_request` | 400 | Malformed JSON, or a field the API does not accept. |
| `missing_input` | 400 | Neither a description nor a document. |
| `payload_too_large` | 413 | Over the document or description limit. |
| `unsupported_media_type` | 415 | A document we cannot read. |
| `invalid_key` | 401 | Key not recognised or absent. |
| `key_revoked` | 401 | Key revoked or expired. |
| `scope_denied` | 403 | Key lacks the capability. |
| `rate_limited` | 429 | Too many requests. Honour `Retry-After`. |
| `quota_exceeded` | 403 | Daily or period allowance reached. |
| `element_limit` | 403 | The model produced more elements than the plan allows. |
| `ai_plan_failed` | 502 | The input could not be modelled. Usually a clearer description or a document with explicit steps resolves it. |
| `ai_unavailable` | 503 | Temporarily unavailable. Retry. |
| `render_failed` | 500 | The diagram was produced but this artifact was not. |
| `worker_lost` | 500 | The run was interrupted rather than rejected. **Submit it again.** |
| `not_found` | 404 | No such job for this key. |
| `server_error` | 500 | Quote the `ref`. |

---

## Limits — provisional

| | Starting value |
|---|---|
| Requests per minute | 30 |
| Process maps per day | 50 |
| Document size | 10 MB decoded |
| Description length | 100,000 characters |

**These numbers are a starting point, not a policy.** They were chosen before
anybody knew the real shape of the traffic, and neither side yet knows what it
will be.

The constraint that matters is the one raised in review: **a customer must never
meet a limit in the middle of a session.** So for phase 1 the throughput limits are
treated as soft — monitored rather than enforced to the point of spoiling a
demonstration — and usage is reported and settled on an agreed commercial basis
rather than by a door closing. `whoami` reports the current values, which can be
changed for your key without any code change on your side.

Rate limits, where they do apply, return `429` with a `Retry-After` header.
Polling an existing job is counted separately from submitting new work, so
checking on a run never consumes the allowance for starting one.

---

## Data handling

| | |
|---|---|
| **Description** | Stored on the generated diagram, where your customer can see it and it is deleted with the diagram. |
| **Document** | **Not retained** in live operation. Only its size and a SHA-256 hash are kept. |
| **Always kept** | Sizes, hashes, status, timing and error codes, for troubleshooting. |
| **Generated diagram** | Stored in your organisation's tenancy, under your control. |

**During an agreed testing phase, everything is kept.** Full request and response
bodies and the uploaded document are retained, so a failure can be diagnosed from
exactly what was sent rather than from a fingerprint of it. That is the point of a
testing phase, and diagnosing from partial evidence wastes both sides' time.

That phase is bounded, not open-ended:

- it carries an **agreed end date**, after which the captured content is purged;
- **moving the key to live purges it immediately**, rather than waiting for the date;
- `whoami` reports whether a key is currently retaining request data, so there is
  never any doubt about which mode you are in.

In live operation nothing of the customer's content is kept beyond the generated
diagram itself, which is yours.

---

## A complete exchange

```bash
# 1. Submit
curl -X POST https://app.diagramatix.com.au/api/public/v1/process-map \
  -H "X-Api-Key: dgxk_…" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 8f14e45f" \
  -d '{
        "name": "Invoice approval",
        "description": "The accounts payable clerk receives the invoice and checks it against the purchase order. Anything over $5,000 goes to the approver. Finance then schedules the payment in the ERP.",
        "instructions": "Keep this at a high level."
      }'
# → 202 { "jobId": "cm…", "pollAfterSeconds": 5 }

# 2. Poll every 5s
curl -H "X-Api-Key: dgxk_…" \
  https://app.diagramatix.com.au/api/public/v1/process-map/cm…
# → { "status": "running", "stage": "planning", "elapsedMs": 18400 }
# → { "status": "succeeded", "timings": {...}, "activities": [...], "artifacts": {...} }

# 3. Fetch the XML to score from
curl -H "X-Api-Key: dgxk_…" \
  https://app.diagramatix.com.au/api/public/v1/process-map/cm…/artifact/diagram.bpmn \
  -o process.bpmn
```

---

## Known limitations

Stated up front rather than discovered later.

1. **A thin description produces a thin model.** If the input does not say who
   performs each step, everything lands in one lane. The `single_lane` warning
   tells you this has happened; asking for more detail at that point is the
   highest-value thing a calling application can do.
2. **Rendering is simplified** relative to the Diagramatix editor, and its layout
   wants a human pass before a diagram goes to a client — see **What is
   dependable** above.
3. **Inferred names may not be the customer's names.** An unnamed team gets a
   plausible invented one.
4. **One document per request.** A process described across several files must be
   combined before sending.
5. **Base64 in JSON caps at 10 MB decoded.** A large scanned document exceeds
   this. A multipart or pre-signed upload is proposed for a later version.
6. **No time estimate is possible** — only measured elapsed time. See **On telling
   your user how long it will take**.

---

## Proposed for a later phase

Recorded so the shape is known; none of it is phase 1.

- **Clarifying questions (multi-pass).** Send a draft description, get back a short
  list of questions to put to the user, and their answers join the prompt for the
  generation call. Two calls instead of one, and a markedly better model at the end
  of it — the single most effective way to improve results without a human editing
  the diagram.
- **Per-activity effort**, for a caller with better data than one aggregate.
- **Simulation output over the same interface**, once a process carries enough
  data to simulate — distributions, arrival rates, calendars, team sizes.

---

## Questions for review

Answered in the review of 1 September: JSON alongside XML, XML as the scoring
basis, volumetrics out of phase 1, a callback offered beside polling. Still open:

- Whether the **activity shape** carries what you need. Systems, inputs, outputs
  and decisions are included because a structural analysis usually wants them —
  if something is missing, adding it now is cheap.
- Whether **standing instructions** on the key are useful, or whether sending
  `instructions` per request is simpler at your end.
- Whether the **callback** is worth wiring up in phase 1, or whether polling with
  a spinner is enough to begin with.
