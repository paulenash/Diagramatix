/**
 * Paul, 2026-09-17, two asks about editing a label:
 *
 *  1. While the text is being edited, hide the dashed border. It frames the OLD
 *     text while you type the new one, which reads as a second, stale field
 *     sitting next to the editor. It appears on events, gateways, data objects,
 *     data stores, messages and connectors — everything whose label is drawn
 *     outside the shape.
 *
 *  2. Double-clicking anything with a label should open that label for editing.
 *     Several element types already did; the gateway shape, the pain-point /
 *     issue marker overlay, and the connector LINE did not.
 *
 * The gateway is the one that needed care rather than a blanket change: a
 * double-click on a gateway fans a group selection out of it, which is a
 * shipped feature. So the fan-out still wins, and the label editor only opens
 * when there is no group to fan — which is precisely when the double-click
 * used to do nothing at all.
 *
 * These are source-level guards. Both behaviours live in SVG event handlers and
 * a React memo boundary that the node test environment cannot exercise; what
 * regresses is the wiring, which is what is pinned.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const canvas = read("app/components/canvas/Canvas.tsx");
const symbols = read("app/components/canvas/SymbolRenderer.tsx");
const connectors = read("app/components/canvas/ConnectorRenderer.tsx");

describe("editing a label", () => {
  it("T4451 — the dashed label box is hidden while that label is being edited", () => {
    // The element side: the box is drawn only when the label is highlighted,
    // selected, singly selected AND not currently being edited.
    expect(symbols, "the stroke must drop out while editing").toMatch(
      /stroke=\{labelHighlighted && selected && !multiSelected && !isLabelEditing/,
    );
    expect(symbols, "and so must the dash pattern").toMatch(
      /strokeDasharray=\{labelHighlighted && selected && !multiSelected && !isLabelEditing/,
    );
    // No copy of the old condition may survive, or one of the two borders stays.
    expect(
      /(?:stroke|strokeDasharray)=\{labelHighlighted && selected && !multiSelected \?/.test(symbols),
      "a label border still ignores the editing state",
    ).toBe(false);
    expect(symbols, "the flag has to be a declared prop").toMatch(/isLabelEditing\?: boolean;/);
    expect(symbols, "and destructured with a safe default").toMatch(/isLabelEditing = false,/);

    // The connector side uses its own local editing state.
    expect(connectors).toMatch(/stroke=\{\(selected \|\| isLabelFocused\) && !isEditing \? "#2563eb"/);
    expect(connectors).toMatch(/strokeDasharray=\{\(selected \|\| isLabelFocused\) && !isEditing \? "4 3"/);
  });

  it("T4452 — every element renderer is told whether its own label is the one being edited", () => {
    const renderers = (canvas.match(/<SymbolRenderer/g) ?? []).length;
    const flagged = (canvas.match(/isLabelEditing=\{editingLabel\?\.elementId === el\.id\}/g) ?? []).length;
    expect(renderers, "sanity: the canvas renders elements in several passes").toBeGreaterThan(5);
    expect(flagged, "a renderer without the flag keeps its dashed box while you type").toBe(renderers);
  });

  it("T4453 — a double-click opens the label editor on every element that has one", () => {
    // No handler may silently do nothing: that was the pain-point / issue
    // marker, which sits on top of its element and swallowed the double-click.
    expect(
      /onDoubleClick=\{\(\) => \{\}\}/.test(canvas),
      "an element overlay is swallowing the double-click instead of editing the label",
    ).toBe(false);

    // The gateway's fan-out still comes first, and the editor is the fallback
    // rather than a replacement.
    expect(
      /Gateway shape double-click never opens the label editor/.test(canvas),
      "the gateway opt-out should be gone",
    ).toBe(false);
    expect(canvas, "fan-out first, then the label editor").toMatch(
      /onDoubleClick=\{\(\) => \{ if \(tryGroupConnectToGateway\(el\)\) return; startEditingLabel\(el\); \}\}/,
    );
  });

  it("T4454 — double-clicking a connector's LINE opens its label editor, not only the label box", () => {
    expect(connectors, "the line raises a request").toMatch(/onDoubleClick=\{\(e\) => \{ e\.stopPropagation\(\); setLabelEditRequest\(\(n\) => n \+ 1\); \}\}/);
    expect(connectors, "which is passed to the label").toMatch(/editRequest=\{labelEditRequest\}/);
    expect(connectors, "and opens the same editor the label box opens").toMatch(/setIsEditing\(true\);/);
    // It must not fire on first render, or every drawn connector would open an
    // editor just by appearing.
    expect(connectors, "the first render is skipped").toMatch(/seenEditRequest/);
    expect(connectors).toMatch(/if \(editRequest === undefined \|\| editRequest === seenEditRequest\.current\) return;/);
  });
});
