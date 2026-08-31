# Diagramatix Process API — Proposed Design

**Version 1 (proposed) · 31 August 2026**

This document defines the proposed interface for the Diagramatix Process API. It
is issued for review: the shapes below are implemented and callable, and we would
rather change them now, in response to how they read to somebody building against
them, than after anyone has written code.

---

## What it does

Send a description of a business process, a document describing one, or both. Get
back a structured model of that process:

- its **pools and lanes** — who is involved, including external parties and IT systems
- an **ordered list of activities**, each with its performer, the systems it touches, and what it consumes and produces
- the **decisions** in the flow and where work is **handed between roles**
- a **rendered diagram** as PDF, SVG, or standard BPMN 2.0 XML

The generated diagram is also created in Diagramatix, so a link can be followed
into a full editor where it can be corrected, extended, simulated or exported.

The API is designed for a product that needs process structure it can reason
about — scoring, analysis, reporting — rather than only a picture.

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
  "limits": { "perMinute": 30, "perDay": 50 }
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
| `GET` | `/process-map/{jobId}/artifact/diagram.pdf` | The rendered diagram. |
| `GET` | `/process-map/{jobId}/artifact/diagram.svg` | The same rendering as SVG. |
| `GET` | `/process-map/{jobId}/artifact/diagram.bpmn` | BPMN 2.0 XML. |

---

## Submitting a process

`POST /process-map`

```json
{
  "name": "Invoice approval",
  "description": "The accounts payable clerk receives the invoice and checks it against the purchase order. Anything over $5,000 goes to the approver. Finance then schedules the payment in the ERP.",
  "document": {
    "filename": "AP-SOP.pdf",
    "mediaType": "application/pdf",
    "data": "<base64>"
  },
  "volumetrics": { "minutesPerRun": 25, "runsPerMonth": 400, "basis": "business" },
  "options": { "projectId": "…" }
}
```

| Field | Required | Notes |
|---|---|---|
| `description` | One of these two | Prose. Up to 100,000 characters. |
| `document` | One of these two | Base64. Up to 10 MB decoded. |
| `name` | No | Names the process and the resulting diagram. |
| `volumetrics` | No | See **Volumetrics** below. |
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

## Polling

`GET /process-map/{jobId}` every **5 seconds**. A typical run completes in
**30–120 seconds**.

```json
{ "jobId": "cm…", "status": "running", "stage": "planning", "pollAfterSeconds": 5 }
```

`status` is one of `queued`, `running`, `succeeded`, `failed`. `stage` is a
progress hint — `reading`, `planning`, `shaping`, `saving` — suitable for showing
someone who is waiting, but not something to branch on.

A job belonging to another key returns **404, not 403**. We will not confirm that
somebody else's job exists.

---

## The result

```json
{
  "jobId": "cm…",
  "status": "succeeded",
  "durationMs": 41230,
  "model": "claude-haiku-4-5",

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
    "pdfUrl": "https://…/artifact/diagram.pdf",
    "svgUrl": "https://…/artifact/diagram.svg",
    "bpmnXmlUrl": "https://…/artifact/diagram.bpmn"
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

## Artifacts

Each is fetched with the same key as everything else:

```bash
curl -H "X-Api-Key: dgxk_…" \
  https://app.diagramatix.com.au/api/public/v1/process-map/{jobId}/artifact/diagram.pdf \
  -o process.pdf
```

| Artifact | Type | Use |
|---|---|---|
| `diagram.pdf` | `application/pdf` | Drop into a report. |
| `diagram.svg` | `image/svg+xml` | Embed in a web page; scales cleanly. |
| `diagram.bpmn` | `application/xml` | Standard BPMN 2.0 with layout. Open in any BPMN tool, or render it yourself. |

**On fidelity, plainly:** the PDF and SVG come from a server-side renderer.
Shapes, pools, lanes, labels, connectors and colours are accurate; some event and
task markers are simplified relative to the full editor. If the rendering will be
put in front of your customers and must match Diagramatix exactly, use
`diagram.bpmn` and render it yourself, or link to the diagram.

---

## Volumetrics

If you collect effort and frequency, send them:

```json
"volumetrics": { "minutesPerRun": 25, "runsPerMonth": 400, "basis": "business" }
```

They are written onto the generated diagram as both documented values and
simulation parameters, so it opens ready to run rather than needing to be
configured first. The response returns what was derived:

```json
"volumetrics": {
  "minutesPerRun": 25, "runsPerMonth": 400, "basis": "business",
  "derived": {
    "hoursPerMonth": 166.67,
    "hoursPerYear": 2000,
    "fteEquivalent": 1.16,
    "fteHoursPerYear": 1725,
    "minutesPerMonth": 9450,
    "interarrivalMinutes": 23.63
  },
  "notes": ["25 minutes per run was split equally across 7 activities (3.57 each). That is an assumption, not a measurement…"]
}
```

Two things stated rather than assumed:

- **`basis`** decides what a month means. `business` is 21 days × 7.5 hours;
  `calendar` is 24/7. The minutes used and the resulting interarrival time are
  both returned, so the assumption is visible.
- **`fteHoursPerYear`** is returned alongside `fteEquivalent`, because an FTE
  figure without its divisor cannot be checked.

A single total spread evenly across activities is an approximation. The values
are marked as derived on the diagram, and the `notes` say so — we would rather
you knew than have a tidy number you cannot trace.

*Proposed for a later version: per-activity effort, so a caller who has better
data than one aggregate can supply it.*

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

## Limits

| | Default |
|---|---|
| Requests per minute | 30 |
| Process maps per day | 50 |
| Document size | 10 MB decoded |
| Description length | 100,000 characters |

Per-key values are returned by `whoami` and can be agreed differently.

Rate limits return `429` with a `Retry-After` header. Polling an existing job is
counted separately from submitting new work, so checking on a run never consumes
the allowance for starting one.

---

## Data handling

| | |
|---|---|
| **Description** | Stored on the generated diagram, where your customer can see it and it is deleted with the diagram. |
| **Document** | **Not retained.** Only its size and a SHA-256 hash are kept. |
| **Always kept** | Sizes, hashes, status, timing and error codes, for troubleshooting. |
| **Generated diagram** | Stored in your organisation's tenancy, under your control. |

There is one exception, and it is deliberate and time-boxed. During an agreed
**integration testing phase**, request and response bodies and the uploaded
document are retained so that a failure can be diagnosed from what was actually
sent. That phase carries an agreed end date, after which the captured content is
purged — and moving the key to live purges it immediately rather than waiting for
the date. `whoami` reports whether a key is currently retaining request data, so
you can always tell.

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
        "volumetrics": { "minutesPerRun": 25, "runsPerMonth": 400 }
      }'
# → 202 { "jobId": "cm…", "pollAfterSeconds": 5 }

# 2. Poll every 5s
curl -H "X-Api-Key: dgxk_…" \
  https://app.diagramatix.com.au/api/public/v1/process-map/cm…
# → { "status": "running", "stage": "planning" }
# → { "status": "succeeded", "activities": [...], "pools": [...], "artifacts": {...} }

# 3. Fetch the diagram
curl -H "X-Api-Key: dgxk_…" \
  https://app.diagramatix.com.au/api/public/v1/process-map/cm…/artifact/diagram.pdf \
  -o process.pdf
```

---

## Known limitations

Stated up front rather than discovered later.

1. **A thin description produces a thin model.** If the input does not say who
   performs each step, everything lands in one lane. The `single_lane` warning
   tells you this has happened; asking for more detail at that point is the
   highest-value thing a calling application can do.
2. **Rendering is simplified** relative to the Diagramatix editor — see
   **Artifacts** above.
3. **One document per request.** A process described across several files must be
   combined before sending.
4. **Base64 in JSON caps at 10 MB decoded.** A large scanned document exceeds
   this. A multipart or pre-signed upload is proposed for a later version.
5. **The run is asynchronous with no callback.** Polling is the only completion
   mechanism in this version. A webhook is proposed for a later version if it
   would be useful.

---

## Questions for review

We would particularly welcome a view on:

- Whether the **activity shape** carries what you need. Systems, inputs, outputs
  and decisions are included because a structural analysis usually wants them —
  but if something is missing, adding it now is cheap.
- Whether **polling** is acceptable, or a **completion webhook** would materially
  simplify your side.
- Whether **per-activity effort** would be used if offered, or whether one
  aggregate is the realistic input.
- Whether the **PDF fidelity** is sufficient for your use, or whether you would
  render from the BPMN XML.
