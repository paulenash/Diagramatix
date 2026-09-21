/**
 * T4636–T4639 — the left-hand pool boundary, and what rises with a dragged pool.
 *
 * Paul, 21 September 2026, three reports in a row:
 *
 *   "I need to now reintroduce the ability to move the left-hand Pool boundary
 *    left and right."   →  "No joy with left boundary move!!"  →  "It's not
 *    selectable?"
 *
 * He was right and I was looking in the wrong place: the reducer had been
 * fixed and tested (T4632), but the GESTURE never reached it. "Pools never
 * move their LEFT boundary" was written into the canvas four separate times —
 * the west edge hit-zone was filtered out in `SymbolRenderer`, again in
 * `Canvas`, the w/nw/sw square handles were filtered out, and the black-box
 * pool's click-to-select edge band had no `onLeft` case. Dead in four places,
 * alive in none. It is one rule now, in `resizeEdges.ts`.
 *
 * And then:
 *
 *   "When a Pool is selected and the arrow keys are used to move it part of
 *    the content disappears. Lanes, sublanes and sequence connectors
 *    disappear, other elements remain visible?"
 *   "I have to click elsewhere and then again on the Pool header for
 *    everything to return to view??"
 *
 * Two faults, compounding. `moveElement` marks the element and its descendants
 * as TRAVELLING so a dragged pool can ride above the diagram (his own
 * 2026-09-18 rule); the matching END clears the mark. Arrow keys called the
 * move and never the end, so a nudged pool stayed pinned to the top overlay
 * for the rest of the session — hence "click elsewhere and back". And that
 * overlay lifted the pool and its tasks but NOT its lanes and NOT its flows,
 * so an opaque pool body was drawn straight over both. Nothing had
 * disappeared; it was covered.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resizableSides, edgeIsResizable, handleIsResizable } from "@/app/lib/diagram/resizeEdges";
import { connectorTravels, LIFTED_LAYER_ORDER, liftedLayerOf } from "@/app/lib/diagram/liftedLayer";

const src = (rel: string) => readFileSync(join(process.cwd(), ...rel.split("/")), "utf8");

describe("T4636 — a pool offers all four boundaries", () => {
  it("includes the west edge", () => {
    expect(resizableSides("pool")).toContain("w");
    expect(edgeIsResizable("pool", "w")).toBe(true);
  });

  it("offers the corner handles that drag it", () => {
    for (const handle of ["w", "nw", "sw", "e", "ne", "se", "n", "s"]) {
      expect(handleIsResizable("pool", handle), handle).toBe(true);
    }
  });

  it("treats every edge-resizable shape the same way", () => {
    for (const type of ["pool", "subprocess-expanded", "process-group", "text-annotation"]) {
      expect([...resizableSides(type)].sort(), type).toEqual(["e", "n", "s", "w"]);
    }
  });

  it("ignores handle characters that are not edges", () => {
    // Guards the split(): a future "rotate" handle must not be read as edges.
    expect(handleIsResizable("pool", "rotate")).toBe(true);
  });
});

describe("T4637 — the rule is asked, not re-stated", () => {
  // "One rule, one place": the reinstatement is only safe if the canvas asks
  // resizeEdges.ts rather than carrying its own copy of the answer. These two
  // files held four copies between them.
  const CANVAS = src("app/components/canvas/Canvas.tsx");
  const SYMBOLS = src("app/components/canvas/SymbolRenderer.tsx");

  it("has no hand-written west-edge suppression left", () => {
    for (const [name, text] of [["Canvas.tsx", CANVAS], ["SymbolRenderer.tsx", SYMBOLS]] as const) {
      expect(text, `${name} still suppresses a pool's west edge`)
        .not.toMatch(/pool"\s*&&\s*(edge\.side|handle)\s*===\s*"w"/);
      expect(text, `${name} still drops the west square handles`)
        .not.toMatch(/handle === "w" \|\| handle === "nw"/);
    }
  });

  it("asks the shared rule in every edge list", () => {
    expect(CANVAS).toMatch(/edgeIsResizable\(el\.type, edge\.side/);
    expect(SYMBOLS).toMatch(/edgeIsResizable\(element\.type, edge\.side/);
    expect(SYMBOLS).toMatch(/handleIsResizable\(element\.type, handle\)/);
  });

  it("lets a click on the LEFT edge select a black-box pool", () => {
    // The edge band that turns a click near a boundary into a selection had
    // onRight / onTop / onBottom and a comment where onLeft should be. Pin
    // THAT branch, not the white-box one above it — three branches in this
    // file test the same four edge names, and a first-match search passes
    // happily while the one that matters is still broken.
    const anchor = SYMBOLS.indexOf("// Select, but never TOGGLE OFF here");
    expect(anchor, "black-box pool edge band not found").toBeGreaterThan(-1);
    const branch = SYMBOLS.slice(SYMBOLS.lastIndexOf("const TOL = 10;", anchor), anchor);
    expect(branch, "no onLeft case in the black-box pool edge band")
      .toMatch(/const onLeft\s+= Math\.abs\(px - element\.x\) <= TOL;/);
    expect(branch, "the left edge does not select the pool")
      .toMatch(/if \(inX && inY && \(onLeft \|\| onRight \|\| onTop \|\| onBottom\)\)/);
  });
});

describe("T4638 — a connector rises only when both its ends do", () => {
  const lifted = (ids: string[]) => (id: string) => ids.includes(id);

  it("travels when the whole flow is inside the moving group", () => {
    expect(connectorTravels({ sourceId: "a", targetId: "b" }, lifted(["a", "b"]))).toBe(true);
  });

  it("stays behind when it crosses out of the group", () => {
    expect(connectorTravels({ sourceId: "a", targetId: "z" }, lifted(["a", "b"]))).toBe(false);
    expect(connectorTravels({ sourceId: "z", targetId: "b" }, lifted(["a", "b"]))).toBe(false);
  });

  it("nothing travels when nothing is lifted", () => {
    expect(connectorTravels({ sourceId: "a", targetId: "b" }, lifted([]))).toBe(false);
  });

  it("draws the lifted group in the diagram's own order", () => {
    expect(LIFTED_LAYER_ORDER).toEqual(["container", "lane", "connector", "element"]);
    expect(liftedLayerOf("lane")).toBeGreaterThan(liftedLayerOf("container"));
    expect(liftedLayerOf("element")).toBeGreaterThan(liftedLayerOf("connector"));
  });
});

describe("T4639 — the canvas lifts all of it, and a nudge lets go", () => {
  const CANVAS = src("app/components/canvas/Canvas.tsx");

  it("carries the lanes and the flows up with the pool", () => {
    const at = CANVAS.indexOf("liftedIds && liftedIds.length > 0 && (");
    expect(at, "no lifted overlay").toBeGreaterThan(-1);
    const overlay = CANVAS.slice(at, at + 2500);
    expect(overlay, "lanes are not lifted").toMatch(/lanes\s*\.?\s*filter\(el => isLifted\(el\.id\)\)/);
    expect(overlay, "the pool's own flows are not lifted").toMatch(/isLiftedConn\(c\)/);
    expect(overlay, "elements are not lifted").toMatch(/nonContainers[\s\S]{0,80}isLifted\(el\.id\)/);
  });

  it("holds those flows back from the normal pass, so they draw once", () => {
    expect(CANVAS).toMatch(/c\.id !== selectedConnectorId && !isLiftedConn\(c\)/);
    expect(CANVAS).toMatch(/lanes\.filter\(el => !inActiveGroup\(el\.id\) && !isLifted\(el\.id\)\)/);
  });

  it("ends the move on every arrow-key nudge", () => {
    // Without the END the travelling mark is never cleared and the pool stays
    // in the top overlay for good — "I have to click elsewhere and then again
    // on the Pool header for everything to return to view".
    expect(CANVAS).toMatch(/onMoveElement\(selId, x, y\); onElementMoveEnd\?\.\(selId\);/);
    expect(CANVAS).toMatch(/onMoveElements\(ids, dx, dy\); onElementsMoveEnd\?\.\(\);/);
    const at = CANVAS.indexOf("function handleKeyDown");
    const body = CANVAS.slice(at, at + 2600);
    // Every arrow goes through the helper that ends the move — none may call
    // onMoveElement / onMoveElements directly any more.
    expect(body).not.toMatch(/Arrow(Left|Right|Up|Down)"\)\s*\{ e\.preventDefault\(\); onMoveElements?\(/);
  });
});
