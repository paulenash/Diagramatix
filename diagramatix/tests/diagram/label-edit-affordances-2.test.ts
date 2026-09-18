/**
 * Reaching the name editor on things that have no name yet.
 *
 * An element with an empty label has nothing drawn to aim at, so whatever hit
 * target exists for the shape itself is the only way in. Three of them were
 * missing or broken:
 *
 *  - An unlabelled connector's label box does not render at all until the
 *    connector is selected, and the hook that listens for a line double-click
 *    had been declared BELOW that early return. React counts hooks per render,
 *    so selecting the connector changed the count and threw. (My own
 *    regression, shipped in the double-click-to-edit change.)
 *  - A group's interior is deliberately click-through so you can work with the
 *    elements inside it, which left the dashed border as the only target — and
 *    with no name there was no text to aim at either.
 *  - A pool only accepted the gesture in the leftmost 36px, a hardcoded default
 *    that stops being true the moment someone widens the header bar.
 *
 * There is no React renderer in this suite, so these are structural guards on
 * the source. That is a real limitation: they prove the code says the right
 * thing, not that the browser does it. The hook-order guard is the exception —
 * hook order IS a static property, so that one is exact.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const CONNECTOR = read("app", "components", "canvas", "ConnectorRenderer.tsx");
const SYMBOL = read("app", "components", "canvas", "SymbolRenderer.tsx");
const CANVAS = read("app", "components", "canvas", "Canvas.tsx");

/** The body of a top-level function declaration, up to the next one. */
const functionBody = (src: string, name: string): string => {
  const start = src.indexOf(`function ${name}(`);
  expect(start, `no function ${name}`).toBeGreaterThan(-1);
  const after = src.indexOf("\nfunction ", start + 1);
  return src.slice(start, after === -1 ? src.length : after);
};

describe("T4471 — InteractionLabel declares every hook before it can bail", () => {
  const body = functionBody(CONNECTOR, "InteractionLabel");

  it("has early returns, so hook order is not something to be casual about", () => {
    // If this ever stops being true the guard below is vacuous, so assert it.
    expect(body).toMatch(/\breturn null;/);
  });

  it("declares no hook after the first early return", () => {
    const firstBail = body.indexOf("return null;");
    const tail = body.slice(firstBail);
    // Any `useX(` in the tail is a hook that runs on some renders and not
    // others. React throws "Rendered more hooks than during the previous
    // render" the moment the component switches paths — which is what an
    // unlabelled connector does when you click it.
    const late = [...tail.matchAll(/\buse[A-Z]\w*\(/g)].map((m) => m[0]);
    expect(late).toEqual([]);
  });

  it("still listens for a double-click on the connector line", () => {
    // The fix must not have been to delete the feature.
    expect(body).toContain("editRequest");
    expect(body).toContain("setIsEditing(true)");
    const firstBail = body.indexOf("return null;");
    expect(body.indexOf("editRequest === seenEditRequest.current")).toBeLessThan(firstBail);
  });

  it("opens the editor without needing geometry it may not have yet", () => {
    // On the render where the request arrives, the part of the component that
    // computes the label box may not have run. The zoom therefore has to wait
    // for the render after the editor opens.
    expect(body).toContain("labelGeom");
    expect(body).toMatch(/zoomOnOpen/);
  });
});

describe("T4472 — a group with no name can still be reached", () => {
  it("has a hit target on the name strip, not only on the border", () => {
    const body = functionBody(SYMBOL, "GroupShape");
    // The border-only target is the pre-existing one and must stay.
    expect(body).toContain('pointerEvents: "stroke"');
    // The new one: a strip where the name is drawn.
    expect(body).toContain("GROUP_NAME_HIT_W");
    expect(body).toContain('pointerEvents: "auto"');
  });

  it("keeps the interior click-through so the elements inside stay usable", () => {
    const body = functionBody(SYMBOL, "GroupShape");
    // The full-size visible rect must remain inert — a group that swallowed
    // clicks would make everything inside it unselectable.
    expect(body).toMatch(/strokeDasharray="10 3\.5 2 3\.5"[\s\S]{0,120}pointerEvents: "none"/);
  });

  it("keeps the strip narrow rather than taking the whole top band", () => {
    const m = SYMBOL.match(/GROUP_NAME_HIT_W\s*=\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(300);
  });
});

describe("T4473 — a pool's header target follows the header's real width", () => {
  it("reads the stored header width instead of assuming the default", () => {
    // The editor geometry has always read poolHeaderWidth; the hit test had a
    // literal 36. Widen the header and the right-hand part of it went dead.
    //
    // 2026-09-19: the reading moved into app/lib/diagram/containerHeader.ts,
    // which is now the only copy of it (it had been re-derived in five
    // places). The claim is unchanged — the width is READ, never assumed — so
    // this asserts it at its new home, and T4550 covers the rule itself.
    expect(CANVAS).toContain("containerHeaderWidth");
    expect(SYMBOL).toContain("containerHeaderWidth");
    expect(SYMBOL).toMatch(/world\.x > element\.x \+ containerHeaderWidth\(element\)/);
    expect(SYMBOL, "the hardcoded 36 is still the hit test").not.toMatch(
      /world\.x > element\.x \+ 36/,
    );
  });
});

describe("T4474 — no history entry for an edit that never opens", () => {
  it("snapshots only after the types that bail have bailed", () => {
    const body = functionBody(CANVAS, "startEditingLabel");
    const bail = body.indexOf("LABEL_ONLY_ZOOM.has(el.type)) return;");
    const snapshot = body.indexOf("onBeginLabelEdit?.(el.id)");
    expect(bail).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(-1);
    expect(snapshot, "the snapshot runs for types that never open an editor").toBeGreaterThan(bail);
  });
});
