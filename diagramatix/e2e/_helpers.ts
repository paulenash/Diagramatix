import { expect, type Page } from "@playwright/test";

/**
 * Create a BPMN diagram via the API and return its id. Deliberately NOT through
 * the dashboard "New Diagram" modal: the shared e2e account accumulates diagrams
 * across runs, so the dashboard gets slow/cluttered and the modal button becomes
 * intermittently un-clickable (flaky). The editor + canvas journeys only need a
 * diagram to exist — creating it via the API is fast and rock-solid; the real UI
 * is still exercised by opening + driving the editor.
 */
export async function createBpmnDiagram(page: Page, name: string): Promise<string> {
  const res = await page.request.post("/api/diagrams", {
    data: { name: `${name} ${Date.now()}`, type: "bpmn" },
  });
  expect(res.ok(), `create diagram -> ${res.status()}`).toBeTruthy();
  return (await res.json()).id as string;
}

/**
 * Create a diagram of any type pre-seeded with `data` ({ elements, connectors,
 * viewport }) in a single API call, and return its id. Used to set up a known
 * two-element-plus-connector starting state for the move-and-reroute journeys
 * without driving each type's (different) connector-create UI.
 */
export async function createDiagramWithData(
  page: Page,
  name: string,
  type: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
): Promise<string> {
  const res = await page.request.post("/api/diagrams", {
    data: { name: `${name} ${Date.now()}`, type, data },
  });
  if (!res.ok()) throw new Error(`create ${type} diagram -> ${res.status()}: ${await res.text()}`);
  return (await res.json()).id as string;
}

/** Open a diagram's editor and wait for the SVG canvas to render. */
export async function openEditor(page: Page, id: string): Promise<void> {
  await page.goto(`/diagram/${id}`);
  await expect(page.locator("svg[data-canvas]")).toBeVisible({ timeout: 20_000 });
}

/** A located element's bounding box, retrying — boundingBox() can transiently
 *  return null while the editor finishes mounting even after it's "visible". */
export async function boxOf(page: Page, selector: string) {
  const loc = page.locator(selector);
  await expect(loc).toBeVisible();
  let b = await loc.boundingBox();
  for (let i = 0; i < 15 && !b; i++) { await page.waitForTimeout(200); b = await loc.boundingBox(); }
  expect(b, `${selector} should have a bounding box`).not.toBeNull();
  return b!;
}

/** The persisted diagram data ({ elements, connectors, viewport }) via the API. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function diagramData(page: Page, id: string): Promise<any> {
  const res = await page.request.get(`/api/diagrams/${id}`);
  expect(res.ok(), `GET diagram ${id} -> ${res.status()}`).toBeTruthy();
  const d = await res.json();
  return d.data ?? d;
}
