/**
 * Diagnostic probe (NOT part of the suite — run with `npx tsx`).
 *
 * `content-visibility: auto` lets the browser skip rendering off-screen cards.
 * That is the point, but it makes one thing worth proving rather than assuming:
 * the values must still be REACHABLE — readable, focusable, and present after
 * scrolling — or the cure would be worse than the flicker it fixes.
 *
 * Walks the whole list, scrolling top → bottom → top, and checks every input
 * still reports its value at each stage.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill("greg.nash@getai.com.au");
  await page.locator('input[type="password"]').fill("e2e-Admin-Password-123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });

  await page.goto(`${BASE}/dashboard/admin/features`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const read = async () =>
    page.evaluate(() => {
      const S = [...document.querySelectorAll('input[placeholder="Benefit-oriented headline"]')] as HTMLInputElement[];
      const D = [...document.querySelectorAll("textarea")] as HTMLTextAreaElement[];
      return { rows: S.length, empty: S.filter((s, i) => !s.value.trim() || !D[i]?.value.trim()).length };
    });

  const scroller = page.locator("main");
  const height = await scroller.evaluate((el) => el.scrollHeight);
  console.log(`scroll height = ${height.toLocaleString()}px`);

  console.log("at top      :", JSON.stringify(await read()));

  // Scroll all the way down in steps, as a person would.
  for (let y = 0; y < height; y += 800) {
    await scroller.evaluate((el, yy) => el.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  console.log("after ↓ pass:", JSON.stringify(await read()));

  // ...and back up, which is where the flicker was reported.
  for (let y = height; y >= 0; y -= 800) {
    await scroller.evaluate((el, yy) => el.scrollTo(0, yy), y);
    await page.waitForTimeout(60);
  }
  console.log("after ↑ pass:", JSON.stringify(await read()));

  // Find-in-page equivalence: text inside a skipped card must still be findable.
  const found = await page.evaluate(() => {
    const t = [...document.querySelectorAll("textarea")] as HTMLTextAreaElement[];
    return t.some((x) => x.value.includes("discrete-event") || x.value.includes("Event-based engine"));
  });
  console.log("deep card content still reachable:", found);

  await browser.close();
}

main().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });
