/**
 * T4534-T4536 — every mutating API route either blocks read-only impersonation
 * or is on a reviewed list saying why it does not have to.
 *
 * ARCH-01: the check was opt-in and missing from 149 of the 245 mutating
 * handlers, and every new route re-flipped the coin. A blanket "every route
 * must guard" assertion would have failed on the day it was written and been
 * deleted, so this is a RATCHET instead: the list below is the debt as it stood
 * when the guard went in, and it may only ever get shorter.
 *
 *   • a NEW mutating route that forgets the guard fails immediately;
 *   • fixing a listed route fails until its line is deleted, so the list cannot
 *     quietly stop reflecting reality;
 *   • a listed route that no longer exists fails, so renames are noticed.
 *
 * "Guarded" means the file reaches `isReadOnlyImpersonation`, directly or
 * through one of the shared wrappers in app/lib/routeGuard.ts. That is a source
 * check, not a behavioural one — behaviour is covered by
 * tests/security/wave-g-access-control.test.ts and the per-fix tests.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const API_DIR = join(process.cwd(), "app", "api");

function routeFiles(dir: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? prefix + "/" + e.name : e.name;
    if (e.isDirectory()) out.push(...routeFiles(join(dir, e.name), rel));
    else if (e.name === "route.ts") out.push(rel);
  }
  return out;
}

const MUTATING = /export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE)/;
const GUARDED = /isReadOnlyImpersonation|blockReadOnlyImpersonation|guardProjectRoute|guardOrgRoute|guardProject|guardOrg/;
/** A route that never resolves a user session has no impersonation to block. */
const AUTHENTICATES = /\bawait auth\(\)/;

/**
 * Reviewed exemptions. Each is a machine or anonymous caller — a Stripe
 * webhook, a cron key, a mining ingest key, a signed-out self-service form —
 * with no session to impersonate, plus the one route that must stay unguarded
 * on purpose.
 */
const EXEMPT: Record<string, string> = {
  "auth/forgot-password/route.ts": "anonymous self-service; no session exists",
  "auth/reset-password/route.ts": "anonymous, reset-token authenticated",
  "register/route.ts": "anonymous sign-up; there is no session yet",
  "stripe/webhook/route.ts": "Stripe-signed machine caller, no user session",
  "cron/review-due/route.ts": "CRON_SECRET machine caller, no user session",
  "mining/poll/route.ts": "X-Cron-Key machine caller, no user session",
  "mining/ingest/[sourceId]/route.ts": "per-source ingest key; no user session",
  "admin/impersonate/route.ts":
    "MUST stay unguarded: it is how an admin enters and LEAVES view-only mode. Guarding it would trap them in read-only with no way out.",
};

/**
 * The debt, frozen. Delete a line when you add the guard to that route — the
 * suite fails until you do, which is the point.
 */
const KNOWN_UNGUARDED: string[] = [
  "account/route.ts",
  "ai/speak/route.ts",
  "admin/ai-model/route.ts",
  "admin/ai-rates/route.ts",
  "admin/api-harness/bundle/route.ts",
  "admin/api-harness/callback/route.ts",
  "admin/api-harness/cases/route.ts",
  "admin/api-harness/history/route.ts",
  "admin/api-harness/run/route.ts",
  "admin/api-harness/sops/route.ts",
  "admin/archimate-icon-buffers/route.ts",
  "admin/archimate-icon-library/[id]/route.ts",
  "admin/archimate-icon-library/route.ts",
  "admin/archimate-icon-library/vectorize/route.ts",
  "admin/archimate-icons-custom/route.ts",
  "admin/archimate-icons/route.ts",
  "admin/database/route.ts",
  "admin/documents/[collection]/restore/route.ts",
  "admin/documents/[collection]/route.ts",
  "admin/feature-availability/route.ts",
  "admin/feature-colors/route.ts",
  "admin/features/publish/route.ts",
  "admin/features/route.ts",
  "admin/full-backup/route.ts",
  "admin/groups/[id]/route.ts",
  "admin/image-library/repoint/route.ts",
  "admin/import-diagram-bundle/route.ts",
  "admin/intent-keywords/route.ts",
  "admin/md-diagrams/parse/route.ts",
  "admin/md-diagrams/run/route.ts",
  "admin/md-prompts/route.ts",
  "admin/mining-examples/[id]/duplicate/route.ts",
  "admin/mining-examples/[id]/route.ts",
  "admin/mining-examples/capture/route.ts",
  "admin/mining-examples/route.ts",
  "admin/orgs/subscription/route.ts",
  "admin/partner-api/route.ts",
  "admin/partner-keys/route.ts",
  "admin/pcf-colors/route.ts",
  "admin/pcf/import/route.ts",
  "admin/risk-control-examples/[id]/route.ts",
  "admin/risk-control-examples/route.ts",
  "admin/rules-prefs/route.ts",
  "admin/schema-validation/route.ts",
  "admin/simulation-examples/[id]/duplicate/route.ts",
  "admin/simulation-examples/[id]/route.ts",
  "admin/simulation-examples/capture/route.ts",
  "admin/simulation-examples/route.ts",
  "admin/subscriptions/route.ts",
  "admin/support-clone-diagram/route.ts",
  "admin/templates/regenerate-thumbnails/route.ts",
  "admin/user-guide/restore/route.ts",
  "admin/user-guide/route.ts",
  "admin/users/[id]/comp/route.ts",
  "admin/users/[id]/features/route.ts",
  "admin/users/[id]/org-role/route.ts",
  "admin/users/[id]/route.ts",
  "admin/users/[id]/subscription/route.ts",
  "admin/value-chain-library/route.ts",
  "ai/audio/refine-transcript/route.ts",
  "ai/audio/transcribe/route.ts",
  "ai/bpmn/apply-layout/route.ts",
  "ai/bpmn/plan/route.ts",
  "ai/bpmn/refine-questions/route.ts",
  "ai/command/route.ts",
  "ai/dictation/commands/route.ts",
  "ai/dictation/token/route.ts",
  "ai/dictation/usage/route.ts",
  "ai/epc-to-bpmn/refine/route.ts",
  "ai/epc/apply-layout/route.ts",
  "ai/epc/plan/route.ts",
  "ai/flowchart-to-bpmn/refine/route.ts",
  "ai/flowchart/apply-layout/route.ts",
  "ai/flowchart/plan/route.ts",
  "ai/generate-bpmn/export-prompt/route.ts",
  "ai/generate-bpmn/route.ts",
  "ai/generate-diagram/route.ts",
  "ai/staff-narrative/route.ts",
  "backup/route.ts",
  "bpmn-rules/route.ts",
  "bubble-helps/global/route.ts",
  "bubble-helps/route.ts",
  "bundles/[id]/archive/route.ts",
  "bundles/preview/route.ts",
  "collab/flush/route.ts",
  "collab/token/route.ts",
  "diagram-type-styles/route.ts",
  "diagram-type-styles/sort-order/route.ts",
  "diagrams/[id]/feedback/[fid]/route.ts",
  "diagrams/[id]/feedback/route.ts",
  "diagrams/[id]/presence/route.ts",
  "diagrams/diff/route.ts",
  "diagrams/diff/runs/[runId]/route.ts",
  "diagrams/diff/runs/route.ts",
  "groups/[id]/members/[userId]/route.ts",
  "groups/[id]/members/route.ts",
  "groups/[id]/route.ts",
  "groups/[id]/transfer/[transferId]/route.ts",
  "groups/[id]/transfer/route.ts",
  "groups/route.ts",
  "help/images/[id]/route.ts",
  "help/images/route.ts",
  "microsoft/disconnect/route.ts",
  "notifications/[id]/read/route.ts",
  "notifications/mark-all-read/route.ts",
  "org-admin/backup/route.ts",
  "orgs/[id]/compliance/runs/[runId]/route.ts",
  "orgs/[id]/pcf/[frameworkId]/compose/route.ts",
  "orgs/[id]/pcf/[frameworkId]/nodes/[nodeId]/route.ts",
  "orgs/[id]/pcf/[frameworkId]/nodes/route.ts",
  "orgs/[id]/pcf/[frameworkId]/route.ts",
  "orgs/[id]/pcf/[frameworkId]/upgrade/route.ts",
  "orgs/[id]/pcf/route.ts",
  "orgs/[id]/route.ts",
  "orgs/route.ts",
  "projects/[id]/mining/runs/[runId]/validate/route.ts",
  "projects/[id]/pcf/decompose-folder/route.ts",
  "projects/[id]/pcf/decompose/route.ts",
  "projects/[id]/pcf/resolve/route.ts",
  "projects/[id]/simulation/studies/[studyId]/assess/route.ts",
  "projects/[id]/simulation/studies/[studyId]/next-steps/route.ts",
  "prompts/[id]/used/route.ts",
  "reviews/[id]/close/route.ts",
  "reviews/[id]/resubmit/route.ts",
  "reviews/[id]/status/route.ts",
  "reviews/route.ts",
  "scanner-rules/route.ts",
  "sharepoint/upload/route.ts",
  "stripe/checkout/route.ts",
  "stripe/portal/route.ts",
  "support/diagram/route.ts",
  "video/transcode/route.ts",
];

describe("T4534 — the mutating-route guard ratchet", () => {
  const files = routeFiles(API_DIR);
  const mutating = files.filter((f) => MUTATING.test(readFileSync(join(API_DIR, f), "utf8")));

  it("finds the route tree at all", () => {
    // Without this, a wrong path would make every assertion below pass vacuously.
    expect(files.length).toBeGreaterThan(300);
    expect(mutating.length).toBeGreaterThan(200);
  });

  it("has no mutating route that is neither guarded, exempt nor listed", () => {
    const missing = mutating.filter(
      (f) =>
        !GUARDED.test(readFileSync(join(API_DIR, f), "utf8")) &&
        !(f in EXEMPT) &&
        !KNOWN_UNGUARDED.includes(f),
    );
    expect(
      missing,
      "a new mutating route must block read-only impersonation (app/lib/routeGuard.ts), or be added to EXEMPT with a reason",
    ).toEqual([]);
  });

  it("lists nothing that is already guarded — the list only shrinks", () => {
    const fixed = KNOWN_UNGUARDED.filter(
      (f) => mutating.includes(f) && GUARDED.test(readFileSync(join(API_DIR, f), "utf8")),
    );
    expect(fixed, "these are guarded now — delete them from KNOWN_UNGUARDED").toEqual([]);
  });

  it("lists nothing that has gone away", () => {
    expect(KNOWN_UNGUARDED.filter((f) => !mutating.includes(f)), "stale entries").toEqual([]);
    expect(Object.keys(EXEMPT).filter((f) => !mutating.includes(f)), "stale exemptions").toEqual([]);
  });

  it("says out loud how much debt is left", () => {
    // A number that has to be edited down deliberately, so the trend is visible
    // in the diff rather than buried in a list of 131 paths.
    expect(KNOWN_UNGUARDED.length).toBe(132);
  });
});

describe("T4535 — the exemptions are exemptions for the stated reason", () => {
  const files = routeFiles(API_DIR);

  it("every session-less exemption really has no session", () => {
    // If one of these grows an auth() call it is no longer a machine caller and
    // has to be guarded like the rest.
    const withSession = Object.keys(EXEMPT)
      .filter((f) => f !== "admin/impersonate/route.ts")
      .filter((f) => AUTHENTICATES.test(readFileSync(join(API_DIR, f), "utf8")));
    expect(withSession, "these now resolve a user session — guard them").toEqual([]);
  });

  it("gives a real reason for each", () => {
    expect(files.length).toBeGreaterThan(0);
    for (const [file, why] of Object.entries(EXEMPT)) {
      expect(why.length, file + " needs a real reason").toBeGreaterThan(20);
    }
  });
});

describe("T4536 — the shared wrapper is the one place the ordering lives", () => {
  const guard = readFileSync(join(process.cwd(), "app", "lib", "routeGuard.ts"), "utf8");

  it("blocks before it does any work", () => {
    // The 403 is decided from the session + cookie jar alone, with no DB read
    // and no body parse ahead of it.
    expect(guard).toContain("isReadOnlyImpersonation(session, jar)");
    expect(guard).toContain("readOnlyResponse()");
    expect(guard).toContain("status: 403");
  });

  it("is what the Risk & Control guards now call, rather than a second copy", () => {
    const routeAuth = readFileSync(join(process.cwd(), "app", "lib", "riskControls", "routeAuth.ts"), "utf8");
    expect(routeAuth).toContain("guardOrgRoute");
    expect(routeAuth).toContain("guardProjectRoute");
    // Not "does not contain that exact call" — a second copy could be spelled
    // any number of ways. It must not reach the primitive at all.
    expect(routeAuth, "the duplicate implementation is gone").not.toContain("isReadOnlyImpersonation");
    expect(routeAuth, "and it no longer needs the module the primitive lives in")
      .not.toContain('from "@/app/lib/superuser"');
  });

  it("gates the feature by parameter, not by hard-coding riskControl", () => {
    expect(guard).toContain("feature?: string");
    // Comments may name it; the CODE must not — that was the thing that kept
    // the working guard locked inside the Risk & Control tree.
    expect(guard).not.toMatch(/gateFeature\([^)]*"riskControl"/);
    expect(guard).not.toMatch(/feature:\s*"riskControl"/);
  });
});
