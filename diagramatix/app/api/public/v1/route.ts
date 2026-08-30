/**
 * GET /api/public/v1 — the contract, in one request.
 *
 * A partner integrating against this should not have to ask us what the shapes
 * are, and a docs page that lives beside the code goes stale slower than one that
 * lives in a wiki. Unauthenticated on purpose: there is nothing here a key would
 * protect, and requiring one to read the documentation is the kind of friction
 * that produces a support email instead of an integration.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const base = `${new URL(req.url).origin}/api/public/v1`;

  return NextResponse.json({
    name: "Diagramatix Process API",
    version: "v1",
    description:
      "Send a description of a business process and/or a document describing one; get back its pools and lanes, an ordered list of activities, and a rendered diagram.",

    authentication: {
      how: "Send your key in an X-Api-Key header, or as Authorization: Bearer <key>.",
      note: "A key is bound to one organisation and one service account. It cannot choose an organisation, a user or a model — those are determined by the key, and sending them is a 400 rather than being ignored.",
    },

    endpoints: [
      { method: "GET", path: `${base}/whoami`, does: "Confirm a key works. Does no work and costs nothing." },
      { method: "POST", path: `${base}/process-map`, does: "Submit a process. Returns 202 with a jobId." },
      { method: "GET", path: `${base}/process-map/{jobId}`, does: "Poll. Returns the result once status is succeeded." },
      { method: "GET", path: `${base}/process-map/{jobId}/artifact/diagram.pdf`, does: "The rendered diagram." },
      { method: "GET", path: `${base}/process-map/{jobId}/artifact/diagram.svg`, does: "The same rendering as SVG." },
      { method: "GET", path: `${base}/process-map/{jobId}/artifact/diagram.bpmn`, does: "Standard BPMN 2.0 XML, if you would rather render it yourself." },
    ],

    request: {
      contentType: "application/json",
      fields: {
        name: "Optional. Names the process and the diagram.",
        description: "Prose describing the process. This or `document` is required.",
        document: "Optional. { filename, mediaType, data } where data is base64. PDF, Word .docx, plain text, or an image of a process. ONE document only — sending two is a 400 rather than a silent drop.",
        volumetrics: "Optional. { minutesPerRun, runsPerMonth, basis: 'business' | 'calendar' }. Written onto the diagram so it opens with a runnable simulation.",
        "options.projectId": "Optional. An existing project of yours to add the diagram to.",
      },
      limits: {
        document: "10 MB decoded",
        description: "100,000 characters",
      },
      idempotency:
        "Send an Idempotency-Key header. A repeat with the same key returns the original jobId instead of starting a second run — safe to retry after a dropped connection.",
    },

    polling: {
      interval: "Every 5 seconds. A typical run takes 30–120 seconds.",
      statuses: ["queued", "running", "succeeded", "failed"],
      retry:
        "A `worker_lost` failure means the run was interrupted rather than rejected. Submit it again.",
    },

    response: {
      diagram: "id, name, projectId, deepLink, elementCount, connectorCount",
      pools: "Each with its lanes nested. `external: true` marks another party or an IT system.",
      activities: "Ordered from 1, each with its pool, lane, task type, systems, inputs, outputs and any decision that follows it.",
      decisions: "The gateways, with their branches.",
      handoffs: "Where work passes between roles.",
      warnings: "Things worth knowing — e.g. `single_lane`, meaning the description never said who does what, so everything landed in one lane.",
      artifacts: "URLs for the PDF, SVG and BPMN XML. A null means that artifact was not produced, so you need not request it to find out.",
    },

    errors: {
      shape: '{ "error": { "code": "…", "message": "…" }, "ref": "a1b2c3d4" }',
      ref: "Every response carries a ref, in the body and in an X-Diagramatix-Request-Id header. Quote it and we can find the exact call.",
      codes: [
        "missing_input", "unsupported_media_type", "payload_too_large", "invalid_key",
        "key_revoked", "scope_denied", "rate_limited", "quota_exceeded",
        "org_policy_ai_disabled", "ai_unavailable", "ai_plan_failed", "element_limit",
        "render_failed", "worker_lost", "not_found", "bad_request", "server_error",
      ],
      notFound:
        "A job belonging to another key is 404, not 403 — we will not confirm that somebody else's job exists.",
    },

    dataHandling: {
      description: "Stored on the generated diagram, where your customer can see it and delete it with the diagram.",
      document:
        "Not retained, unless your key is in a time-boxed testing phase agreed with us. In that phase it is kept until the agreed date and purged when the key goes live.",
      always: "Sizes, hashes, status, timing and error codes are kept for troubleshooting.",
    },

    fidelity:
      "The PDF is produced by a simplified renderer: shapes, pools, lanes, labels and connectors are accurate; some event and task markers are approximate. Use diagram.bpmn if you need to render it exactly.",
  });
}
