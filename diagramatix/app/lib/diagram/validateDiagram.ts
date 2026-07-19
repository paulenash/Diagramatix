/**
 * Ingress validation helpers for the persisted Diagram JSON.
 *
 * Runs the parallel Zod schema (diagramSchema.ts), and on failure records each
 * distinct problem in `SchemaValidationIssue` (deduped by signature, rising
 * `count`/`lastSeen`) + emits a `[schema-validate]` log line for external
 * alerting. The DB write is BEST-EFFORT and fully swallowed — validation must
 * never disturb the request. Returns `{ ok }`; the CALLER decides whether to
 * reject (untrusted imports/restore, Phase 2) or ignore (save hot path, always
 * log-only — a bad save is logged and still written, never lost).
 */
import { createHash } from "node:crypto";
import type { ZodType } from "zod";
import { prisma } from "@/app/lib/db";
import { diagramDataSchema, exportEnvelopeSchema } from "./diagramSchema";

export type ValidateMode = "log" | "reject";
export interface ValidateOpts { route: string; diagramId?: string | null; schemaVersion?: string | null; mode?: ValidateMode; }
export interface ValidateResult { ok: boolean; issueCount: number; }

const MAX_ISSUES = 25; // cap so a pathological payload can't storm the log/table

// Normalise ids out of a message so all instances of a problem share one row.
const normalise = (m: string) => m.replace(/[A-Za-z0-9_-]{16,}/g, "<id>");
const sign = (route: string, path: string, msg: string) =>
  createHash("sha1").update(`${route}|${path}|${normalise(msg)}`).digest("hex");

async function record(issues: { path: string; message: string }[], opts: ValidateOpts): Promise<void> {
  const seen = new Set<string>();
  for (const { path, message } of issues.slice(0, MAX_ISSUES)) {
    const signature = sign(opts.route, path, message);
    if (seen.has(signature)) continue; // collapse within one payload
    seen.add(signature);
    // eslint-disable-next-line no-console
    console.warn(`[schema-validate] ${JSON.stringify({ route: opts.route, diagramId: opts.diagramId ?? null, schemaVersion: opts.schemaVersion ?? null, path, message })}`);
    try {
      await prisma.schemaValidationIssue.upsert({
        where: { signature },
        create: { signature, route: opts.route, diagramId: opts.diagramId ?? null, schemaVersion: opts.schemaVersion ?? null, path, message },
        update: { count: { increment: 1 }, message, diagramId: opts.diagramId ?? null, schemaVersion: opts.schemaVersion ?? null, resolved: false },
      });
    } catch { /* observability only — never disturb the request */ }
  }
}

async function run(schema: ZodType, data: unknown, opts: ValidateOpts): Promise<ValidateResult> {
  const res = schema.safeParse(data);
  if (res.success) return { ok: true, issueCount: 0 };
  const issues = res.error.issues.map((i) => ({ path: i.path.join(".") || "(root)", message: i.message }));
  await record(issues, opts);
  return { ok: false, issueCount: issues.length };
}

/** Validate a persisted Diagram BODY (elements/connectors/viewport + metadata). */
export function validateDiagramData(data: unknown, opts: ValidateOpts): Promise<ValidateResult> {
  return run(diagramDataSchema, data, opts);
}

/** Validate a full export/import ENVELOPE (schemaVersion + diagrams[].data …). */
export function validateExportEnvelope(data: unknown, opts: ValidateOpts): Promise<ValidateResult> {
  return run(exportEnvelopeSchema, data, opts);
}
