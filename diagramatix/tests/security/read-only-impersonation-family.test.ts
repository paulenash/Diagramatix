/**
 * T4537-T4540 — SEC-31 / SEC-32 / SEC-33 / SEC-34 / SEC-38 / ARCH-01.
 *
 * One defect wearing five hats. A SuperAdmin can view another user's account in
 * read-only "view" mode; any write made in that mode is attributed to the user
 * being viewed, which is the one thing the mode exists to prevent. The check
 * that stops it was opt-in, so whether a route had it came down to whether its
 * author remembered — and 149 of the 245 mutating handlers did not.
 *
 * The fix is a shared wrapper (app/lib/routeGuard.ts) plus the routes the audit
 * named: SOP documents and templates, project renumber, bundle publish,
 * simulation adopt, and AI model Compare. SEC-33 adds the ordering half — an
 * anonymous caller must not be able to make the server buffer a multipart
 * upload before it answers 401.
 *
 * The wrapper is tested for real (mocked session + cookie jar, no DB); the
 * route wiring is pinned at source level, because each of those handlers needs
 * a populated multi-tenant database to reach end to end and what regresses is
 * whether the guard is there and where it sits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { signValue } from "@/app/lib/crypto/signedValue";
import { IMPERSONATE_COOKIE, IMPERSONATE_MODE_COOKIE, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { contentLengthError, MAX_UPLOAD_BYTES } from "@/app/lib/uploadLimit";

process.env.AUTH_SECRET = process.env.AUTH_SECRET || "test-secret-at-least-thirty-two-chars-000";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// ── the mocked request context ──────────────────────────────────────────────
// The cookies are HMAC-signed at rest (SEC-17), so the fake jar signs them the
// way the impersonate route does — an unsigned "edit" must not unlock writes.
const SIGNED = new Set([IMPERSONATE_COOKIE, IMPERSONATE_MODE_COOKIE]);
let jar: Record<string, string> = {};
let session: unknown = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (n: string) => (n in jar ? { value: jar[n] } : undefined),
  }),
}));
vi.mock("@/auth", () => ({ auth: async () => session }));

const { blockReadOnlyImpersonation, guardProjectRoute, READ_ONLY_MESSAGE } = await import("@/app/lib/routeGuard");

const SUPER_EMAIL = [...SUPERUSER_EMAILS][0];
const superSession = { user: { id: "super-id", email: SUPER_EMAIL } };
const normalSession = { user: { id: "normal-id", email: "normal@diagramatix.test" } };

const setJar = (m: Record<string, string>) => {
  jar = {};
  for (const [k, v] of Object.entries(m)) jar[k] = SIGNED.has(k) ? signValue(v) : v;
};

beforeEach(() => {
  jar = {};
  session = null;
});

describe("T4537 — the shared guard blocks a read-only impersonation write", () => {
  it("refuses with 403 and says why", async () => {
    session = superSession;
    setJar({ [IMPERSONATE_COOKIE]: "victim-id", [IMPERSONATE_MODE_COOKIE]: "view" });
    const res = await blockReadOnlyImpersonation(superSession);
    expect(res, "a read-only impersonation write must be refused").not.toBeNull();
    expect(res!.status).toBe(403);
    expect(await res!.json()).toEqual({ error: READ_ONLY_MESSAGE });
  });

  it("lets an ordinary signed-in user through", async () => {
    expect(await blockReadOnlyImpersonation(normalSession)).toBeNull();
  });

  it("lets an admin through in edit mode — support and repair still work", async () => {
    session = superSession;
    setJar({ [IMPERSONATE_COOKIE]: "victim-id", [IMPERSONATE_MODE_COOKIE]: "edit" });
    expect(await blockReadOnlyImpersonation(superSession)).toBeNull();
  });

  it("ignores the cookie for a non-superuser, who cannot impersonate at all", async () => {
    setJar({ [IMPERSONATE_COOKIE]: "victim-id", [IMPERSONATE_MODE_COOKIE]: "view" });
    expect(await blockReadOnlyImpersonation(normalSession)).toBeNull();
  });
});

describe("T4538 — the project wrapper decides before it does any work", () => {
  it("refuses a mutating call without reaching the database", async () => {
    // The project id is deliberately nonsense: if the guard consulted the DB
    // first this would surface as 404, not as the read-only 403.
    session = superSession;
    setJar({ [IMPERSONATE_COOKIE]: "victim-id", [IMPERSONATE_MODE_COOKIE]: "view" });
    const g = await guardProjectRoute("no-such-project", "edit", { mutate: true });
    expect(g.error).not.toBeNull();
    expect(g.error!.status).toBe(403);
    expect(await g.error!.json()).toEqual({ error: READ_ONLY_MESSAGE });
    expect(g.ctx).toBeNull();
  });

  it("does not block a read — view-only impersonation is for viewing", async () => {
    session = superSession;
    setJar({ [IMPERSONATE_COOKIE]: "victim-id", [IMPERSONATE_MODE_COOKIE]: "view" });
    const g = await guardProjectRoute("no-such-project", "view", { mutate: false });
    // It proceeds into the real access check and fails there on the bogus id.
    // What matters is that the refusal is NOT the read-only one.
    expect(g.error).not.toBeNull();
    expect(await g.error!.json()).not.toEqual({ error: READ_ONLY_MESSAGE });
  });
});

describe("T4539 — SEC-33: authenticate before buffering the body", () => {
  it("refuses an oversized request from its declared length", () => {
    expect(contentLengthError({ headers: { get: () => String(MAX_UPLOAD_BYTES + 1) } })).toMatch(/too large/i);
    expect(contentLengthError({ headers: { get: () => "100" } }, 50)).toMatch(/too large/i);
  });

  it("accepts a request within the cap", () => {
    expect(contentLengthError({ headers: { get: () => "50" } }, 50)).toBeNull();
    expect(contentLengthError({ headers: { get: () => "0" } })).toBeNull();
  });

  it("allows a chunked request through rather than breaking streaming clients", () => {
    // No Content-Length means the size is genuinely unknown. The per-file cap
    // after parsing still applies, so this narrows the window, not closes it.
    expect(contentLengthError({ headers: { get: () => null } })).toBeNull();
    expect(contentLengthError({ headers: { get: () => "" } })).toBeNull();
    expect(contentLengthError({ headers: { get: () => "not-a-number" } })).toBeNull();
  });

  it("puts the auth, the guard and the size check ahead of formData in sop-templates", () => {
    const src = read("app/api/sop-templates/route.ts");
    const post = src.slice(src.indexOf("export async function POST"));
    const authAt = post.indexOf("await auth()");
    const guardAt = post.indexOf("blockReadOnlyImpersonation");
    const sizeAt = post.indexOf("contentLengthError");
    const formAt = post.indexOf("req.formData()");
    expect(authAt, "POST must authenticate").toBeGreaterThan(-1);
    expect(formAt, "POST still parses a form").toBeGreaterThan(-1);
    expect(authAt, "401 must be decided before the body is buffered").toBeLessThan(formAt);
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(formAt);
    expect(sizeAt).toBeGreaterThan(-1);
    expect(sizeAt).toBeLessThan(formAt);
  });
});

describe("T4540 — the routes the audit named now carry the guard", () => {
  // `where` says which side of the handler the call must be on. "inline" = in
  // the handler body itself; "helper" = in the shared guard() the handlers all
  // go through, which is declared above them.
  const cases: Array<[string, string, "inline" | "helper", string]> = [
    ["SEC-31", "app/api/projects/[id]/renumber/route.ts", "inline", "renumbering rewrites every diagram in the project"],
    ["SEC-31", "app/api/bundles/route.ts", "inline", "publishing grants an audience access and emails them"],
    ["SEC-31/34", "app/api/projects/[id]/sop/route.ts", "inline", "generate writes an SOP and the source diagram"],
    ["SEC-34", "app/api/sop/[id]/route.ts", "helper", "PUT rewrites sections, DELETE removes the document"],
    ["SEC-34", "app/api/sop/[id]/regenerate/route.ts", "inline", "regenerate replaces the sections in place"],
    ["SEC-34", "app/api/sop/[id]/undo-regenerate/route.ts", "inline", "undo rewrites the section set"],
    ["SEC-34", "app/api/sop-templates/route.ts", "inline", "creating or defaulting a template"],
    ["SEC-34", "app/api/sop-templates/[id]/route.ts", "helper", "renaming, re-defaulting or deleting a template"],
    ["SEC-32", "app/api/projects/[id]/simulation/adopt/route.ts", "inline", "adopt rewrites every diagram's data jsonb"],
    ["SEC-38", "app/api/ai/generate-bpmn/compare/route.ts", "inline", "Compare creates and overwrites diagrams"],
  ];

  const CALL = /blockReadOnlyImpersonation\(\s*session\s*\)/;

  for (const [id, file, where, why] of cases) {
    it(`${id} — ${file} (${why})`, () => {
      const src = read(file);
      expect(src, "imports the shared guard").toContain('from "@/app/lib/routeGuard"');
      // The CALL, not the import. An import left behind after the call was
      // deleted reads exactly like a guarded route to a `toContain` check.
      expect(src, "and actually calls it").toMatch(CALL);
      const firstHandler = src.search(/export async function (POST|PUT|PATCH|DELETE)/);
      expect(firstHandler, "the file mutates").toBeGreaterThan(-1);
      const callAt = src.search(CALL);
      if (where === "inline") {
        expect(callAt, "the call must be inside the mutating handler, not just imported above it")
          .toBeGreaterThan(firstHandler);
      } else {
        expect(callAt, "the shared guard() helper sits above the handlers").toBeLessThan(firstHandler);
      }
    });
  }

  it("guards BOTH handlers on the Compare route, not just the one that generates", () => {
    // DELETE clears the comparison matrix, which is still a write to the
    // viewed user's diagram.
    const src = read("app/api/ai/generate-bpmn/compare/route.ts");
    const del = src.slice(src.indexOf("export async function DELETE"));
    expect(del).toContain("blockReadOnlyImpersonation");
  });

  it("guards the SOP edit path but leaves reads alone", () => {
    // GET on a SOP is exactly what view-only impersonation is FOR.
    const src = read("app/api/sop/[id]/route.ts");
    expect(src).toContain('if (role === "edit")');
    const get = src.slice(src.indexOf("export async function GET"), src.indexOf("export async function PUT"));
    expect(get, "the read path must not be blocked").not.toContain("blockReadOnlyImpersonation");
  });
});
