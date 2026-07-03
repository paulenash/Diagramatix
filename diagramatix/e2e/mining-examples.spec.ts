import { test, expect } from "@playwright/test";

/**
 * DiagramatixMINER Examples — the sample-catalog journey the Vitest suite can't
 * reach: real React render of the gallery, the adopt route over authenticated
 * HTTP, the ?mining deep-link auto-opening the console, and every mining route
 * handler driven end-to-end (adopt → discover → discover-SM → conformance →
 * calibrate) through a real signed-in session.
 *
 * Requires the mining catalog seeded in diagramatix_test (scripts/e2e-server.cjs
 * seeds it, like subscription levels).
 */

const SLUG = "accounts-payable-invoice-lifecycle";

test.describe("DiagramatixMINER Examples", () => {
  test("gallery renders and Load & open opens the console on the mined run", async ({ page }) => {
    await page.goto("/dashboard/mining-examples");
    await expect(page.getByRole("heading", { name: /DiagramatixMINER Examples/ })).toBeVisible();
    await expect(page.getByText("Accounts Payable — Invoice Lifecycle")).toBeVisible();

    await page.getByRole("button", { name: /Load & open/ }).first().click();

    // The gallery adopts + redirects to /dashboard?mining=…; the dashboard effect
    // opens the ⛏ console. Skip the amber intro (it also auto-advances).
    await page.keyboard.press("Enter").catch(() => {});
    await expect(page.getByText("Accounts Payable — January 2026")).toBeVisible({ timeout: 25_000 });
  });

  test("every mining route works over an authenticated session (adopt → calibrate)", async ({ page }) => {
    // 1) public list
    const listRes = await page.request.get("/api/mining-examples");
    expect(listRes.ok(), `list -> ${listRes.status()}`).toBeTruthy();
    const example = (await listRes.json()).examples.find((e: { slug: string }) => e.slug === SLUG);
    expect(example, "seeded AP example present in gallery").toBeTruthy();

    // 2) adopt → fresh project + a ready run
    const adoptRes = await page.request.post(`/api/mining-examples/${example.id}/adopt`);
    expect(adoptRes.ok(), `adopt -> ${adoptRes.status()} ${await adoptRes.text()}`).toBeTruthy();
    const { projectId, runId } = await adoptRes.json();
    expect(projectId && runId).toBeTruthy();

    // 3) the run is present with its stats
    const runsRes = await page.request.get(`/api/projects/${projectId}/mining/runs`);
    expect(runsRes.ok()).toBeTruthy();
    const run = (await runsRes.json()).runs.find((r: { id: string }) => r.id === runId);
    expect(run?.stats?.cases).toBe(200);

    // 4) discover the BPMN
    const discRes = await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/discover`, { data: { edgeThreshold: 0 } });
    expect(discRes.ok(), `discover -> ${discRes.status()}`).toBeTruthy();

    // 5) discover the candidate state machine
    const smRes = await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/discover-sm`);
    expect(smRes.ok(), `discover-sm -> ${smRes.status()}`).toBeTruthy();

    // 6) the reference picker lists the two adopted references
    const refRes = await page.request.get(`/api/projects/${projectId}/mining/reference-sms`);
    expect(refRes.ok()).toBeTruthy();
    const refs = (await refRes.json()).diagrams as { id: string; name: string }[];
    const permissive = refs.find((d) => d.name.includes("Reference") && !d.name.includes("Strict"));
    expect(permissive, "permissive reference present").toBeTruthy();

    // 7) conformance vs the permissive reference → the fixed oracle (181/200)
    const confRes = await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/conformance`, { data: { referenceSmId: permissive!.id } });
    expect(confRes.ok(), `conformance -> ${confRes.status()}`).toBeTruthy();
    const conf = (await confRes.json()).conformance;
    expect(conf.totalCases).toBe(200);
    expect(conf.conformingCases).toBe(181);

    // 8) calibrate the digital twin → a study to open in the Simulator
    const calRes = await page.request.post(`/api/projects/${projectId}/mining/runs/${runId}/calibrate`);
    expect(calRes.ok(), `calibrate -> ${calRes.status()} ${await calRes.text()}`).toBeTruthy();
    const cal = await calRes.json();
    expect(cal.studyId && cal.diagramId).toBeTruthy();
  });
});
