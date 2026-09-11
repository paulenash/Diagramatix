/**
 * Paul, 2026-09-11: "Diagrams created from images are not wrapping the element
 * names into the shape", and "these shapes also need to grow if the wrapped
 * text does not fit."
 *
 * Both were true, and the first was the cause of the second LOOKING broken:
 * `layoutFlowchartDiagram` already grew a box for a long name, but the renderer
 * drew that name as ONE unwrapped line running straight through the sides of
 * the shape — so the extra height was spent on nothing.
 *
 * It showed up on diagrams built from an image because those carry somebody's
 * real wording ("Determine whether the applicant meets the eligibility
 * criteria") rather than the short phrases a typed prompt produces. The bug was
 * never about images.
 *
 * The rule is now shared with EPC (app/lib/diagram/shapeFit.ts). These assert
 * the flowchart end of it; tests/epc/descriptive-objects.test.ts the other.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  fitShapeToLabel,
  freeLinesFor,
  holdsInternalLabel,
  textWidthFor,
  wrapShapeLabel,
} from "@/app/lib/diagram/shapeFit";
import { layoutFlowchartDiagram } from "@/app/lib/diagram/layoutFlowchart";
import { getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";
import { LINE_HEIGHT } from "@/app/lib/diagram/textMetrics";

/** The kind of name a diagram built from an image actually carries. */
const LONG = "Determine whether the applicant meets the eligibility criteria";

/** Every flowchart shape that holds its name inside the box. */
const FITTED = [
  "flowchart-process", "flowchart-terminator", "flowchart-io", "flowchart-document",
  "flowchart-multidoc", "flowchart-predefined", "flowchart-preparation",
  "flowchart-manual-input", "flowchart-manual-op", "flowchart-display",
  "flowchart-delay", "flowchart-database", "flowchart-offpage", "flowchart-onpage",
  "flowchart-comment",
];

describe("a flowchart name wraps inside its shape", () => {
  it("T4155 - the renderer wraps, rather than drawing one long line", () => {
    // The defect itself. Flowchart types fell through to `.split('\\n')`, which
    // only breaks on newlines somebody typed — so a long name was one line.
    const src = readFileSync("app/components/canvas/SymbolRenderer.tsx", "utf8");
    expect(src, "the renderer must use the shared wrap").toContain("wrapShapeLabel(");
    expect(src, "flowchart shapes must be inside the wrapping branch")
      .toContain('element.type.startsWith("flowchart-")');
  });

  it("T4156 - it wraps to the shape's USABLE width, not its bounding box", () => {
    // A parallelogram loses 40% of its box to the taper and a cylinder loses
    // its ellipses. Measuring against the bounding box is how text ends up
    // outside a shape that is supposedly big enough — the old code used
    // `defaultWidth - 16` for every shape alike.
    const w = 140;
    expect(textWidthFor("flowchart-io", w), "a parallelogram's taper is not free")
      .toBeLessThan(textWidthFor("flowchart-process", w));
    expect(textWidthFor("flowchart-manual-op", w))
      .toBeLessThan(textWidthFor("flowchart-process", w));
    // …and never so tight that a word cannot fit.
    for (const t of FITTED) expect(textWidthFor(t, getSymbolDefinition(t as never).defaultWidth)).toBeGreaterThanOrEqual(24);
  });

  it("T4157 - a long name really does become several lines", () => {
    for (const t of FITTED) {
      const def = getSymbolDefinition(t as never);
      const lines = wrapShapeLabel(t, LONG, def.defaultWidth);
      expect(lines.length, `${t} did not wrap "${LONG}"`).toBeGreaterThan(1);
    }
  });
});

describe("…and the shape grows when the wrapped text does not fit", () => {
  it("T4158 - a short name changes nothing", () => {
    for (const t of FITTED) {
      const def = getSymbolDefinition(t as never);
      expect(fitShapeToLabel(t, "Check"), `${t} grew for a short name`)
        .toEqual({ w: def.defaultWidth, h: def.defaultHeight });
    }
  });

  it("T4159 - a name past the free-line count grows the box DOWNWARD only", () => {
    for (const t of FITTED) {
      const def = getSymbolDefinition(t as never);
      const free = freeLinesFor(t);
      const lines = wrapShapeLabel(t, LONG, def.defaultWidth);
      const fitted = fitShapeToLabel(t, LONG);
      // Width never changes: a wider box would push its neighbours apart in the
      // rank, so one long name would re-space the whole diagram.
      expect(fitted.w, `${t} changed width`).toBe(def.defaultWidth);
      if (lines.length > free) {
        expect(fitted.h, `${t} did not grow for ${lines.length} lines`).toBeGreaterThan(def.defaultHeight);
      } else {
        expect(fitted.h, `${t} grew when ${lines.length} lines still fit`).toBe(def.defaultHeight);
      }
    }
  });

  it("T4160 - the grown box actually holds the lines it was grown for", () => {
    // The property that matters, stated directly: after growing, the wrapped
    // block fits inside the interior. A box grown by the wrong amount is the
    // same bug as not growing at all.
    for (const t of FITTED) {
      const { w, h } = fitShapeToLabel(t, LONG);
      const lines = wrapShapeLabel(t, LONG, w);
      expect(lines.length * LINE_HEIGHT, `${t}: ${lines.length} lines do not fit ${h}px`)
        .toBeLessThanOrEqual(h);
    }
  });

  it("T4161 - shapes that hold no name are never grown", () => {
    // A Parallel bar is 8px of fork/join marker; growing it for a label it does
    // not draw would turn a bar into a block. A Decision draws and wraps its
    // OWN text and grows on both axes to keep the diamond's aspect, so it is
    // deliberately outside the shared rule.
    for (const t of ["flowchart-parallel", "flowchart-decision", "flowchart-vswimlane", "flowchart-merge"]) {
      expect(holdsInternalLabel(t), `${t} should be outside the shared rule`).toBe(false);
      const def = getSymbolDefinition(t as never);
      expect(fitShapeToLabel(t, LONG)).toEqual({ w: def.defaultWidth, h: def.defaultHeight });
    }
  });
});

describe("a generated flowchart carries it end to end", () => {
  it("T4162 - the layout sizes boxes to the names the AI produced", () => {
    // The path a diagram built from an image takes: plan → layoutFlowchartDiagram.
    const data = layoutFlowchartDiagram({
      elements: [
        { id: "s", type: "terminator", label: "Start" },
        { id: "p", type: "process", label: LONG },
        { id: "d", type: "document", label: "Signed application form and supporting evidence" },
        { id: "e", type: "terminator", label: "End" },
      ],
      connections: [
        { sourceId: "s", targetId: "p" },
        { sourceId: "p", targetId: "d" },
        { sourceId: "d", targetId: "e" },
      ],
    });
    const at = (id: string) => data.elements.find((e) => e.id === id)!;
    const proc = getSymbolDefinition("flowchart-process");

    expect(at("p").height, "the long step was not grown").toBeGreaterThan(proc.defaultHeight);
    expect(at("p").width, "the long step changed width").toBe(proc.defaultWidth);
    expect(at("s").height, "a short terminator should be untouched")
      .toBe(getSymbolDefinition("flowchart-terminator").defaultHeight);

    // And what the renderer will draw fits what the layout produced — the two
    // measure with the same function, which is the whole point of sharing it.
    for (const id of ["p", "d"]) {
      const el = at(id);
      const lines = wrapShapeLabel(el.type, el.label ?? "", el.width);
      expect(lines.length * LINE_HEIGHT, `${id} overflows the box it was grown to fit`)
        .toBeLessThanOrEqual(el.height);
    }
  });

  it("T4163 - a hand-typed name resizes the box too, not only a generated one", () => {
    // Otherwise the rule holds for diagrams the AI made and quietly stops
    // applying the moment somebody edits one.
    const src = readFileSync("app/hooks/useDiagram.ts", "utf8");
    expect(src).toContain("fitShapeToLabel(");
    expect(src, "flowchart shapes must autosize on a label edit")
      .toContain('el.type.startsWith("flowchart-")');
  });
});
