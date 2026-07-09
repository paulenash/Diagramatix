import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./_user";

/**
 * DiagramatixMINER Examples — the sample-catalog journeys the Vitest suite can't
 * reach: real React render + real route handlers over authenticated sessions.
 *
 *  • As a normal user: gallery → Load & open (adopt over HTTP + ?mining deep-link
 *    opens the console), the full route chain (adopt → discover → conformance →
 *    calibrate), the "Create AI reference" button, and that the admin
 *    routes are refused (403).
 *  • As a SuperAdmin: the catalog manager loads, CRUD works (create / publish /
 *    duplicate / delete), and "Save run as example" (capture) works + its button
 *    renders in the console.
 *
 * Requires the mining catalog + a known superadmin seeded in diagramatix_test
 * (scripts/e2e-server.cjs seeds both).
 */

const SLUG = "accounts-payable-invoice-lifecycle";

async function apExampleId(request: { get: (u: string) => Promise<{ ok(): boolean; json(): Promise<{ examples: { id: string; slug: string }[] }> }> }) {
  const res = await request.get("/api/mining-examples");
  expect(res.ok()).toBeTruthy();
  const ex = (await res.json()).examples.find((e) => e.slug === SLUG);
  expect(ex, "seeded AP example present").toBeTruthy();
  return ex!.id;
}

// ── As a normal (non-admin) user — reuses the saved E2E_USER session ──────────
test.describe("DiagramatixMINER Examples — user", () => {
  test("gallery renders + Load & open pre-loads the sample CSV; import creates the run", async ({ page }) => {
    await page.goto("/dashboard/mining-examples");
    await expect(page.getByRole("heading", { name: /DiagramatixMINER Examples/ })).toBeVisible();
    await expect(page.getByText("Accounts Payable — Invoice Lifecycle")).toBeVisible();

    await page.getByRole("button", { name: /Load & open/ }).first().click();
    await page.keyboard.press("Enter").catch(() => {}); // skip the amber intro (also auto-advances)
    // The console opens with the Import panel pre-loaded from the sample CSV —
    // the user confirms the analysis, then imports.
    const importBtn = page.getByRole("button", { name: /Import log/ });
    await expect(importBtn).toBeVisible({ timeout: 25_000 });

    // Three choosable period scenarios are offered; the current month is the default.
    await expect(page.getByText("Choose a scenario to explore")).toBeVisible();
    await expect(page.getByRole("button", { name: "January 2025" })).toBeVisible();
    await expect(page.getByRole("button", { name: "July 2025" })).toBeVisible();
    const runNameInput = page.getByPlaceholder("run name");
    await expect(runNameInput).toHaveValue(/January 2026/);
    // Pick the oldest period → the staged run name switches to it.
    await page.getByRole("button", { name: "January 2025" }).click();
    await expect(runNameInput).toHaveValue(/January 2025/);

    await importBtn.click();
    // After import the run appears (in the runs list + the auto-selected panel).
    await expect(page.getByText("Accounts Payable — January 2025").first()).toBeVisible({ timeout: 25_000 });
  });

  test("every mining route works over an authenticated session (import → calibrate)", async ({ page }) => {
    const id = await apExampleId(page.request);
    const adoptRes = await page.request.post(`/api/mining-examples/${id}/adopt`);
    expect(adoptRes.ok(), `adopt -> ${adoptRes.status()} ${await adoptRes.text()}`).toBeTruthy();
    const { projectId, sampleLog } = await adoptRes.json();
    expect(projectId && sampleLog?.rows?.length).toBeTruthy();

    // Import the sample log to create the run (what the console does on confirm).
    const impRes = await page.request.post(`/api/projects/${projectId}/mining/import`, {
      data: { name: sampleLog.runName ?? "Sample", mapping: sampleLog.mapping, headers: sampleLog.headers, rows: sampleLog.rows },
    });
    expect(impRes.ok(), `import -> ${impRes.status()} ${await impRes.text()}`).toBeTruthy();
    const runId = (await impRes.json()).run.id;

    const runsRes = await page.request.get(`/api/projects/${projectId}/mining/runs`);
    const run = (await runsRes.json()).runs.find((r: { id: string }) => r.id === runId);
    expect(run?.stats?.cases).toBe(200);

    expect((await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/discover`, { data: { edgeThreshold: 0 } })).ok()).toBeTruthy();
    expect((await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/discover-sm`)).ok()).toBeTruthy();

    const refs = (await (await page.request.get(`/api/projects/${projectId}/mining/reference-sms`)).json()).diagrams as { id: string; name: string }[];
    const permissive = refs.find((d) => d.name.includes("Reference") && !d.name.includes("Strict"));
    expect(permissive).toBeTruthy();

    const conf = (await (await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/conformance`, { data: { referenceSmId: permissive!.id } })).json()).conformance;
    expect(conf.totalCases).toBe(200);
    expect(conf.conformingCases).toBe(181);

    const cal = await (await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/calibrate`)).json();
    expect(cal.studyId && cal.diagramId).toBeTruthy();
  });

  test("Create AI reference scaffolds a reference for a run that has none", async ({ page }) => {
    // Discovery is AI-only now — this button calls Claude, so it needs a key.
    // Skip in environments without one (e.g. CI e2e) rather than 503.
    test.skip(!process.env.ANTHROPIC_API_KEY, "Create draft reference uses AI — needs ANTHROPIC_API_KEY");
    // A project + a small imported log → a run with NO reference state machine.
    const projectId = (await (await page.request.post("/api/projects", { data: { name: `Draft Ref ${Date.now()}` } })).json()).id;
    const imp = await page.request.post(`/api/projects/${projectId}/mining/import`, {
      data: {
        name: "tiny log", mapping: { caseId: "case", activity: "act", timestamp: "ts", state: "st" },
        headers: ["case", "act", "ts", "st"],
        rows: [
          ["1", "Open", "2026-01-01T09:00:00Z", "New"], ["1", "Work", "2026-01-01T10:00:00Z", "Doing"], ["1", "Close", "2026-01-01T11:00:00Z", "Done"],
          ["2", "Open", "2026-01-02T09:00:00Z", "New"], ["2", "Close", "2026-01-02T10:00:00Z", "Done"],
        ],
      },
    });
    expect(imp.ok(), `import -> ${imp.status()}`).toBeTruthy();

    await page.goto(`/dashboard?mining=${projectId}&mp=DraftRef`);
    await page.keyboard.press("Enter").catch(() => {});
    await page.getByText("tiny log").click({ timeout: 25_000 });          // select the run

    const btn = page.getByRole("button", { name: /Create AI reference/ });
    await expect(btn).toBeVisible();
    await btn.click();

    // A reference now exists + is selected → the edit link shows and Check is enabled.
    await expect(page.getByText("edit reference →")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Check conformance/ })).toBeEnabled();
  });

  test("admin catalog routes are refused for a non-superuser (403)", async ({ page }) => {
    expect((await page.request.get("/api/admin/mining-examples")).status()).toBe(403);
  });
});

// ── As a SuperAdmin — signs in fresh as the seeded admin account ──────────────
test.describe("DiagramatixMINER Examples — admin", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[type="email"]').fill(E2E_ADMIN.email);
    await page.locator('input[type="password"]').fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("catalog manager loads for a superuser and CRUD works", async ({ page }) => {
    await page.goto("/dashboard/admin/mining-examples");
    await expect(page.getByRole("heading", { name: /DiagramatixMINER Example Catalog/ })).toBeVisible();
    // The row's title is an editable <input>; the slug renders as plain text.
    await expect(page.getByText(SLUG)).toBeVisible();

    // create draft → publish → duplicate → delete both
    const id = (await (await page.request.post("/api/admin/mining-examples", { data: { title: "E2E Draft Example" } })).json()).example.id;
    const pub = await page.request.put(`/api/admin/mining-examples/${id}`, { data: { published: true } });
    expect((await pub.json()).example.published).toBe(true);
    const dupId = (await (await page.request.post(`/api/admin/mining-examples/${id}/duplicate`)).json()).example.id;
    expect((await page.request.delete(`/api/admin/mining-examples/${id}`)).ok()).toBeTruthy();
    expect((await page.request.delete(`/api/admin/mining-examples/${dupId}`)).ok()).toBeTruthy();
  });

  test("Save run as example: capture route works + the button renders in the console", async ({ page }) => {
    const exId = await apExampleId(page.request);
    const adopt = await (await page.request.post(`/api/mining-examples/${exId}/adopt`)).json();

    // The example ships a sample log — import it to create a run to capture.
    const impRes = await page.request.post(`/api/projects/${adopt.projectId}/mining/import`, {
      data: { name: adopt.sampleLog.runName ?? "Sample", mapping: adopt.sampleLog.mapping, headers: adopt.sampleLog.headers, rows: adopt.sampleLog.rows },
    });
    expect(impRes.ok(), `import -> ${impRes.status()}`).toBeTruthy();
    const runId = (await impRes.json()).run.id;

    // capture the run into a new draft catalog entry
    const cap = await page.request.post("/api/admin/mining-examples/capture", { data: { projectId: adopt.projectId, runId, title: `E2E Captured ${Date.now()}` } });
    expect(cap.ok(), `capture -> ${cap.status()} ${await cap.text()}`).toBeTruthy();
    const capId = (await cap.json()).example.id;

    // the admin-only "Save run as example" button renders in the console
    await page.goto(`/dashboard?mining=${adopt.projectId}&mp=Captured`);
    await page.keyboard.press("Enter").catch(() => {});
    await page.getByText("Accounts Payable — January 2026").click({ timeout: 25_000 }); // select the run
    await expect(page.getByText(/Save run as example/)).toBeVisible();

    await page.request.delete(`/api/admin/mining-examples/${capId}`); // cleanup the captured draft
  });
});
