/**
 * Paul, 2026-09-14: "Why do hard refreshes take so long after a deploy?"
 *
 * Three causes, three fixes, each pinned here:
 *  1. /api/health — a DB-pinging readiness probe App Service can wait on
 *     (before: no health path, so traffic rotated when the container was
 *     RUNNING and the first request paid the cold start).
 *  2. The workflow no longer restarts the site a second time, sets the
 *     health path, and its smoke test proves the NEW commit is serving.
 *  3. The dashboard looks each user up once, not four times.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkHealth } from "@/app/lib/health";
import { GET as healthGet } from "@/app/api/health/route";
import { loadDashboardUsers, type DashboardUserRow } from "@/app/lib/dashboard/loadUsers";
import { isProtectedPath } from "@/auth.config";

const root = (...p: string[]) => path.resolve(__dirname, "..", "..", ...p);
const read = (...p: string[]) => fs.readFileSync(root(...p), "utf8");

describe("readiness probe", () => {
  it("T4384 — checkHealth: 200 when the ping resolves, 503 when it rejects or hangs", async () => {
    const ok = await checkHealth(async () => 1, { commit: "abc123", uptimeSec: 12.6 });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, db: "ok", commit: "abc123", uptimeSec: 13 });

    const down = await checkHealth(async () => { throw new Error("ECONNREFUSED"); }, { commit: "abc123" });
    expect(down.status).toBe(503);
    expect(down.body.ok).toBe(false);
    expect(down.body.db).toBe("error");
    expect(down.body.error).toContain("ECONNREFUSED");
    expect(down.body.commit, "the commit is reported even when unhealthy").toBe("abc123");

    // A hung connection must not hold the probe open: App Service treats a
    // slow answer as unhealthy anyway, and we want to say so ourselves.
    const t0 = Date.now();
    const hung = await checkHealth(() => new Promise(() => {}), { timeoutMs: 30 });
    expect(hung.status).toBe(503);
    expect(hung.body.error).toMatch(/timed out after 30 ms/);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it("T4385 — GET /api/health answers 200 against the real database, unauthenticated and uncached", async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe("ok");
    expect(typeof body.commit).toBe("string");
    // Reachable without a session: App Service's probe has none. auth.config's
    // PROTECTED_PREFIXES is the authority (the proxy matcher mirrors it, T-pinned
    // in route-protection.test.ts), and /api/health must not fall under it.
    expect(isProtectedPath("/api/health")).toBe(false);
  });
});

describe("deploy workflow", () => {
  const wf = read("..", ".github", "workflows", "azure-deploy.yml");

  it("T4386 — one restart, a health path, and a smoke test that names the commit", () => {
    // The second stop was the deploy's own doing.
    // A COMMAND, not the comment that explains why it is gone: `^s*az`.
    expect(wf, "no explicit restart after container set").not.toMatch(/^\s*az webapp restart/m);
    expect(wf).toContain("az webapp config container set");

    // The health path is set only when it differs (a config write restarts the site).
    expect(wf).toContain("- name: Ensure the App Service health check path");
    expect(wf).toContain('if [ "$CURRENT" != "/api/health" ]; then');
    expect(wf).toContain('--generic-configurations \'{"healthCheckPath": "/api/health"}\'');

    // The smoke test polls the probe and requires THIS commit in the body.
    expect(wf).toContain('"https://${APP_URL}/api/health"');
    expect(wf).toContain("WANT='\"commit\":\"${{ github.sha }}\"'");
    expect(wf).toContain('grep -qF "$WANT"');
    expect(wf, "the old any-2xx smoke test is gone").not.toContain('"https://${APP_URL}/"');

    // …and the image can only report a commit if the build passes one in.
    expect(wf).toContain("GIT_COMMIT_SHA=${{ github.sha }}");
    const docker = read("Dockerfile");
    expect(docker).toContain("ARG GIT_COMMIT_SHA=");
    expect(docker).toContain("ENV COMMIT_SHA=${GIT_COMMIT_SHA}");
    const route = read("app", "api", "health", "route.ts");
    expect(route).toContain("process.env.COMMIT_SHA");

    // The advertised path must resolve: the workflow's probe target is a real route file.
    expect(fs.existsSync(root("app", "api", "health", "route.ts"))).toBe(true);
  });
});

describe("dashboard user lookups", () => {
  const rows: Record<string, DashboardUserRow> = {
    me: { id: "me", name: "Paul", email: "paul@x", hasChosenTier: true },
    them: { id: "them", name: "Greg", email: "greg@x", hasChosenTier: false },
  };
  const counting = () => {
    const calls: string[] = [];
    const findUser = async (id: string) => { calls.push(id); return rows[id] ?? null; };
    return { calls, findUser };
  };

  it("T4387 — one lookup when not impersonating, two when impersonating, fallback on a stale target", async () => {
    // Not impersonating: the effective user IS the signed-in user — one row serves
    // header, banner and tier flag. The page used to fetch it three times.
    const a = counting();
    const notViewing = await loadDashboardUsers(a.findUser, "me", { effectiveUserId: "me", viewing: false });
    expect(a.calls).toEqual(["me"]);
    expect(notViewing).toEqual({ effectiveUserId: "me", viewing: true && false, effective: rows.me, realHasChosenTier: true });

    // Impersonating: the target's row for the page, the signed-in user's flag
    // for the tier picker — and never the other way round.
    const b = counting();
    const viewing = await loadDashboardUsers(b.findUser, "me", { effectiveUserId: "them", viewing: true });
    expect(b.calls).toEqual(["them", "me"]);
    expect(viewing.effective).toEqual(rows.them);
    expect(viewing.realHasChosenTier, "the SIGNED-IN user's flag, not the target's").toBe(true);

    // Stale cookie: the target is gone — fall back to the signed-in user,
    // report the cookie for deletion, and stop claiming to impersonate.
    const c = counting();
    let cleared = 0;
    const stale = await loadDashboardUsers(c.findUser, "me", { effectiveUserId: "ghost", viewing: true }, () => { cleared++; });
    expect(cleared).toBe(1);
    expect(c.calls).toEqual(["ghost", "me"]);
    expect(stale.viewing).toBe(false);
    expect(stale.effectiveUserId).toBe("me");
    expect(stale.effective).toEqual(rows.me);
  });
});
