import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A click inside an element must select the ELEMENT, not the tether crossing it.
 *
 * Paul reported this three times over two days, most recently 2026-09-04:
 * "Selecting an element still selects the association virtual connector under
 * the element instead of the element itself."
 *
 * It had been "fixed" once already. The fix put a <mask> over the connector's
 * invisible hit path, painting black rectangles across the source and target
 * elements — which is correct-looking, renders identically, and DOES NOTHING,
 * because Blink does not apply `mask` to hit-testing. Only `clip-path` clips
 * pointer events. So the guard shipped, looked done, and changed nothing.
 *
 * This is a source-text tripwire, not a behavioural test, and deliberately so:
 * the defect is not observable in jsdom (which does no hit-testing at all), and
 * that is precisely why it survived. What can be checked is the mechanism — that
 * the hit area is CLIPPED rather than MASKED — which is the single fact whose
 * absence caused the bug. The behaviour belongs in the Playwright suite.
 */
const SRC = fs.readFileSync(
  path.join(process.cwd(), "app", "components", "canvas", "ConnectorRenderer.tsx"),
  "utf8",
);

describe("association hit area is clipped, not masked", () => {
  it("T3228 the hit path uses clip-path, which affects pointer events", () => {
    expect(SRC, "the connector hit area must be clipped").toMatch(/clipPath=\{[^}]*assoc-hit-clip/);
    expect(SRC).toMatch(/<clipPath id=\{clipId\}/);
  });

  it("T3229 no mask is used for the hit area — a mask does not clip pointer events", () => {
    // The exact mistake, named so it cannot be reintroduced by someone reaching
    // for the more familiar primitive.
    expect(SRC, "a <mask> renders the same and clips nothing").not.toMatch(/assoc-hit-mask/);
    expect(SRC).not.toMatch(/mask=\{[^}]*assoc-hit/);
  });

  it("T3230 the clip is an even-odd path, so the element boxes are real holes", () => {
    // Without evenodd the subpaths union into one solid region and the whole
    // hit area is clipped away — the connector would become unclickable
    // everywhere, which is the opposite failure and just as wrong.
    expect(SRC).toMatch(/clipRule="evenodd"/);
    // The outer rectangle has to be larger than any diagram, or the hit area is
    // clipped at its edge rather than only at the element boxes.
    expect(SRC).toMatch(/rect\(-100000, -100000, 200000, 200000\)/);
  });
});
