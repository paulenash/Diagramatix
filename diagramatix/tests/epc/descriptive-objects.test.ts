/**
 * The six things Paul asked for on 2026-09-11, and the wider ARIS object set.
 *
 * Most of these are UI facts a unit test cannot reach — a palette section, a
 * dropdown that must not appear, a marker drawn at the bottom of a shape — so
 * they are source-text tripwires. That is the right tool here: the thing that
 * regresses is somebody adding an eleventh symbol and forgetting one of the
 * five places a symbol has to be registered, and every one of those places is
 * a table or a switch that still compiles when it is wrong.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { EPC_DESCRIPTIVE_SYMBOLS, getSymbolDefinition } from "@/app/lib/diagram/symbols/definitions";
import { DEFAULT_SYMBOL_COLORS, BW_SYMBOL_COLORS } from "@/app/lib/diagram/colors";
import { canConnect } from "@/app/lib/diagram/canConnect";
import { fitShapeToLabel, freeLinesFor, wrapShapeLabel } from "@/app/lib/diagram/shapeFit";
import { layoutEpcDiagram } from "@/app/lib/diagram/layoutEpc";
import { translateEpcToBpmn } from "@/app/lib/diagram/translate/epcToBpmn";
import type { DiagramElement, SymbolType } from "@/app/lib/diagram/types";

const read = (p: string) => readFileSync(p, "utf8");
const el = (id: string, type: string): DiagramElement => ({
  id, type: type as SymbolType, label: id, x: 0, y: 0, width: 150, height: 50, properties: {},
});

describe("item 6 — the descriptive objects are registered everywhere", () => {
  it("T4126 - all ten are declared, coloured and sized", () => {
    // Five places a symbol has to appear, and the compiler only catches three
    // of them. The two exhaustive Records DO fail to compile when one is
    // missing — this asserts the values are sane, not merely present.
    expect(EPC_DESCRIPTIVE_SYMBOLS).toHaveLength(10);
    for (const t of EPC_DESCRIPTIVE_SYMBOLS) {
      const def = getSymbolDefinition(t);
      expect(def.label, `${t} has no label`).toBeTruthy();
      expect(def.description, `${t} has no description`).toBeTruthy();
      expect(def.defaultWidth).toBeGreaterThan(0);
      expect(DEFAULT_SYMBOL_COLORS[t], `${t} has no colour`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(BW_SYMBOL_COLORS[t], `${t} has no B&W colour`).toBe("#ffffff");
    }
  });

  it("T4127 - every one draws its own shape, in the canvas AND the palette", () => {
    // Without a palette case the switch falls through to a plain rectangle, so
    // ten distinct symbols look identical and the palette teaches the notation
    // wrongly. It compiles either way, which is why this is a tripwire.
    const renderer = read("app/components/canvas/SymbolRenderer.tsx");
    const palette = read("app/components/canvas/Palette.tsx");
    for (const t of [...EPC_DESCRIPTIVE_SYMBOLS,
      "epc-event", "epc-function", "epc-xor", "epc-and", "epc-or",
      "epc-org-unit", "epc-position", "epc-data", "epc-application", "epc-interface"] as SymbolType[]) {
      expect(renderer, `${t} has no canvas shape`).toContain(`case "${t}":`);
      expect(palette, `${t} has no palette preview`).toContain(`case "${t}":`);
    }
  });

  it("T4128 - the palette section exists and is CLOSED by default", () => {
    const palette = read("app/components/canvas/Palette.tsx");
    expect(palette).toContain("Descriptive Objects");
    // Closed by default is the whole point: a real EPC uses two or three of
    // these, and ten more shapes beside the core ten would bury the notation.
    expect(palette, "the section must start collapsed")
      .toContain("const [descriptiveOpen, setDescriptiveOpen] = useState(false)");
    expect(palette, "the section must only appear on an EPC")
      .toContain('diagramType === "epc"');
  });

  it("T4129 - none of them may sit on the control flow", () => {
    // E6, and the argument for whitelists: the control-flow rule names its six
    // members rather than listing what is banned, so ten new symbols were
    // refused the moment they existed and canConnect needed no new line. A
    // DESCRIPTIVE object describes a function; it is never a step in the flow.
    for (const t of EPC_DESCRIPTIVE_SYMBOLS) {
      expect(canConnect(el("a", t), el("b", "epc-function"), "epc-control-flow", []),
        `${t} was allowed on the control flow`).toBe(false);
      expect(canConnect(el("a", "epc-function"), el("b", t), "epc-control-flow", []),
        `${t} was allowed on the control flow`).toBe(false);
    }
  });

  it("T4130 - each attaches to a FUNCTION by an information arc, and to nothing else", () => {
    for (const t of EPC_DESCRIPTIVE_SYMBOLS) {
      expect(canConnect(el("a", t), el("b", "epc-function"), "epc-information-flow", [])).toBe(true);
      // Never to an event: nothing is measured, risked or delivered by a state.
      expect(canConnect(el("a", t), el("b", "epc-event"), "epc-information-flow", []),
        `${t} was allowed to attach to an event`).toBe(false);
    }
  });

  it("T4131 - none becomes a BPMN object, because BPMN has none", () => {
    // The tempting wrong answer is a task or a data object. Either would put a
    // thing in the process that is not a step in it.
    const { aiElements, report } = translateEpcToBpmn({
      elements: [
        el("e0", "epc-event"), el("f1", "epc-function"), el("e1", "epc-event"),
        { ...el("k1", "epc-kpi"), label: "Order cycle time" },
        { ...el("r1", "epc-risk"), label: "Stale credit data" },
      ],
      connectors: [
        { id: "c1", sourceId: "e0", targetId: "f1", type: "epc-control-flow" },
        { id: "c2", sourceId: "f1", targetId: "e1", type: "epc-control-flow" },
        { id: "c3", sourceId: "k1", targetId: "f1", type: "epc-information-flow" },
        { id: "c4", sourceId: "r1", targetId: "f1", type: "epc-information-flow" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    }, { processName: "P" });

    expect(report.taskCount, "an annotation became a task").toBe(1); // the function only
    const notes = aiElements.filter((e) => e.type === "text-annotation");
    expect(notes.map((n) => n.label).sort()).toEqual(["KPI: Order cycle time", "Risk: Stale credit data"]);
    expect(report.annotationCount).toBe(2);
    // Reported, so ten annotations do not appear from nowhere.
    expect(report.approximations.join(" ")).toMatch(/text annotation/);
  });
});

describe("item 5 — wrap first, grow second", () => {
  // The rule is shared with the Standard Flowchart shapes (shapeFit.ts) — these
  // assert the EPC end of it, and tests/flowchart/label-fit.test.ts the other.
  it("T4132 - a short name does not change the shape at all", () => {
    const def = getSymbolDefinition("epc-function");
    expect(fitShapeToLabel("epc-function", "Verify invoice"))
      .toEqual({ w: def.defaultWidth, h: def.defaultHeight });
  });

  it("T4133 - two lines still fit; three grow the box DOWNWARD only", () => {
    const def = getSymbolDefinition("epc-function");
    const two = "Verify the supplier invoice";
    const many = "Verify the supplier invoice against the purchase order and the goods receipt note before posting";
    expect(wrapShapeLabel("epc-function", two, def.defaultWidth).length).toBeLessThanOrEqual(2);
    expect(fitShapeToLabel("epc-function", two).h).toBe(def.defaultHeight);

    const grown = fitShapeToLabel("epc-function", many);
    expect(wrapShapeLabel("epc-function", many, def.defaultWidth).length).toBeGreaterThan(2);
    expect(grown.h).toBeGreaterThan(def.defaultHeight);
    // WIDTH never changes. Growing it sideways would move the assignment
    // gutters layoutEpc reserves either side of the spine, so one long name
    // would shove every branch's satellites out of column.
    expect(grown.w).toBe(def.defaultWidth);
  });

  it("T4134 - a Process Interface holds ONE line, because its bottom is the link marker", () => {
    expect(freeLinesFor("epc-interface")).toBe(1);
    expect(freeLinesFor("epc-function")).toBe(2);
    expect(freeLinesFor("epc-event")).toBe(2);
    const def = getSymbolDefinition("epc-interface");
    const twoLines = "Accounts Receivable and Collections";
    expect(wrapShapeLabel("epc-interface", twoLines, def.defaultWidth).length).toBeGreaterThan(1);
    expect(
      fitShapeToLabel("epc-interface", twoLines).h,
      "a two-line interface name must grow the box",
    ).toBeGreaterThan(def.defaultHeight);
  });

  it("T4135 - the renderer wraps to the SAME width the sizing measured", () => {
    // If they disagree, a box grown for three lines renders four and the text
    // hangs out of the shape it was grown to fit.
    const renderer = read("app/components/canvas/SymbolRenderer.tsx");
    expect(renderer, "the renderer must use the shared wrap").toContain("wrapShapeLabel(");
    expect(renderer, "the interface's text must clear its marker").toContain("EPC_LINK_MARKER_H");
    // …and typing a name by hand must resize the box too, not only generation.
    expect(read("app/hooks/useDiagram.ts"), "hand-typed names must autosize").toContain("fitShapeToLabel(");
  });
});

describe("items 3 and 4 — the arrowhead, and the drill-down", () => {
  it("T4136 - a control-flow arc is OPEN, and Properties offers no choice", () => {
    const props = read("app/components/canvas/PropertiesPanel.tsx");
    expect(props, "the direction dropdown must be suppressed for an EPC control flow")
      .toContain('connector.type === "epc-control-flow"');
    expect(props).toContain("Open (fixed by the notation)");
    // The canvas must CREATE them open, or the gate above hides a filled one.
    expect(read("app/components/canvas/Canvas.tsx"))
      .toMatch(/connType = "epc-control-flow"; connRouting = defaultRoutingType; connDirection = "open-directed"/);
  });

  it("T4137 - a Process Interface links to another EPC, and drills in", () => {
    const props = read("app/components/canvas/PropertiesPanel.tsx");
    expect(props, "no link picker").toContain('element.type === "epc-interface" && siblingDiagrams');
    // Filtered to EPC siblings: a process interface continues in another EPC.
    expect(props).toContain('siblingDiagrams.filter(d => d.type === "epc")');
    // Both drill gates — the one on a selected element and the one on the
    // canvas body. Getting only one is the shape of a bug nobody reports,
    // because it works right up until the element is selected.
    const canvas = read("app/components/canvas/Canvas.tsx");
    expect((canvas.match(/el\.type === "epc-interface"/g) ?? []).length).toBe(2);
    // And the marker is only drawn when a link is actually set.
    expect(read("app/components/canvas/SymbolRenderer.tsx"))
      .toContain("const hasLink = !!(el.properties?.linkedDiagramId as string | undefined);");
  });
});

describe("item 1 — the annotations land beside the function, not in the chain", () => {
  it("T4138 - a KPI on a function is drawn as a KPI, on the right", () => {
    const data = layoutEpcDiagram({
      elements: [
        { id: "e0", type: "event", label: "Started" },
        { id: "f1", type: "function", label: "Do it", org: "Ops", kpi: ["Cycle time"], risk: ["Stale data"], data: ["Order"] },
        { id: "e1", type: "event", label: "Done" },
      ],
      connections: [{ sourceId: "e0", targetId: "f1" }, { sourceId: "f1", targetId: "e1" }],
    });
    const fn = data.elements.find((e) => e.id === "f1")!;
    const kpi = data.elements.find((e) => e.type === "epc-kpi");
    const risk = data.elements.find((e) => e.type === "epc-risk");
    expect(kpi?.label).toBe("Cycle time");
    expect(risk?.label).toBe("Stale data");
    // Right, beside the org unit: they say something ABOUT the function, which
    // is the same side of the sentence the responsible party is on. The left
    // stays for what the function reads and writes.
    expect(kpi!.x).toBeGreaterThan(fn.x + fn.width);
    expect(risk!.x).toBeGreaterThan(fn.x + fn.width);
    const info = data.elements.find((e) => e.type === "epc-data")!;
    expect(info.x + info.width).toBeLessThan(fn.x);
  });
});
